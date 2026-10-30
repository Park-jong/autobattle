export interface ActionCue {
  kind: 'sale' | 'card' | 'equipment' | 'purchase' | 'event';
  label: string;
  amount?: number;
  unitId?: string;
  instanceId?: number;
  cardType?: string;
  origin?: { col: number; row: number };
  benchIndex?: number | null;
  targets?: readonly { col: number; row: number }[];
}
