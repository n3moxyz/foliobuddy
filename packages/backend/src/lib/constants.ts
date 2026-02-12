/** Fallback USD/SGD exchange rate when FX API is unavailable */
export const USD_SGD_FALLBACK_RATE = 1.35;

/** Maximum positions allowed per asset category */
export const MAX_POSITIONS_PER_CATEGORY = 20;

/** Default limit for snapshot list queries */
export const DEFAULT_SNAPSHOT_LIMIT = 100;

/** Maximum days of historical price data from CoinGecko */
export const MAX_HISTORICAL_DAYS = 365;

/** Express JSON payload size limit */
export const MAX_PAYLOAD_SIZE = '10mb';

/** Rate limiting: requests per window */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = 200; // per window
