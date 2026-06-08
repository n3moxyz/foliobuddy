export const CEX_LOCATIONS = ['Binance', 'Bybit', 'Coinbase'];
export const ONCHAIN_LOCATIONS = ['Ledger', 'Metamask', 'Rabby', 'SOL wallet'];
export const BROKER_LOCATIONS = ['FSMOne', 'Tiger', 'UOB Kay Hian'];
export const BANK_LOCATIONS = ['DBS', 'Trust+', 'SCB', 'UOB', 'Citi'];

export const CUSTOM_LOCATION_OPTIONS_KEY = 'foliobuddy-storage-location-options';

type LocationStorageBucket = 'CEX' | 'WALLET' | 'BROKERAGE' | 'BANK';
type StoredLocationOptions = Partial<Record<LocationStorageBucket, string[]>> & {
  __managedBuckets?: LocationStorageBucket[];
};
type StoredLocationOptionsState = {
  options: Partial<Record<LocationStorageBucket, string[]>>;
  managedBuckets: LocationStorageBucket[];
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

function isLocationStorageBucket(value: unknown): value is LocationStorageBucket {
  return (
    typeof value === 'string' &&
    LOCATION_STORAGE_BUCKETS.includes(value as LocationStorageBucket)
  );
}

function readStoredLocationOptions(): StoredLocationOptionsState {
  const emptyState: StoredLocationOptionsState = { options: {}, managedBuckets: [] };
  if (typeof localStorage === 'undefined') return emptyState;

  try {
    const stored = localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY);
    if (!stored) return emptyState;

    const parsed = JSON.parse(stored) as StoredLocationOptions;
    const options: StoredLocationOptionsState['options'] = {};
    LOCATION_STORAGE_BUCKETS.forEach((bucket) => {
      if (Array.isArray(parsed[bucket])) {
        options[bucket] = mergeLocationOptions(parsed[bucket] ?? []);
      }
    });

    return {
      options,
      managedBuckets: Array.isArray(parsed.__managedBuckets)
        ? parsed.__managedBuckets.filter(isLocationStorageBucket)
        : [],
    };
  } catch {
    return emptyState;
  }
}

function writeStoredLocationOptions(state: StoredLocationOptionsState) {
  if (typeof localStorage === 'undefined') return;

  try {
    const payload: StoredLocationOptions = {};

    LOCATION_STORAGE_BUCKETS.forEach((bucket) => {
      const options = mergeLocationOptions(state.options[bucket] ?? []);
      if (options.length > 0) {
        payload[bucket] = options;
      }
    });

    const managedBuckets = state.managedBuckets.filter(isLocationStorageBucket);
    if (managedBuckets.length > 0) {
      payload.__managedBuckets = managedBuckets;
    }

    if (Object.keys(payload).length === 0) {
      localStorage.removeItem(CUSTOM_LOCATION_OPTIONS_KEY);
      return;
    }

    localStorage.setItem(CUSTOM_LOCATION_OPTIONS_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable in privacy-restricted browser contexts.
  }
}

function isManagedBucket(state: StoredLocationOptionsState, bucket: LocationStorageBucket): boolean {
  return state.managedBuckets.includes(bucket);
}

function writeManagedBucketOptions(bucket: LocationStorageBucket, options: string[]) {
  const storedOptions = readStoredLocationOptions();
  const managedBuckets = isManagedBucket(storedOptions, bucket)
    ? storedOptions.managedBuckets
    : [...storedOptions.managedBuckets, bucket];

  writeStoredLocationOptions({
    options: {
      ...storedOptions.options,
      [bucket]: mergeLocationOptions(options),
    },
    managedBuckets,
  });
}

export function locationOptionsForStorageType(
  storageType: string | null | undefined,
  extraOptions: string[] = []
): string[] {
  const bucket = bucketForStorageType(storageType);
  const storedOptions = readStoredLocationOptions();
  const bucketOptions = storedOptions.options[bucket] ?? [];

  if (isManagedBucket(storedOptions, bucket)) {
    return mergeLocationOptions(bucketOptions, extraOptions);
  }

  return mergeLocationOptions(defaultLocationsForBucket(bucket), bucketOptions, extraOptions);
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
  const nextOptions = isManagedBucket(storedOptions, bucket)
    ? mergeLocationOptions(storedOptions.options[bucket] ?? [], [option])
    : mergeLocationOptions(storedOptions.options[bucket] ?? [], [option]).sort((a, b) =>
        a.localeCompare(b)
      );

  writeStoredLocationOptions({
    ...storedOptions,
    options: {
      ...storedOptions.options,
      [bucket]: nextOptions,
    },
  });

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
  const currentOptions = locationOptionsForStorageType(storageType);
  const currentKey = currentOption.toLocaleLowerCase();

  if (!currentOptions.some((option) => option.toLocaleLowerCase() === currentKey)) {
    return null;
  }

  const nextOptions = mergeLocationOptions(
    currentOptions.map((option) =>
      option.toLocaleLowerCase() === currentKey ? nextOption : option
    )
  );
  writeManagedBucketOptions(bucket, nextOptions);

  return (
    nextOptions.find((option) => option.toLocaleLowerCase() === nextOption.toLocaleLowerCase()) ??
    nextOption
  );
}

export function deleteLocationOptionForStorageType(
  storageType: string | null | undefined,
  value: string
): boolean {
  const option = normalizeLocationOption(value);
  if (!option) return false;

  const bucket = bucketForStorageType(storageType);
  const optionKey = option.toLocaleLowerCase();
  const currentOptions = locationOptionsForStorageType(storageType);
  const nextOptions = currentOptions.filter(
    (currentOption) => currentOption.toLocaleLowerCase() !== optionKey
  );

  if (nextOptions.length === currentOptions.length) return false;

  writeManagedBucketOptions(bucket, nextOptions);
  return true;
}

export function locationLabelForStorageType(storageType: string | null | undefined): string {
  if (storageType === 'CEX') return 'Exchange';
  if (storageType === 'BROKERAGE') return 'Broker';
  if (storageType === 'BANK') return 'Bank';
  return 'Wallet';
}
