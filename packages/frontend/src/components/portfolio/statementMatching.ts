import { AssetCategory } from '@foliobuddy/shared';
import type { ParsedStatementHolding, Position } from '@/lib/types';

export type UnitTrustStatementMatchReason = 'isin' | 'provider-symbol' | 'asset-symbol' | 'name';

export interface UnitTrustStatementMatch {
  position: Position;
  reason: UnitTrustStatementMatchReason;
}

export function statementBrokerStorageLocation(broker: string): string {
  const trimmed = broker.trim();
  if (/UOB/i.test(trimmed)) return 'UOB KH';
  if (/FSM|fundsupermart|iFAST/i.test(trimmed)) return 'FSMOne';
  return trimmed;
}

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function preferredByBroker(candidates: Position[], broker: string): Position | null {
  if (candidates.length === 0) return null;

  const brokerLocation = normalizeText(statementBrokerStorageLocation(broker));
  if (!brokerLocation) return candidates[0];

  return (
    candidates.find((position) => normalizeText(position.storageLocation) === brokerLocation) ??
    candidates[0]
  );
}

export function findMatchingUnitTrustPosition(
  holding: ParsedStatementHolding,
  positions: Position[] | null | undefined,
  broker: string
): UnitTrustStatementMatch | null {
  const unitTrustPositions = (positions ?? []).filter(
    (position) => position.asset.category === AssetCategory.UNIT_TRUST
  );
  if (unitTrustPositions.length === 0) return null;

  const holdingIsin = normalizeIdentifier(holding.isin);
  if (holdingIsin) {
    const isinMatch = preferredByBroker(
      unitTrustPositions.filter(
        (position) => normalizeIdentifier(position.asset.isin) === holdingIsin
      ),
      broker
    );
    if (isinMatch) return { position: isinMatch, reason: 'isin' };
  }

  const providerSymbols = new Set(
    [holding.yahooSymbol, holding.symbol].map(normalizeIdentifier).filter(Boolean)
  );
  if (providerSymbols.size > 0) {
    const providerMatch = preferredByBroker(
      unitTrustPositions.filter((position) =>
        providerSymbols.has(normalizeIdentifier(position.asset.providerAssetId))
      ),
      broker
    );
    if (providerMatch) return { position: providerMatch, reason: 'provider-symbol' };
  }

  const holdingSymbol = normalizeIdentifier(holding.symbol);
  if (holdingSymbol) {
    const symbolMatch = preferredByBroker(
      unitTrustPositions.filter(
        (position) => normalizeIdentifier(position.asset.symbol) === holdingSymbol
      ),
      broker
    );
    if (symbolMatch) return { position: symbolMatch, reason: 'asset-symbol' };
  }

  const holdingName = normalizeText(holding.name);
  const holdingCurrency = normalizeIdentifier(holding.nativeCurrency);
  if (holdingName) {
    const nameMatch = preferredByBroker(
      unitTrustPositions.filter((position) => {
        const sameName = normalizeText(position.asset.name) === holdingName;
        const sameCurrency =
          !holdingCurrency ||
          normalizeIdentifier(position.asset.nativeCurrency) === holdingCurrency;
        return sameName && sameCurrency;
      }),
      broker
    );
    if (nameMatch) return { position: nameMatch, reason: 'name' };
  }

  return null;
}
