// Collects posts from the X source roster through twitterapi.io.
//
// Portfolio-independent by design: a query holds only roster handles and a
// timestamp, so the provider never learns what anyone holds. Holdings are
// matched against stored posts when the feed is read (xPostMatching.ts).
//
// Cost model (priced per returned tweet, 15-credit minimum per call): one
// batched `(from:a OR from:b …)` search per ~8 handles, reading only posts
// newer than that batch's newest stored post. Polling each account's timeline
// instead would re-buy 20 tweets per account per poll — about 100x the cost.

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getXNewsSources, twitterApiKey, X_HANDLE_PATTERN, type XSource } from './xSources.js';
import { searchLatestTweets, TwitterApiError, type RawTweet } from './twitterApi.js';
import { cleanPostText, extractCashtags, linksExternalSource } from './xPostText.js';

// X search truncates or rejects long OR-chains. Handles are at most 15
// characters, so 8 per query keeps every query under ~250 characters.
const MAX_HANDLES_PER_QUERY = 8;
const MAX_PAGES_PER_BATCH = 10;
// Search indexing lags posting, so each poll re-reads a little behind the newest post.
const POLL_OVERLAP_MS = 10 * 60 * 1000;
export const DEFAULT_CATCH_UP_DAYS = 2;
export const MAX_CATCH_UP_DAYS = 14;
// Circuit breaker (see dailyCallBudget): a 35-handle roster is 5 batches × 96
// polls ≈ 480 calls a day in steady state.
const MIN_DAILY_CALL_BUDGET = 1000;
const POLLS_PER_DAY = 96;
const REJECTED_KEY_BACKOFF_MS = 60 * 60 * 1000;
const RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
const FUTURE_SKEW_MS = 15 * 60 * 1000;
const MAX_TEXT_CHARS = 4000;
const MAX_QUOTED_TEXT_CHARS = 1000;
export const X_POST_RETENTION_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface XPostRow {
  id: string;
  authorHandle: string;
  authorKey: string;
  text: string;
  quotedPostId: string | null;
  quotedHandle: string | null;
  quotedText: string | null;
  hasExternalLink: boolean;
  cashtags: string[];
  lang: string | null;
  postedAt: Date;
}

export interface XCollectResult {
  status: 'ok' | 'disabled' | 'busy' | 'paused';
  calls: number;
  stored: number;
  failedBatches: number;
  /** Batches that hit the page cap, so older posts in their window were skipped. */
  truncatedBatches: number;
}

/** Handles grouped (in a stable order) into search queries short enough for X. */
export function batchXSources(sources: readonly XSource[]): XSource[][] {
  const sorted = [...sources].sort((a, b) => a.key.localeCompare(b.key));
  const batches: XSource[][] = [];
  for (let i = 0; i < sorted.length; i += MAX_HANDLES_PER_QUERY) {
    batches.push(sorted.slice(i, i + MAX_HANDLES_PER_QUERY));
  }
  return batches;
}

export function buildXSearchQuery(handles: readonly string[], sinceUnixSeconds: number): string {
  const authors = handles.map((handle) => `from:${handle}`).join(' OR ');
  return `(${authors}) since_time:${sinceUnixSeconds} -filter:replies`;
}

