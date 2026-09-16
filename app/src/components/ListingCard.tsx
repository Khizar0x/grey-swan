import type { PublicKey } from '@solana/web3.js'
import { Link } from 'react-router-dom'
import { formatSol } from '../lib/format'
import { categoryLabel, enumKey, rarityLabel } from '../lib/listing'
import { C, FONT_HEAD } from '../lib/theme'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { IconCamera } from './icons'

export interface ListingCardData {
  publicKey: PublicKey
  itemName: string
  owner: PublicKey
  category: Record<string, object>
  rarityTier: Record<string, object>
  rentalPrice: Parameters<typeof formatSol>[0]
  depositAmount: Parameters<typeof formatSol>[0]
  photos: string
}

function PhotoPlaceholder() {
  return (
    <div className="flex aspect-[4/3] items-center justify-center" style={{ background: C.surface2 }}>
      <div style={{ color: C.faint }}>
        <IconCamera />
      </div>
    </div>
  )
}

export function ListingCard({ listing }: { listing: ListingCardData }) {
  const owner = `${listing.owner.toBase58().slice(0, 4)}...${listing.owner.toBase58().slice(-4)}`
  const rarity = enumKey(listing.rarityTier)
  const { urls } = usePhotoUrls(listing.photos)

  return (
    <Link
      to={`/listing/${listing.publicKey.toBase58()}`}
      className="group block overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="relative overflow-hidden">
        {urls[0] ? (
          <div className="aspect-[4/3] overflow-hidden" style={{ background: C.surface2 }}>
            <img src={urls[0]} alt={listing.itemName} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          </div>
        ) : (
          <PhotoPlaceholder />
        )}
        <div className="absolute right-3 top-3 flex gap-1.5">
          {rarity !== 'common' && (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: 'rgba(201,162,75,0.14)', color: C.gold, border: '1px solid rgba(201,162,75,0.35)' }}
            >
              {rarityLabel(listing.rarityTier)}
            </span>
          )}
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: 'rgba(250,247,242,0.88)', border: `1px solid ${C.border}`, color: C.muted }}
          >
            {categoryLabel(listing.category)}
          </span>
        </div>
      </div>
      <div className="p-5">
        <h3 className="mb-1 text-base font-semibold leading-snug" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          {listing.itemName}
        </h3>
        <p className="mb-4 text-sm" style={{ color: C.faint }}>
          Listed by {owner}
        </p>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div>
              <span className="text-lg font-bold" style={{ color: C.cream }}>
                {formatSol(listing.rentalPrice)}
              </span>
              <span className="text-sm" style={{ color: C.faint }}>
                /week
              </span>
            </div>
            <div className="mt-0.5 text-xs" style={{ color: C.faint }}>
              + {formatSol(listing.depositAmount)} deposit (refundable)
            </div>
          </div>
          <span
            className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all group-hover:opacity-90"
            style={{ background: C.primary, color: C.onAccent }}
          >
            View
          </span>
        </div>
      </div>
    </Link>
  )
}
