// Minimal twitterapi.io client: the advanced-search endpoint only.
//
// twitterapi.io is an unofficial reseller of X data (priced per returned
// tweet, 15-credit minimum per call), so every response is treated as
// untrusted: validated with Zod, bounded in size, and malformed tweets are
// dropped individually rather than failing the page. The API key travels only
// in the request header — never in a URL, a log line, or an error message.

import { z } from 'zod';

const TWITTERAPI_ORIGIN = 'https://api.twitterapi.io';
const SEARCH_PATH = '/twitter/tweet/advanced_search';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_CHARS = 5_000_000;
const MAX_TWEETS_PER_PAGE = 200;

export class TwitterApiError extends Error {
  constructor(
    /** HTTP status, or null for network/timeout/parse failures. */
    readonly status: number | null,
    message: string
  ) {
    super(message);
    this.name = 'TwitterApiError';
  }
}

// Strings only: a 19-digit id sent as a JSON number has already lost precision
// in JSON.parse, which would mean a wrong link and a false dedupe match.
const idSchema = z.string().regex(/^\d{1,25}$/);

const authorSchema = z.object({ userName: z.string().max(64) });

const quotedTweetSchema = z.object({
  id: idSchema,
  text: z.string().max(100_000).nullish(),
  author: authorSchema.nullish(),
});

const entitiesSchema = z.object({
  symbols: z
    .array(z.object({ text: z.string().max(32) }))
    .max(100)
    .nullish(),
  urls: z
    .array(z.object({ expanded_url: z.string().max(4096).nullish() }))
    .max(100)
    .nullish(),
});

export const rawTweetSchema = z.object({
  id: idSchema,
  text: z.string().max(100_000).nullish(),
  createdAt: z.string().max(64).nullish(),
  isReply: z.boolean().nullish(),
  lang: z.string().max(16).nullish(),
  author: authorSchema,
  // Enrichment-only fields degrade to "absent" rather than dropping the tweet.
  entities: entitiesSchema.nullish().catch(null),
  quoted_tweet: quotedTweetSchema.nullish().catch(null),
  retweeted_tweet: z.unknown().optional(),
});

export type RawTweet = z.infer<typeof rawTweetSchema>;

// `tweets` is required: an error body sent with HTTP 200 must fail loudly,
// never read as "no new posts".
const searchResponseSchema = z.object({
  tweets: z.array(z.unknown()).max(MAX_TWEETS_PER_PAGE),
  has_next_page: z.boolean().nullish(),
  next_cursor: z.string().max(4096).nullish(),
});

export interface SearchPage {
  tweets: RawTweet[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

/** One page of X's "Latest" search, newest first (up to 20 tweets). */
export async function searchLatestTweets(
  apiKey: string,
  query: string,
  cursor: string | null
): Promise<SearchPage> {
  const url = new URL(SEARCH_PATH, TWITTERAPI_ORIGIN);
  url.searchParams.set('query', query);
  url.searchParams.set('queryType', 'Latest');
  if (cursor) url.searchParams.set('cursor', cursor);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      // fetch forwards custom headers across a cross-origin redirect, so a
      // redirect would hand the key to another host: refuse instead.
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new TwitterApiError(null, err instanceof Error ? err.name : 'request failed');
  }
  // Error bodies are never read into messages: they are untrusted and unneeded.
  if (!response.ok) throw new TwitterApiError(response.status, `HTTP ${response.status}`);

  const body = await response.text();
  if (body.length > MAX_BODY_CHARS) throw new TwitterApiError(response.status, 'oversized body');
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new TwitterApiError(response.status, 'non-JSON body');
  }
  const parsed = searchResponseSchema.safeParse(json);
  if (!parsed.success) throw new TwitterApiError(response.status, 'unexpected response shape');

  const tweets = parsed.data.tweets.flatMap((raw) => {
    const tweet = rawTweetSchema.safeParse(raw);
    return tweet.success ? [tweet.data] : [];
  });
  // One malformed tweet is noise; a page where none parse means the provider's
  // shape changed, and collection would otherwise fail silently forever.
  if (parsed.data.tweets.length > 0 && tweets.length === 0) {
    throw new TwitterApiError(response.status, 'no tweet in the page matched the expected shape');
  }
  return {
    tweets,
    hasNextPage: parsed.data.has_next_page === true,
    nextCursor: parsed.data.next_cursor || null,
  };
}
