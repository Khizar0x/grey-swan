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

function ListingPhotoFallback({ type }: { type: 'loading' | 'missing' | 'failed' }) {
  const isLoading = type === 'loading'
  return (
    <div
      className={`flex aspect-square w-full flex-col items-center justify-center gap-1.5 p-3 text-center transition-colors ${
        isLoading ? 'animate-pulse' : ''
      }`}
      style={{ background: C.surface2 }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: C.subtleBg, border: `1px solid ${C.border}`, color: C.muted }}
      >
        <IconCamera />
      </div>
      <span className="text-[11px] font-medium" style={{ color: C.faint }}>
        {isLoading ? 'Loading photo…' : 'No photo yet'}
      </span>
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
      className="group block overflow-hidden rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="relative overflow-hidden">
        {urls[0] ? (
          <div className="aspect-square overflow-hidden" style={{ background: C.surface2 }}>
            <RetryImage
              src={urls[0]}
              alt={listing.itemName}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              fallback={<ListingPhotoFallback type="failed" />}
            />
          </div>
        ) : (
          <ListingPhotoFallback type={photosLoading ? 'loading' : 'missing'} />
        )}
        <span
          className="absolute left-2.5 top-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"
          style={{ background: catColor, color: C.overlayText }}
        >
          {categoryLabel(listing.category)}
        </span>
        {rarity !== 'common' && (
          <span
            className="absolute right-2.5 top-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"
            style={{ background: C.gold, color: C.overlayText }}
          >
            {rarityLabel(listing.rarityTier)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="truncate text-sm font-bold leading-snug transition-colors group-hover:opacity-85" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
          {listing.itemName}
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold" style={{ color: C.cream }}>
            {formatSol(listing.rentalPrice)}
          </span>
          <span className="text-xs" style={{ color: C.faint }}>
            /week
          </span>
        </div>
        <div className="truncate text-[11px] font-medium" style={{ color: C.trust }}>
          {formatSol(listing.depositAmount)} deposit safely held
        </div>
      </div>
    </Link>
  )
}
