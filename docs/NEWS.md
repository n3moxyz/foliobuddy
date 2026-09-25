# News Pipeline Reference

Detail for the News tab. The binding rules are summarized in [CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) ("News Tab"); this file explains how the pieces fit. The investigation that shaped the sources is in [FORET.md](../FORET.md) ("The News Tab That Couldn't See Singapore").

## What the page shows

`/news` sits between Trades and History (shortcut `N`) and covers owned positions (`custodyOf: null`) plus open-trade assets. Order: Top stories → Crypto → Equities → Macro.

- **Holding cards**: one compact card per holding: a header button (symbol, name, "N stories") that opens the holding's own page, and only its top story below. Holdings with no stories in the feed window are listed on a "No headlines in the last 14 days" line; holdings past the fetch cap on an "Also held" line. Both open the holding's page.
- **Holding search**: an accessible combobox over `holdings` (symbol prefix, then name word, then substring; largest holding first on ties).
- **Holding page** (`/news?asset=<assetId>`): every story touching that holding from the last 60 days, newest first, undated last. Routed by asset id because `Asset.symbol` is not unique.

## Where headlines come from (`packages/backend/src/services/news/`)

`newsQuery.ts` plans one query per holding. Yahoo's search endpoint answers ticker queries only for US listings; probed 2026-09, `D05.SI`, `O39.SI`, `7203.T`, `285A.T`, `EQNR.OL` and `SOL-USD` all returned zero headlines, while name queries returned tagged coverage.

| Holding                               | Yahoo query                                 | Relevance gate                                                                     | Google News                         |
| ------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| US listing (`NVDA`)                   | ticker                                      | tagged with the ticker                                                             | no                                  |
| Suffixed listing (`D05.SI`, `285A.T`) | cleaned company name ("DBS Group Holdings") | tagged with the ticker, or the headline names the company (first distinctive word) | only `.SI` (`GOOGLE_NEWS_SUFFIXES`) |
| CoinGecko coin                        | coin name ("Solana")                        | tagged `SYMBOL-USD`                                                                | no                                  |
| Unit trust                            | ticker (fund ids have no name coverage)     | tagged with the ticker                                                             | no                                  |
| Manual / stable / cash / NFT / angel  | none (skipped)                              | n/a                                                                                | n/a                                 |

- `cleanCompanyName()` strips legal suffixes ("Singapore Telecommunications Limited" returned 0 Yahoo headlines; without "Limited", 13). It reads only the first 200 characters: suffix stripping is quadratic on adversarial names (a 64k-character name took 1.6s of event loop before the bound), and rows written before the ingestion cap (`MAX_ASSET_NAME_LENGTH`, enforced on every asset-writing route) can be longer.
- The gate fails open when no result in a response carries any ticker tag, so a Yahoo response-shape change degrades to unfiltered headlines, not an empty feed.
- Company-name headline matches exist because some local listings are tagged with their US ADR (Toyota as `TM`, not `7203.T`). Generic first words ("Singapore", "United") never count.

`googleNews.ts` reads Google News RSS (Singapore English edition, exact-phrase name, `when:14d` for the feed, `when:60d` for a holding page). It is an unofficial feed, so it never fails the page:

