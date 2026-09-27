// The X source roster for the News tab.
//
// The roster is private research (the owner's validatex `verified-ai-roster`),
// so it never lives in this public repo: it arrives through the
// X_NEWS_SOURCES env var as comma-separated `handle:allowed_use` pairs, built
// by scripts/x-news-sources.ts. Only the policy vocabulary below is public.
//
// Each validatex `allowed_use` policy maps to one of three roles, mirroring the
// roster's own ranking nuance: anchors can drive ranking, corroboration names
// can strengthen it, and radar/trial/medium-type names only surface leads
// (a holding's own page, never the main feed).

import { z } from 'zod';
import { logger } from '../../lib/logger.js';

export type XSourceRole = 'anchor' | 'corroboration' | 'radar';

interface PolicyTreatment {
  role: XSourceRole;
  /** Role when the post links a non-X source ("anchor when source-backed"). */
  sourceBackedRole?: XSourceRole;
}

// A Map, not an object literal: a lookup must never resolve "constructor".
export const X_SOURCE_POLICIES: ReadonlyMap<string, PolicyTreatment> = new Map([
  ['anchor_source', { role: 'anchor' }],
  ['anchor_when_source_backed', { role: 'corroboration', sourceBackedRole: 'anchor' }],
  // "Anchor when primary source" can't be detected from a post, and the roster
  // notes broker-note relays need verification — so stay conservative.
  ['corroboration_or_anchor_when_primary_source', { role: 'corroboration' }],
  ['high_medium_corroboration_source', { role: 'corroboration' }],
  ['corroboration_source', { role: 'corroboration' }],
  ['context_source', { role: 'corroboration' }],
  // Its dedup requirement is met by dropping roster posts that quote a roster post.
  ['core_medium_context_dedup_required', { role: 'corroboration' }],
  [
    'medium_type_context_or_source_backed_corroboration',
    { role: 'radar', sourceBackedRole: 'corroboration' },
  ],
  ['medium_type_corroboration_source', { role: 'radar' }],
  ['medium_type_corroboration_required', { role: 'radar' }],
  ['medium_type_radar_only', { role: 'radar' }],
  ['medium_watch_conditional', { role: 'radar' }],
  ['radar_only', { role: 'radar' }],
  ['trial_corroboration_source', { role: 'radar' }],
  ['trial_niche_corroboration_source', { role: 'radar' }],
  ['trial_radar_only', { role: 'radar' }],
] satisfies Array<[string, PolicyTreatment]>);

/** X's own rule: 1–15 letters, digits or underscores. */
export const X_HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

const MAX_X_SOURCES = 200;
const MAX_ENV_CHARS = 20_000;

export interface XSource {
  /** Handle as configured, without "@". */
  handle: string;
  /** Lower-cased handle — X handles are case-insensitive. */
  key: string;
  policy: string;
}

export interface SkippedXSource {
  /** 1-based slot in the comma-separated value. */
  position: number;
  reason: 'invalid' | 'over_limit';
  /** The raw entry, for local tooling only: it is roster content (or a
   *  mis-pasted secret), so server logs report position and reason alone. */
  entry: string;
}

export interface XSourceRoster {
  sources: XSource[];
  byKey: ReadonlyMap<string, XSource>;
  skipped: SkippedXSource[];
  /** True when the whole value was refused for its size. */
  oversized: boolean;
}

const entrySchema = z.object({
  handle: z.string().regex(X_HANDLE_PATTERN),
  policy: z.string().refine((policy) => X_SOURCE_POLICIES.has(policy)),
});

const EMPTY_ROSTER: XSourceRoster = {
  sources: [],
  byKey: new Map(),
  skipped: [],
  oversized: false,
};

export function parseXNewsSources(raw: string | undefined): XSourceRoster {
  if (!raw || raw.trim().length === 0) return EMPTY_ROSTER;
  if (raw.length > MAX_ENV_CHARS) return { ...EMPTY_ROSTER, oversized: true };

  const sources: XSource[] = [];
  const byKey = new Map<string, XSource>();
  const skipped: SkippedXSource[] = [];
  raw.split(',').forEach((slot, index) => {
    const trimmed = slot.trim();
    if (trimmed.length === 0) return;
    const position = index + 1;
    const separator = trimmed.indexOf(':');
    const parsed = entrySchema.safeParse({
      handle: separator === -1 ? trimmed : trimmed.slice(0, separator).trim().replace(/^@/, ''),
      policy: separator === -1 ? '' : trimmed.slice(separator + 1).trim(),
    });
    if (!parsed.success) {
      skipped.push({ position, reason: 'invalid', entry: trimmed.slice(0, 80) });
      return;
    }
    const key = parsed.data.handle.toLowerCase();
    if (byKey.has(key)) return;
    if (sources.length >= MAX_X_SOURCES) {
      skipped.push({ position, reason: 'over_limit', entry: trimmed.slice(0, 80) });
      return;
    }
    const source = { handle: parsed.data.handle, key, policy: parsed.data.policy };
    sources.push(source);
    byKey.set(key, source);
  });
  return { sources, byKey, skipped, oversized: false };
}

let cached: { raw: string | undefined; roster: XSourceRoster } | null = null;

/** The configured roster; re-parsed only when the env value changes. */
export function getXNewsSources(): XSourceRoster {
  const raw = process.env.X_NEWS_SOURCES;
  if (cached && cached.raw === raw) return cached.roster;
  const roster = parseXNewsSources(raw);
  if (roster.oversized) {
    logger.warn(`[XSources] X_NEWS_SOURCES is over ${MAX_ENV_CHARS} characters; X posts are off`);
  }
  if (roster.skipped.length > 0) {
    const slots = roster.skipped.map((skip) => `#${skip.position} ${skip.reason}`).join(', ');
    logger.warn(
      `[XSources] Ignored X_NEWS_SOURCES entries (${slots}): expected handle:allowed_use ` +
        'with a known policy; run news:x-sources locally to see them'
    );
  }
  cached = { raw, roster };
  return roster;
}

/** A post's role: its author's policy, upgraded when the post links a source. */
export function xRoleFor(source: XSource, hasExternalLink: boolean): XSourceRole {
  const treatment = X_SOURCE_POLICIES.get(source.policy);
  if (!treatment) return 'radar';
  return hasExternalLink && treatment.sourceBackedRole
    ? treatment.sourceBackedRole
    : treatment.role;
}

export function twitterApiKey(): string | null {
  const key = process.env.TWITTERAPI_IO_KEY?.trim();
  return key ? key : null;
}

/** Collection needs both a key and a roster; reading stored posts needs only the roster. */
export function isXCollectionConfigured(): boolean {
  return twitterApiKey() !== null && getXNewsSources().sources.length > 0;
}