/** Maps a search result to a stored row; null for replies, reposts and non-roster authors. */
export function toXPostRow(
  tweet: RawTweet,
  rosterKeys: ReadonlySet<string>,
  nowMs: number
): XPostRow | null {
  const handle = tweet.author.userName;
  if (!X_HANDLE_PATTERN.test(handle)) return null;
  const authorKey = handle.toLowerCase();
  if (!rosterKeys.has(authorKey)) return null;
  if (tweet.isReply === true || tweet.retweeted_tweet) return null;

  const postedMs = Date.parse(tweet.createdAt ?? '');
  if (Number.isNaN(postedMs) || postedMs > nowMs + FUTURE_SKEW_MS) return null;

  const text = cleanPostText(tweet.text ?? '', MAX_TEXT_CHARS);
  const quoted = tweet.quoted_tweet ?? null;
  const quotedHandle = quoted?.author?.userName ?? null;
  const quotedText = quoted ? cleanPostText(quoted.text ?? '', MAX_QUOTED_TEXT_CHARS) : '';
  return {
    id: tweet.id,
    authorHandle: handle,
    authorKey,
    text,
    quotedPostId: quoted?.id ?? null,
    quotedHandle: quotedHandle && X_HANDLE_PATTERN.test(quotedHandle) ? quotedHandle : null,
    quotedText: quotedText.length > 0 ? quotedText : null,
    hasExternalLink: linksExternalSource(tweet.entities?.urls ?? []),
    cashtags: extractCashtags(text, tweet.entities?.symbols ?? []),
    lang: tweet.lang ?? null,
    postedAt: new Date(Math.min(postedMs, nowMs)),
  };
}

/**
 * A breaker against runaway loops, not a quota: twice what one call per batch
 * per poll needs, so a bigger roster never pauses itself on a normal day.
 */
export function dailyCallBudget(batchCount: number): number {
  return Math.max(MIN_DAILY_CALL_BUDGET, batchCount * POLLS_PER_DAY * 2);
}

function nextUtcMidnight(nowMs: number): number {
  const next = new Date(nowMs);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
}

class DailyBudgetExceeded extends Error {}

interface RunStats {
  calls: number;
  stored: number;
  truncatedBatches: number;
}

export class XPostCollector {
  private running = false;
  private pausedUntil = 0;
  private budgetDay = '';
  private callsToday = 0;
  private dailyBudget = MIN_DAILY_CALL_BUDGET;

  /** One collection pass over the whole roster. Never throws. */
  async collect(options: { catchUpDays?: number } = {}): Promise<XCollectResult> {
    const result: XCollectResult = {
      status: 'ok',
      calls: 0,
      stored: 0,
      failedBatches: 0,
      truncatedBatches: 0,
    };
    const apiKey = twitterApiKey();
    const roster = getXNewsSources();
    if (!apiKey || roster.sources.length === 0) return { ...result, status: 'disabled' };
    if (this.running) return { ...result, status: 'busy' };
    if (Date.now() < this.pausedUntil) return { ...result, status: 'paused' };

    const catchUpDays = Math.min(
      Math.max(options.catchUpDays ?? DEFAULT_CATCH_UP_DAYS, 0),
      MAX_CATCH_UP_DAYS
    );
    const rosterKeys = new Set(roster.byKey.keys());
    this.running = true;
    try {
      const batches = batchXSources(roster.sources);
      this.dailyBudget = dailyCallBudget(batches.length);
      for (const batch of batches) {
        try {
          await this.collectBatch(apiKey, batch, rosterKeys, catchUpDays, result);
        } catch (error) {
          result.failedBatches++;
          if (this.handleFailure(error)) {
            result.status = 'paused';
            break;
          }
        }
      }
    } finally {
      this.running = false;
    }
    return result;
  }

