import { describe, expect, it } from 'vitest';
import {
  applySandboxEnv,
  assertSandboxDatabase,
  SANDBOX_DATABASE_NAME,
  SANDBOX_USER_ID,
  SANDBOX_X_ROSTER,
} from '../scripts/sandbox/config.js';
import {
  SANDBOX_ASSETS,
  SANDBOX_POSITION_HISTORY,
  SANDBOX_POSITIONS,
  SANDBOX_TRADES,
  sandboxXPosts,
} from '../scripts/sandbox/fixtures.js';
import { matchXPosts, xMatchPlan } from '../services/news/xPostMatching.js';
import { parseXNewsSources } from '../services/news/xSources.js';

const LOCAL_URL = `postgresql://dev:dev@localhost:5433/${SANDBOX_DATABASE_NAME}`;

describe('sandbox safety', () => {
  it('only ever touches the local sandbox database', () => {
    expect(() => assertSandboxDatabase({ DATABASE_URL: LOCAL_URL })).not.toThrow();
    expect(() =>
      assertSandboxDatabase({
        DATABASE_URL: `postgresql://User@127.0.0.1:5432/${SANDBOX_DATABASE_NAME}`,
      })
    ).not.toThrow();

    expect(() =>
      assertSandboxDatabase({
        DATABASE_URL: `postgresql://u:p@db.example.com:5432/${SANDBOX_DATABASE_NAME}`,
      })
    ).toThrow(/Refusing/);
    expect(() =>
      assertSandboxDatabase({
        DATABASE_URL: 'postgresql://dev:dev@localhost:5433/example_portfolio_db',
      })
    ).toThrow(/Refusing/);
    expect(() =>
      assertSandboxDatabase({ DATABASE_URL: LOCAL_URL, NODE_ENV: 'production' })
    ).toThrow(/production/);
    expect(() => assertSandboxDatabase({})).toThrow(/DATABASE_URL/);
  });

  it('turns off services that bill or report, whatever a developer .env holds', () => {
    const env: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'from-dotenv',
      TWITTERAPI_IO_KEY: 'from-dotenv',
      SENTRY_DSN: 'from-dotenv',
    };

    applySandboxEnv(env, 'http://localhost:4100');

    expect(env).toMatchObject({
      ANTHROPIC_API_KEY: '',
      TWITTERAPI_IO_KEY: '',
      SENTRY_DSN: '',
      NODE_ENV: 'development',
      ALLOW_LOCAL_AUTH_BYPASS: 'true',
      LOCAL_AUTH_USER_ID: SANDBOX_USER_ID,
      ALLOWED_ORIGINS: 'http://localhost:4100',
    });
  });
});

describe('sandbox sample data', () => {
  const roster = parseXNewsSources(SANDBOX_X_ROSTER);
  const posts = sandboxXPosts(new Date('2026-09-27T12:00:00Z'));

  it('posts only from fictional accounts on a roster that parses cleanly', () => {
    expect(roster.skipped).toEqual([]);
    expect(roster.sources.every((source) => source.handle.startsWith('fbsandbox_'))).toBe(true);
    expect(posts.every((post) => roster.byKey.has(post.authorKey))).toBe(true);
    expect(new Set(posts.map((post) => post.id)).size).toBe(posts.length);
  });

  it('matches every sample post to a sandbox holding, so the News tab always shows them', () => {
    const targets = SANDBOX_ASSETS.flatMap((asset) => {
      const plan = xMatchPlan(asset);
      return plan ? [{ assetId: asset.id, plan }] : [];
    });

    const matched = new Set(
      [...matchXPosts(targets, posts, { includeRadar: true, roster }).values()]
        .flat()
        .map((item) => item.id)
    );

    for (const post of posts) expect(matched).toContain(`x:${post.id}`);
  });

  it('keeps positions, trades and ledger rows pointing at real sample records', () => {
    const assetIds = new Set(SANDBOX_ASSETS.map((asset) => asset.id));
    const positions = new Map(SANDBOX_POSITIONS.map((position) => [position.id, position]));

    expect(SANDBOX_POSITIONS.every((position) => assetIds.has(position.assetId))).toBe(true);
    expect(SANDBOX_TRADES.every((trade) => assetIds.has(trade.assetId))).toBe(true);
    for (const entry of SANDBOX_POSITION_HISTORY) {
      const current = positions.get(entry.positionId)!;
      // A ledger row must end at the position's current quantity, in its direction.
      expect(
        entry.mode === 'add'
          ? current.quantity > entry.previousQuantity
          : current.quantity < entry.previousQuantity
      ).toBe(true);
    }
  });
});
