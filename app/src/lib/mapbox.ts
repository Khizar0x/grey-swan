// Exported so components using Mapbox's own UI widgets (e.g. AddressAutofill)
// can pass it directly, rather than this file being the only thing that
// knows it exists.
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export interface GeocodeResult {
  lat: number
  lng: number
  placeName: string
  relevance: number
}

interface MapboxFeature {
  center: [number, number]
  place_name: string
  relevance: number
}

interface MapboxGeocodeResponse {
  features?: MapboxFeature[]
}

async function geocode(query: string, types: string): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) throw new Error("Address lookup isn't configured (missing Mapbox token).")
  const trimmed = query.trim()
  if (!trimmed) return null

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=${types}`
  const res = await fetch(url)
  if (!res.ok) throw new Error("Couldn't reach the address lookup service. Try again shortly.")

  const data = (await res.json()) as MapboxGeocodeResponse
  const feature = data.features?.[0]
  if (!feature) return null

  const [lng, lat] = feature.center
  return { lat, lng, placeName: feature.place_name, relevance: feature.relevance }
}

// A full delivery address needs street-level precision — a bare city or a
// typo'd street shouldn't pass as "verified." Mapbox's own relevance score
// (0–1) is how confident it is the query matches the returned feature;
// below 0.5 it's usually matched on far less than what was actually typed.
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const result = await geocode(address, 'address')
  if (!result || result.relevance < 0.5) return null
  return result
}

// A general area (city, neighborhood, or postcode) — used only for the
// straight-line pickup-distance estimate, so city-level precision is fine
// and there's no relevance floor.
export async function geocodeArea(area: string): Promise<GeocodeResult | null> {
  return geocode(area, 'place,postcode,locality,neighborhood,region')
}

// Reverse geocoding — coordinates to a readable area name, for "Use my
// current location." Same city-level precision as geocodeArea above (the
// saved area is never used for anything needing street precision), so this
// asks for the same broad place types rather than a street address.
export async function reverseGeocodeArea(lat: number, lng: number): Promise<string | null> {
  if (!MAPBOX_TOKEN) throw new Error("Address lookup isn't configured (missing Mapbox token).")

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1&types=place,postcode,locality,neighborhood`
  const res = await fetch(url)
  if (!res.ok) throw new Error("Couldn't reach the location lookup service. Try again shortly.")

  const data = (await res.json()) as MapboxGeocodeResponse
  return data.features?.[0]?.place_name ?? null
}

// Straight-line ("as the crow flies") distance — deliberately not a real
// routing/travel-time call, per the brief: close enough for a renter to
// judge whether pickup is realistic, without a Directions/Matrix API call.
export function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
