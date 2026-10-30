import type { MergeSource } from './unitMerge';

export interface ActionCue {
  kind: 'sale' | 'card' | 'equipment' | 'purchase' | 'event' | 'merge' | 'reroll' | 'experience' | 'shopLock' | 'summon' | 'recall';
  label: string;
  amount?: number;
  unitId?: string;
  instanceId?: number;
  cardType?: string;
  origin?: { col: number; row: number };
  benchIndex?: number | null;
  targets?: readonly { col: number; row: number }[];
  star?: number;
  fromStar?: number;
  shopSlot?: number;
  level?: number;
  previousLevel?: number;
  locked?: boolean;
  mergeSources?: readonly MergeSource[];
}
