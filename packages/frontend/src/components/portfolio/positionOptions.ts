export const CEX_LOCATIONS = ['Binance', 'Bybit', 'Coinbase'];
export const ONCHAIN_LOCATIONS = ['Ledger', 'Metamask', 'Rabby', 'SOL wallet'];
export const BROKER_LOCATIONS = ['FSMOne', 'Tiger', 'UOB Kay Hian'];
export const BANK_LOCATIONS = ['DBS', 'Trust+', 'SCB', 'UOB', 'Citi'];

export const CUSTOM_LOCATION_OPTIONS_KEY = 'foliobuddy-storage-location-options';

type LocationStorageBucket = 'CEX' | 'WALLET' | 'BROKERAGE' | 'BANK';
type StoredLocationOptions = Partial<Record<LocationStorageBucket, string[]>>;

export const CRYPTO_STORAGE_TYPES = [
  { value: 'CEX', label: 'CEX' },
  { value: 'WALLET', label: 'Onchain' },
] as const;

export const FIAT_CASH_STORAGE_TYPES = [
  { value: 'BROKERAGE', label: 'Broker account' },
  { value: 'BANK', label: 'Bank' },
] as const;

function bucketForStorageType(storageType: string | null | undefined): LocationStorageBucket {
  if (storageType === 'CEX') return 'CEX';
  if (storageType === 'BROKERAGE') return 'BROKERAGE';
  if (storageType === 'BANK') return 'BANK';
  return 'WALLET';
}

function defaultLocationsForBucket(bucket: LocationStorageBucket): string[] {
  if (bucket === 'CEX') return CEX_LOCATIONS;
  if (bucket === 'BROKERAGE') return BROKER_LOCATIONS;
  if (bucket === 'BANK') return BANK_LOCATIONS;
  return ONCHAIN_LOCATIONS;
}

function normalizeLocationOption(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function mergeLocationOptions(...groups: string[][]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  groups.flat().forEach((rawOption) => {
    const option = normalizeLocationOption(rawOption);
    if (!option) return;

    const key = option.toLocaleLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    options.push(option);
  });

  return options;
}

function readStoredLocationOptions(): StoredLocationOptions {
  if (typeof localStorage === 'undefined') return {};

  try {
    const stored = localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as StoredLocationOptions;
    return {
      CEX: Array.isArray(parsed.CEX) ? mergeLocationOptions(parsed.CEX) : undefined,
      WALLET: Array.isArray(parsed.WALLET) ? mergeLocationOptions(parsed.WALLET) : undefined,
      BROKERAGE: Array.isArray(parsed.BROKERAGE)
        ? mergeLocationOptions(parsed.BROKERAGE)
        : undefined,
      BANK: Array.isArray(parsed.BANK) ? mergeLocationOptions(parsed.BANK) : undefined,
    };
  } catch {
    return {};
  }
}

function writeStoredLocationOptions(options: StoredLocationOptions) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(CUSTOM_LOCATION_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // localStorage may be unavailable in privacy-restricted browser contexts.
  }
}

export function locationOptionsForStorageType(
  storageType: string | null | undefined,
  extraOptions: string[] = []
): string[] {
  const bucket = bucketForStorageType(storageType);
  const customOptions = readStoredLocationOptions()[bucket] ?? [];

  return mergeLocationOptions(defaultLocationsForBucket(bucket), customOptions, extraOptions);
}

export function saveLocationOptionForStorageType(
  storageType: string | null | undefined,
  value: string
): string | null {
  const option = normalizeLocationOption(value);
  if (!option) return null;

  const existingOption = locationOptionsForStorageType(storageType).find(
    (storedOption) => storedOption.toLocaleLowerCase() === option.toLocaleLowerCase()
  );
  if (existingOption) return existingOption;

  const bucket = bucketForStorageType(storageType);
  const storedOptions = readStoredLocationOptions();
  const nextOptions = mergeLocationOptions(storedOptions[bucket] ?? [], [option]).sort((a, b) =>
    a.localeCompare(b)
  );

  writeStoredLocationOptions({
    ...storedOptions,
    [bucket]: nextOptions,
  });

  return option;
}

export function locationLabelForStorageType(storageType: string | null | undefined): string {
  if (storageType === 'CEX') return 'Exchange';
  if (storageType === 'BROKERAGE') return 'Broker';
  if (storageType === 'BANK') return 'Bank';
  return 'Wallet';
}
