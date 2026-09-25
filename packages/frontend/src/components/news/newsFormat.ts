import type { AssetNewsGroup, NewsBucket } from '@/lib/types';

// Pure helpers shared by the News page, holding cards, search and dossier.
// Kept out of the component files so Fast Refresh stays component-only.

export function storyCountLabel(count: number): string {
  return count === 1 ? '1 story' : `${count} stories`;
}

/** Stories touching a holding. A pre-search backend sends no storyCount during the deploy window. */
export function groupStoryCount(group: AssetNewsGroup): number {
  return group.storyCount ?? group.items.length;
}

export interface HoldingAccent {
  border: string;
  headerBg: string;
  chip: string;
}

// Section accent tokens (`crypto` / `equities`), never raw palette colors.
export const HOLDING_ACCENTS: Record<NewsBucket, HoldingAccent> = {
  crypto: { border: 'border-crypto/20', headerBg: 'bg-crypto/5', chip: 'bg-crypto/15' },
  equities: { border: 'border-equities/20', headerBg: 'bg-equities/5', chip: 'bg-equities/15' },
};