- 5-second timeout, 15-minute cache (empty successes cached, failures not).
- Pauses all queries for 10 minutes on 403/429/503 or a non-RSS 200 (consent/captcha page), 2 minutes on network errors.
- Titles lose Google's " - Publisher" suffix; quote pages ("stock price, news, quote…") are dropped.
- Links are opaque `news.google.com` redirects. Source tiers read the publisher's own site (`sourceUrl`, from `<source url>`), and Stage 2 enrichment skips these stories (no article body).
- Parsed by a small linear scanner instead of an XML dependency (the lockfile is owned by npm 10.8.2, [DEPENDENCIES.md](DEPENDENCIES.md)). Feed text is untrusted: CDATA sections are rewritten as escaped text before any tag is read (a headline containing `</item><item>` can't forge an item), every scan is linear, and item links must be `https://news.google.com/…` or the item is dropped.

`YahooFinanceProvider.getNews()` is the only `newsCount > 0` call site; it caches 15 minutes per query and count, and maps `relatedTickers` (upper-cased). Provider tags and `sourceUrl` are internal and never reach API responses.

## Endpoints

- `GET /news`: fetches the 40 largest targets (`MAX_NEWS_TARGETS`) plus five macro queries; `holdings` lists every news-eligible holding, largest first, with `storyCount` and `loaded`. Uncached failures reject; a partial refresh keeps successes; if every Yahoo request fails the call rejects, so React Query keeps the last good headlines. Google failures never count.
- `GET /news/asset/:assetId`: id must match `^[A-Za-z0-9_-]{1,64}$` (400 otherwise). 404 unless the asset is one of the user's owned or open-trade news targets. Yahoo (30) + Google (40, `.SI` only), ranked with a 60-day window, newest first, capped at 60. Rejects only when Yahoo fails and Google returned nothing.
- `GET /news/enrichment`: read-only view of the Stage 2 cache. `POST /news/feedback`: per-row Flag ("Not relevant" / "Poor source"), logged as story metadata only, never portfolio values.

## Ranking (`ranking.ts`, `sourceQuality.ts`, `materiality.ts`)

- **Source tier** 1–4 plus a small denylist; unknown publishers are tier 4 with a null label, never "verified". Tier 1 / primary only from an official domain: end-anchored government suffixes, the allowlist, or a holding's `Asset.officialDomain` (admin `PUT /assets/:id`, public-suffix-aware) portfolio-wide, which earns "Company announcement". Never from a publisher string.
- **Materiality**: headline patterns set importance + event type; clickbait forces low.
- **Score**: importance + tier + relevance (held beats open-trade, small large-holding bonus) + recency (24h half-life). Feed age limit 14 days (30 if high importance); `RankOptions` lets a holding page look back 60. Future timestamps are treated as undated.
- **Clustering**: story id → identity-preserving URL (tracking params stripped) → title signature within 72h. The best publisher represents the cluster; `affectedSymbols` is the union. One story, one place, except that a holding whose only coverage was filed under a bigger holding shows it too. `storyCount` counts every story touching a holding. Holding cards are ordered by their best story's rank.
- **Top stories**: high materiality and (tier ≤2, or tier 3 with ≥2 normalized distinct publishers), cap 4, empty on quiet days. Section repeats carry an "in Top stories" marker.
- API responses expose labels only: never scores, weights, position values, or provider tags (test-enforced).

## Stage 2 enrichment (`enrichmentService.ts`, `articleRetrieval.ts`)

Optional, off without `ANTHROPIC_API_KEY`. Top stories only; 2 workers, 32-job pending cap. Claude `messages.parse` + `zodOutputFormat` (import `zod/v4`, module-local) over the fetched article body; no text means no enrichment, never a headline-only summary. Every fetch hop uses an Undici dispatcher pinned to a validated public DNS address. Success cache 24h keyed by story id + sorted `affectedSymbols` (never serve an explanation written for one holding context to another portfolio); failure cache 30 min by story id; per-user tracked ids. Low-confidence output is cached for diagnostics, never served. The client (`useNewsEnrichment`) polls at most 5 times and labels output "AI summary from the article · N confidence".

## Frontend

`pages/News.tsx` (`?asset=` state, scroll and focus return) plus `components/news/`: `HoldingNewsCard` (compact card + quiet/"Also held" lines), `NewsHoldingSearch` (combobox), `HoldingNewsDossier`, `NewsRow`, and `newsFormat.ts` (pure helpers, kept out of component files for Fast Refresh). The header is sticky from `sm` up only (`stickyOnMobile={false}`), since the search makes it tall on phones; `useNews` / `useAssetNews` (5-minute staleTime); `--accent-macro`; restrained Important / Primary source badges with the event label in the meta line; `formatRelativeTime()`. No money is shown, so there is no privacy wiring. The dev demo (`/dev/demo`) mocks every news route deterministically, including the holding page and its 404.
