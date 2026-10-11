// The named shots every handover phase walks through. Ids are written into
// the pinned manifest, so keep them stable.
export interface ShotSpec {
  id: string
  label: string
  hint: string
  required: boolean
  // The phase code must be written on paper and visible in this shot.
  showsCode?: boolean
}

const ITEM_SHOTS: ShotSpec[] = [
  { id: 'front', label: 'Front', hint: 'The front of the item, with your paper code beside it.', required: true, showsCode: true },
  { id: 'back', label: 'Back', hint: 'The back of the item.', required: true },
  { id: 'left', label: 'Left side', hint: 'The left side of the item.', required: true },
  { id: 'right', label: 'Right side', hint: 'The right side of the item.', required: true },
  { id: 'top', label: 'Top', hint: 'The item from above.', required: true },
  { id: 'underside', label: 'Underside', hint: 'The bottom of the item.', required: true },
  { id: 'label', label: 'Label or serial number', hint: 'Any label, serial number or model plate, close enough to read.', required: true },
  { id: 'accessories', label: 'Accessories', hint: 'Everything that comes with it (cables, cases, chargers). Skip if there are none.', required: false },
]

const PARCEL_PACKED: ShotSpec = {
  id: 'parcel_packed',
  label: 'Packed parcel',
  hint: 'The sealed parcel with the shipping label visible.',
  required: true,
}

const PARCEL_UNOPENED: ShotSpec = {
  id: 'parcel_unopened',
  label: 'Unopened parcel',
  hint: 'The parcel exactly as it arrived, before you open it.',
  required: true,
}

export function shotLabel(id: string): string {
  if (id.startsWith('closeup_')) return `Close-up: ${shotLabel(id.slice('closeup_'.length))}`
  return [...ITEM_SHOTS, PARCEL_PACKED, PARCEL_UNOPENED, ...MISSING_ITEM_SHOTS].find((s) => s.id === id)?.label ?? id
}

// Phases 1 and 3 end with the packed parcel; phases 2 and 4 start with the
// unopened one. Handing over in person has no parcel at all.
export function shotsForPhase(phase: 1 | 2 | 3 | 4, hasParcel: boolean): ShotSpec[] {
  if (!hasParcel) return ITEM_SHOTS
  return phase === 1 || phase === 3 ? [...ITEM_SHOTS, PARCEL_PACKED] : [PARCEL_UNOPENED, ...ITEM_SHOTS]
}

// Used when a renter reports that the item never arrived: there is nothing to
// photograph except where it should have been left.
export const MISSING_ITEM_SHOTS: ShotSpec[] = [
  { id: 'delivery_spot', label: 'Where it should have arrived', hint: 'Your door, porch or delivery spot, with your paper code beside it.', required: true, showsCode: true },
]

// One required close-up per area the owner says is damaged.
export function closeupShots(areaIds: string[]): ShotSpec[] {
  return areaIds.map((id, i) => ({
    id: `closeup_${id}`,
    label: `Close-up: ${shotLabel(id)}`,
    hint: 'Get close to the damage so it is clear and in focus.',
    required: true,
    showsCode: i === 0,
  }))
}

export const AREA_CHOICES: { id: string; label: string }[] = ITEM_SHOTS.map((s) => ({ id: s.id, label: s.label }))
