import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  nativeNodeFetchIntegration: vi.fn((options: unknown) => ({ name: 'NodeFetch', options })),
}));

vi.mock('@sentry/node', () => ({
  init: mocks.init,
  nativeNodeFetchIntegration: mocks.nativeNodeFetchIntegration,
}));
vi.mock('../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { initSentry, isUnrecordedFetch } = await import('../lib/sentry.js');

describe('Sentry setup', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('never records fetches whose URLs carry the private X roster', () => {
    expect(
      isUnrecordedFetch('https://api.twitterapi.io/twitter/tweet/advanced_search?query=(from%3Aa)')
    ).toBe(true);
    expect(isUnrecordedFetch('https://query1.finance.yahoo.com/v1/finance/search?q=NVDA')).toBe(
      false
    );
    expect(isUnrecordedFetch('not a url')).toBe(false);
  });

  it('wires that filter into the fetch integration', () => {
    vi.stubEnv('SENTRY_DSN', 'https://public@example.ingest.sentry.io/1');

    initSentry();

    const [options] = mocks.nativeNodeFetchIntegration.mock.calls[0] as [
      { ignoreOutgoingRequests: (url: string) => boolean },
    ];
    expect(options.ignoreOutgoingRequests('https://api.twitterapi.io/twitter/x')).toBe(true);
    expect(mocks.init).toHaveBeenCalledWith(
      expect.objectContaining({ integrations: [expect.objectContaining({ name: 'NodeFetch' })] })
    );
  });
});
