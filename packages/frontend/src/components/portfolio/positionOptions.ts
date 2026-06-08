export const CEX_LOCATIONS = ['Binance', 'Bybit', 'Coinbase'];
export const ONCHAIN_LOCATIONS = ['Ledger', 'Metamask', 'Rabby', 'SOL wallet'];
export const BROKER_LOCATIONS = ['FSMOne', 'IBKR', 'Tiger', 'UOB KH'];
export const BANK_LOCATIONS = ['Citi', 'DBS', 'SCB', 'Trust+', 'UOB'];

export const CUSTOM_LOCATION_OPTIONS_KEY = 'foliobuddy-storage-location-options';

type LocationStorageBucket = 'CEX' | 'WALLET' | 'BROKERAGE' | 'BANK';
type StoredLocationOptions = Partial<Record<LocationStorageBucket, string[]>> & {
  __managedBuckets?: unknown;
};

const LOCATION_STORAGE_BUCKETS: LocationStorageBucket[] = ['CEX', 'WALLET', 'BROKERAGE', 'BANK'];

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

function findLocationOption(options: string[], value: string): string | undefined {
  const key = normalizeLocationOption(value).toLocaleLowerCase();
  return options.find((option) => option.toLocaleLowerCase() === key);
}

function readStoredLocationOptions(): Partial<Record<LocationStorageBucket, string[]>> {
  const emptyState: Partial<Record<LocationStorageBucket, string[]>> = {};
  if (typeof localStorage === 'undefined') return emptyState;

  try {
    const stored = localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY);
    if (!stored) return emptyState;

    const parsed = JSON.parse(stored) as StoredLocationOptions;
    const options: Partial<Record<LocationStorageBucket, string[]>> = {};
    LOCATION_STORAGE_BUCKETS.forEach((bucket) => {
      if (Array.isArray(parsed[bucket])) {
        options[bucket] = mergeLocationOptions(parsed[bucket] ?? []);
      }
    });

    return options;
  } catch {
    return emptyState;
  }
}

function writeStoredLocationOptions(
  optionsByBucket: Partial<Record<LocationStorageBucket, string[]>>
) {
  if (typeof localStorage === 'undefined') return;

  try {
    const payload: StoredLocationOptions = {};

    LOCATION_STORAGE_BUCKETS.forEach((bucket) => {
      const options = mergeLocationOptions(optionsByBucket[bucket] ?? []);
      if (options.length > 0) {
        payload[bucket] = options;
      }
    });

    if (Object.keys(payload).length === 0) {
      localStorage.removeItem(CUSTOM_LOCATION_OPTIONS_KEY);
      return;
    }

    localStorage.setItem(CUSTOM_LOCATION_OPTIONS_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable in privacy-restricted browser contexts.
  }
}

function customOptionsForBucket(bucket: LocationStorageBucket): string[] {
  const defaults = defaultLocationsForBucket(bucket);
  return mergeLocationOptions(readStoredLocationOptions()[bucket] ?? []).filter(
    (option) => !findLocationOption(defaults, option)
  );
}

export function locationOptionsForStorageType(
  storageType: string | null | undefined,
  extraOptions: string[] = []
): string[] {
  const bucket = bucketForStorageType(storageType);
  const customOptions = customOptionsForBucket(bucket);

  return mergeLocationOptions(defaultLocationsForBucket(bucket), customOptions, extraOptions);
}

export function customLocationOptionsForStorageType(
  storageType: string | null | undefined
): string[] {
  return customOptionsForBucket(bucketForStorageType(storageType));
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
  const nextOptions = mergeLocationOptions(customOptionsForBucket(bucket), [option]).sort((a, b) =>
    a.localeCompare(b)
  );

  writeStoredLocationOptions({ ...storedOptions, [bucket]: nextOptions });

  return option;
}

export function renameLocationOptionForStorageType(
  storageType: string | null | undefined,
  currentValue: string,
  nextValue: string
): string | null {
  const currentOption = normalizeLocationOption(currentValue);
  const nextOption = normalizeLocationOption(nextValue);
  if (!currentOption || !nextOption) return null;

  const bucket = bucketForStorageType(storageType);
  const storedOptions = readStoredLocationOptions();
  const customOptions = customOptionsForBucket(bucket);
  const currentKey = currentOption.toLocaleLowerCase();

  if (!customOptions.some((option) => option.toLocaleLowerCase() === currentKey)) return null;

  const defaultMatch = findLocationOption(defaultLocationsForBucket(bucket), nextOption);
  const existingCustom = findLocationOption(customOptions, nextOption);
  const nextOptions = mergeLocationOptions(
    customOptions
      .filter((option) => option.toLocaleLowerCase() !== currentKey)
      .concat(defaultMatch || existingCustom ? [] : [nextOption])
  ).sort((a, b) => a.localeCompare(b));

  writeStoredLocationOptions({ ...storedOptions, [bucket]: nextOptions });

  return defaultMatch ?? existingCustom ?? nextOption;
}

export function deleteLocationOptionForStorageType(
  storageType: string | null | undefined,
  value: string
): boolean {
  const option = normalizeLocationOption(value);
  if (!option) return false;

  const bucket = bucketForStorageType(storageType);
  const optionKey = option.toLocaleLowerCase();
  const storedOptions = readStoredLocationOptions();
  const currentOptions = customOptionsForBucket(bucket);
  const nextOptions = currentOptions.filter(
    (currentOption) => currentOption.toLocaleLowerCase() !== optionKey
  );

  if (nextOptions.length === currentOptions.length) return false;

  writeStoredLocationOptions({ ...storedOptions, [bucket]: nextOptions });
  return true;
}

export function locationLabelForStorageType(storageType: string | null | undefined): string {
  if (storageType === 'CEX') return 'Exchange';
  if (storageType === 'BROKERAGE') return 'Broker';
  if (storageType === 'BANK') return 'Bank';
  return 'Wallet';
}
