import type { PublicKey } from '@solana/web3.js'
import { Link } from 'react-router-dom'
import { formatSol } from '../lib/format'
import { categoryColor, categoryLabel, enumKey, rarityLabel } from '../lib/listing'
import { C, FONT_HEAD } from '../lib/theme'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { IconCamera } from './icons'
import { RetryImage } from './RetryImage'

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

function PhotoPlaceholder({ loading }: { loading?: boolean }) {
  return (
    <div
      className={`flex aspect-[4/3] items-center justify-center ${loading ? 'animate-pulse' : ''}`}
      style={{ background: C.surface2 }}
    >
      <div style={{ color: C.faint }}>
        <IconCamera />
      </div>
    </div>
  )
}

export function ListingCard({ listing }: { listing: ListingCardData }) {
  const rarity = enumKey(listing.rarityTier)
  const { urls, loading: photosLoading } = usePhotoUrls(listing.photos)
  const catColor = categoryColor(listing.category)

  return (
    <Link
      to={`/listing/${listing.publicKey.toBase58()}`}
      className="group block overflow-hidden rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="relative overflow-hidden">
        {urls[0] ? (
          <div className="aspect-square overflow-hidden" style={{ background: C.surface2 }}>
            <RetryImage src={urls[0]} alt={listing.itemName} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          </div>
        ) : (
          <PhotoPlaceholder loading={photosLoading} />
        )}
        <span
          className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: catColor, color: '#FFFFFF' }}
        >
          {categoryLabel(listing.category)}
        </span>
        {rarity !== 'common' && (
          <span
            className="absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: C.gold, color: '#FFFFFF' }}
          >
            {rarityLabel(listing.rarityTier)}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="mb-1 truncate text-sm font-bold leading-snug" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          {listing.itemName}
        </h3>
        <div>
          <span className="text-sm font-bold" style={{ color: C.cream }}>
            {formatSol(listing.rentalPrice)}
          </span>
          <span className="text-xs" style={{ color: C.faint }}>
            /week
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11px]" style={{ color: C.faint }}>
          + {formatSol(listing.depositAmount)} deposit
        </div>
      </div>
    </Link>
  )
}
