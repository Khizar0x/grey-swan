// The Figma mockup's `Category` type ("Cameras" | "Drones" | "Music" |
// "Antique" | "Rare") flattens two independent on-chain concepts into one
// dropdown. The real program keeps them separate (see CLAUDE.md): `category`
// is always one of these five, and `rarity_tier` (Common/Rare/Antique) is an
// orthogonal field that also drives the 45% deposit cap. Filter chips below
// use the real category enum; rarity shows as its own badge on cards.

export const CATEGORIES = [
  { key: 'photographyVideo', label: 'Photography & Video' },
  { key: 'musicAudio', label: 'Music & Audio' },
  { key: 'toolsEquipment', label: 'Tools & Equipment' },
  { key: 'sportsOutdoor', label: 'Sports & Outdoor' },
  { key: 'other', label: 'Other' },
] as const

export type CategoryKey = (typeof CATEGORIES)[number]['key']

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
