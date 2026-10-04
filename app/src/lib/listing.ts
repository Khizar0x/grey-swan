// The Figma mockup's `Category` type ("Cameras" | "Drones" | "Music" |
// "Antique" | "Rare") flattens two independent on-chain concepts into one
// dropdown. The real program keeps them separate (see CLAUDE.md): `category`
// is one of these eleven (the on-chain `Category` enum — state.rs — was
// expanded from 5 to 11 to match; new variants were appended after the
// original five to keep existing Listing accounts' stored values valid), and
// `rarity_tier` (Common/Rare/Antique) is an orthogonal field that also
// drives the 45% deposit cap. Filter chips below use the real category
// enum; rarity shows as its own badge on cards.

// Bold, distinct colors per department — the eBay/Amazon-style header and
// home grid use these to tell categories apart at a glance instead of one
// flat accent color for everything.
export const CATEGORIES = [
  { key: 'photographyVideo', label: 'Photography & Video', color: '#2361D8' },
  { key: 'musicAudio', label: 'Music & Audio', color: '#8B3FD9' },
  { key: 'toolsEquipment', label: 'Tools', color: '#E0611C' },
  { key: 'sportsOutdoor', label: 'Sports & Outdoor', color: '#1C9A56' },
  { key: 'electronics', label: 'Electronics', color: '#0E7490' },
  { key: 'homeGarden', label: 'Home & Garden', color: '#A16207' },
  { key: 'eventsParty', label: 'Events & Party', color: '#C026D3' },
  { key: 'fashionCostumes', label: 'Fashion & Costumes', color: '#E11D48' },
  { key: 'babyKids', label: 'Baby & Kids', color: '#4D7C0F' },
  { key: 'digitalCloud', label: 'Digital & Cloud', color: '#4338CA' },
  { key: 'other', label: 'Other', color: '#D6357C' },
] as const

export type CategoryKey = (typeof CATEGORIES)[number]['key']

// Digital & Cloud items have no physical handover at all — this is the one
// place that matters for now (skip forcing a delivery-method choice at rent
// time). The rest of the virtual-rentals feature (skipping handover phases,
// etc.) is separate, later work — see CLAUDE.md scope notes.
export function isVirtualCategory(key: CategoryKey): boolean {
  return key === 'digitalCloud'
}

export const RARITY_TIERS = [
  { key: 'common', label: 'Common' },
  { key: 'rare', label: 'Rare' },
  { key: 'antique', label: 'Antique' },
] as const

export type RarityKey = (typeof RARITY_TIERS)[number]['key']

// Anchor encodes/decodes Rust unit-variant enums as single-key objects, e.g.
// `{ photographyVideo: {} }`. This pulls the one key back out.
export function enumKey<K extends string>(value: Record<K, object>): K {
  return Object.keys(value)[0] as K
}

export function categoryLabel(value: Record<string, object>): string {
  const key = enumKey(value)
  return CATEGORIES.find((c) => c.key === key)?.label ?? key
}

export function categoryColor(value: Record<string, object>): string {
  const key = enumKey(value)
  return CATEGORIES.find((c) => c.key === key)?.color ?? '#6B6259'
}

export function rarityLabel(value: Record<string, object>): string {
  const key = enumKey(value)
  return RARITY_TIERS.find((r) => r.key === key)?.label ?? key
}

export function categoryArg(key: CategoryKey) {
  return { [key]: {} } as Record<CategoryKey, object>
}

export function rarityArg(key: RarityKey) {
  return { [key]: {} } as Record<RarityKey, object>
}
