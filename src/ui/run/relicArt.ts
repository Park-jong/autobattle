const IDS = [
  'old_baton', 'merchants_scale', 'bulwark_crest', 'ember_charm', 'blood_ledger', 'trophy_chain', 'loot_sack', 'field_tent', 'veteran_manual',
  'blood_oath', 'fifth_banner', 'twin_mirror', 'heralds_bag', 'tacticians_journal', 'war_record', 'fat_purse', 'wholesale_voucher',
  'rift_heart', 'legion_seal', 'iron_heart', 'war_crown', 'golden_ledger', 'mana_wellspring', 'phoenix_ember', 'arcane_codex', 'strategist_satchel', 'master_forge', 'grand_banner',
] as const;
export const RELIC_ART_IDS: readonly string[] = IDS;
const known = new Set<string>(IDS);

/** Web-sized generated art; stable IDs keep presentation independent of localization. */
export function relicArtUrl(id: string, base = import.meta.env.BASE_URL): string | null {
  return known.has(id) ? `${base}relics/${id}.webp` : null;
}
