export const CEX_LOCATIONS = ['Binance', 'Bybit', 'Coinbase', 'Others'];
export const ONCHAIN_LOCATIONS = ['Ledger', 'Metamask', 'Rabby', 'SOL wallet', 'Others'];
export const BROKER_LOCATIONS = ['FSMOne', 'Tiger', 'UOB Kay Hian', 'Others'];
export const BANK_LOCATIONS = ['DBS', 'Trust+', 'SCB', 'UOB', 'Citi', 'Others'];

export const CRYPTO_STORAGE_TYPES = [
  { value: 'CEX', label: 'CEX' },
  { value: 'WALLET', label: 'Onchain' },
] as const;

export const FIAT_CASH_STORAGE_TYPES = [
  { value: 'BROKERAGE', label: 'Broker account' },
  { value: 'BANK', label: 'Bank' },
] as const;

export function locationOptionsForStorageType(storageType: string | null | undefined): string[] {
  if (storageType === 'CEX') return CEX_LOCATIONS;
  if (storageType === 'BROKERAGE') return BROKER_LOCATIONS;
  if (storageType === 'BANK') return BANK_LOCATIONS;
  return ONCHAIN_LOCATIONS;
}

export function locationLabelForStorageType(storageType: string | null | undefined): string {
  if (storageType === 'CEX') return 'Exchange';
  if (storageType === 'BROKERAGE') return 'Broker';
  if (storageType === 'BANK') return 'Bank';
  return 'Wallet';
}
