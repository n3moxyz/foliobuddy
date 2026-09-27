import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { getXNewsSources, isXCollectionConfigured, parseXNewsSources, X_SOURCE_POLICIES, xRoleFor } =
  await import('../services/news/xSources.js');
const { logger } = await import('../lib/logger.js');

function source(policy: string) {
  return { handle: 'fx_source', key: 'fx_source', policy };
}

describe('parseXNewsSources', () => {
  it('is empty — the feature is off — without a value', () => {
    expect(parseXNewsSources(undefined).sources).toEqual([]);
    expect(parseXNewsSources('   ').sources).toEqual([]);
  });

  it('parses handle:policy pairs, tolerating "@", spaces and repeated handles in any case', () => {
    const roster = parseXNewsSources(
      ' @fx_anchor:anchor_source, fx_radar : radar_only ,FX_ANCHOR:radar_only,'
    );

    expect(roster.sources).toEqual([
      { handle: 'fx_anchor', key: 'fx_anchor', policy: 'anchor_source' },
      { handle: 'fx_radar', key: 'fx_radar', policy: 'radar_only' },
    ]);
    expect(roster.byKey.get('fx_anchor')?.policy).toBe('anchor_source');
    expect(roster.skipped).toEqual([]);
  });

  it('skips invalid handles and unknown policies instead of guessing a role', () => {
    const roster = parseXNewsSources(
      [
        'fx_ok:anchor_source',
        'bad-handle:anchor_source',
        'handle_over_fifteen:radar_only',
        'fx_new:brand_new_policy',
        'fx_no_policy',
        // Object-prototype names must never resolve to a policy.
        'fx_proto:constructor',
      ].join(',')
    );

    expect(roster.sources.map((s) => s.handle)).toEqual(['fx_ok']);
    expect(roster.skipped.map((skip) => [skip.position, skip.reason, skip.entry])).toEqual([
      [2, 'invalid', 'bad-handle:anchor_source'],
      [3, 'invalid', 'handle_over_fifteen:radar_only'],
      [4, 'invalid', 'fx_new:brand_new_policy'],
      [5, 'invalid', 'fx_no_policy'],
      [6, 'invalid', 'fx_proto:constructor'],
    ]);
  });

  it('refuses an oversized value and caps the roster size', () => {
    const oversized = parseXNewsSources(`fx_a:anchor_source,${'x'.repeat(20_001)}`);
    expect(oversized.oversized).toBe(true);
    expect(oversized.sources).toEqual([]);

    const raw = Array.from({ length: 205 }, (_, i) => `fx_${i}:radar_only`).join(',');
    const roster = parseXNewsSources(raw);
    expect(roster.sources).toHaveLength(200);
    expect(roster.skipped.map((skip) => skip.reason)).toEqual(Array(5).fill('over_limit'));
  });
});

describe('xRoleFor', () => {
  it('maps every validatex policy to a role, mirroring the roster ranking nuance', () => {
    const roles = Object.fromEntries(
      [...X_SOURCE_POLICIES.keys()].map((policy) => [policy, xRoleFor(source(policy), false)])
    );

    expect(roles).toEqual({
      anchor_source: 'anchor',
      anchor_when_source_backed: 'corroboration',
      corroboration_or_anchor_when_primary_source: 'corroboration',
      high_medium_corroboration_source: 'corroboration',
      corroboration_source: 'corroboration',
      context_source: 'corroboration',
      core_medium_context_dedup_required: 'corroboration',
      medium_type_context_or_source_backed_corroboration: 'radar',
      medium_type_corroboration_source: 'radar',
      medium_type_corroboration_required: 'radar',
      medium_type_radar_only: 'radar',
      medium_watch_conditional: 'radar',
      radar_only: 'radar',
      trial_corroboration_source: 'radar',
      trial_niche_corroboration_source: 'radar',
      trial_radar_only: 'radar',
    });
  });

  it('upgrades a conditional policy only when the post links a source', () => {
    expect(xRoleFor(source('anchor_when_source_backed'), true)).toBe('anchor');
    expect(xRoleFor(source('medium_type_context_or_source_backed_corroboration'), true)).toBe(
      'corroboration'
    );
    // Unconditional policies ignore links, and "primary source" is undetectable.
    expect(xRoleFor(source('radar_only'), true)).toBe('radar');
    expect(xRoleFor(source('corroboration_or_anchor_when_primary_source'), true)).toBe(
      'corroboration'
    );
  });
});

describe('getXNewsSources', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('follows X_NEWS_SOURCES as it changes', () => {
    vi.stubEnv('X_NEWS_SOURCES', 'fx_one:anchor_source');
    expect(getXNewsSources().sources.map((s) => s.handle)).toEqual(['fx_one']);

    vi.stubEnv('X_NEWS_SOURCES', 'fx_two:radar_only');
    expect(getXNewsSources().sources.map((s) => s.handle)).toEqual(['fx_two']);
  });

  it('logs skipped entries by position only, never their text', () => {
    vi.stubEnv('X_NEWS_SOURCES', 'fx_ok:anchor_source,fx_secretish:not_a_policy');

    getXNewsSources();

    const message = String(vi.mocked(logger.warn).mock.calls.at(-1)?.[0]);
    expect(message).toContain('#2 invalid');
    expect(message).not.toContain('fx_secretish');
    expect(message).not.toContain('not_a_policy');
  });

  it('needs both a key and a roster to collect', () => {
    vi.stubEnv('X_NEWS_SOURCES', 'fx_one:anchor_source');
    vi.stubEnv('TWITTERAPI_IO_KEY', '');
    expect(isXCollectionConfigured()).toBe(false);

    vi.stubEnv('TWITTERAPI_IO_KEY', 'test-key');
    expect(isXCollectionConfigured()).toBe(true);

    vi.stubEnv('X_NEWS_SOURCES', '');
    expect(isXCollectionConfigured()).toBe(false);
  });
});