  private async collectBatch(
    apiKey: string,
    batch: XSource[],
    rosterKeys: ReadonlySet<string>,
    catchUpDays: number,
    stats: RunStats
  ): Promise<void> {
    const nowMs = Date.now();
    // Per-batch watermark from stored rows: a failed batch retries its own
    // window next poll, and nothing is kept in memory across restarts.
    const newest = await prisma.xPost.aggregate({
      _max: { postedAt: true },
      where: { authorKey: { in: batch.map((source) => source.key) } },
    });
    const floorMs = nowMs - catchUpDays * DAY_MS;
    const newestMs = newest._max.postedAt?.getTime() ?? floorMs;
    const sinceMs = Math.max(floorMs, newestMs - POLL_OVERLAP_MS);
    // Results arrive newest first, so a page that reaches an already-stored post
    // (or the window's start) means every later page is older still. X hands
    // out a next cursor even when nothing follows, so this is what keeps a
    // steady-state poll to one call per batch.
    const knownMs = Math.max(floorMs, newestMs);
    const query = buildXSearchQuery(
      batch.map((source) => source.handle),
      Math.floor(sinceMs / 1000)
    );

    const rows = new Map<string, XPostRow>();
    let cursor: string | null = null;
    let complete = false;
    for (let page = 0; page < MAX_PAGES_PER_BATCH; page++) {
      this.spendCall(nowMs);
      stats.calls++;
      const result = await searchLatestTweets(apiKey, query, cursor);
      let oldestMs = Number.POSITIVE_INFINITY;
      for (const tweet of result.tweets) {
        const postedMs = Date.parse(tweet.createdAt ?? '');
        if (!Number.isNaN(postedMs)) oldestMs = Math.min(oldestMs, postedMs);
        const row = toXPostRow(tweet, rosterKeys, nowMs);
        if (row) rows.set(row.id, row);
      }
      // The date check also guards against a provider that ignores since_time
      // and would otherwise page back through history.
      const exhausted =
        !result.hasNextPage ||
        !result.nextCursor ||
        result.nextCursor === cursor ||
        result.tweets.length === 0 ||
        oldestMs <= knownMs;
      if (exhausted) {
        complete = true;
        break;
      }
      cursor = result.nextCursor;
    }
    if (!complete) {
      stats.truncatedBatches++;
      logger.warn(
        `[XPosts] Batch hit the ${MAX_PAGES_PER_BATCH}-page cap; older posts in its window were skipped`
      );
    }
    // Written only after the batch's pages all succeeded: a mid-batch failure
    // leaves the watermark alone, so the next poll re-reads the whole window.
    if (rows.size === 0) return;
    const { count } = await prisma.xPost.createMany({
      data: [...rows.values()],
      skipDuplicates: true,
    });
    stats.stored += count;
  }

  private spendCall(nowMs: number): void {
    const day = new Date(nowMs).toISOString().slice(0, 10);
    if (day !== this.budgetDay) {
      this.budgetDay = day;
      this.callsToday = 0;
    }
    if (this.callsToday >= this.dailyBudget) throw new DailyBudgetExceeded();
    this.callsToday++;
  }

  /** Logs a batch failure; returns true when the whole run must stop (paused). */
  private handleFailure(error: unknown): boolean {
    if (error instanceof DailyBudgetExceeded) {
      this.pausedUntil = nextUtcMidnight(Date.now());
      logger.error(
        `[XPosts] Daily call budget (${this.dailyBudget}) reached; collection paused until 00:00 UTC`
      );
      return true;
    }
    if (error instanceof TwitterApiError) {
      if (error.status === 401 || error.status === 403) {
        return this.pause(REJECTED_KEY_BACKOFF_MS, 'API key rejected');
      }
      if (error.status === 402) return this.pause(REJECTED_KEY_BACKOFF_MS, 'out of credits');
      if (error.status === 429) return this.pause(RATE_LIMIT_BACKOFF_MS, 'rate limited');
    }
    logger.warn(
      `[XPosts] Batch skipped: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }

  private pause(ms: number, reason: string): true {
    this.pausedUntil = Date.now() + ms;
    logger.warn(`[XPosts] Collection paused for ${Math.round(ms / 60000)} min: ${reason}`);
    return true;
  }
}

export const xPostCollector = new XPostCollector();

/** Deletes posts older than the longest window any view reads. */
export async function pruneXPosts(nowMs = Date.now()): Promise<number> {
  const { count } = await prisma.xPost.deleteMany({
    where: { postedAt: { lt: new Date(nowMs - X_POST_RETENTION_DAYS * DAY_MS) } },
  });
  return count;
}
