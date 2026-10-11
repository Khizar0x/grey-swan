import { useWallet } from '@solana/wallet-adapter-react'
import type { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConversationThread } from '../components/ConversationThread'
import { IconCamera } from '../components/icons'
import { useAuthContext } from '../lib/AuthContext'
import { formatMessageTime } from '../lib/formatMessageTime'
import { enumKey } from '../lib/listing'
import { C, FONT_HEAD } from '../lib/theme'
import { useConversationSummaries } from '../lib/useConversationSummaries'
import type { ListingAccountEntry } from '../lib/useListings'
import { useListingsByKeys } from '../lib/useListingsByKeys'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import type { RentalAccountEntry } from '../lib/useRentals'
import { useRentals } from '../lib/useRentals'

const PANE_HEIGHT = '34rem'

interface Conversation {
  rentalPubkey: string
  listing: ListingAccountEntry['account'] | undefined
  counterpartyPubkey: string
  counterpartyRole: 'Owner' | 'Renter'
  locked: boolean
  lastMessageText: string
  lastMessageAt: number
  lastMessageIsMine: boolean
  unreadCount: number
}

function Gate({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <p className="text-sm" style={{ color: C.muted }}>
        {message}
      </p>
    </div>
  )
}

function Thumbnail({ photos }: { photos: string | undefined }) {
  const { urls } = usePhotoUrls(photos)
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: C.surface2 }}>
      {urls[0] ? (
        <img src={urls[0]} alt="" className="h-full w-full object-cover" />
      ) : (
        <span style={{ color: C.faint }}>
          <IconCamera />
        </span>
      )}
    </div>
  )
}

function ConversationRow({ conversation, active }: { conversation: Conversation; active: boolean }) {
  const itemName = conversation.listing?.itemName ?? 'Item'
  return (
    <Link
      to={`/messages/${conversation.rentalPubkey}`}
      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:opacity-90"
      style={{ background: active ? C.surface2 : 'transparent' }}
    >
      <Thumbnail photos={conversation.listing?.photos} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold" style={{ color: C.cream }}>
            {itemName}
          </p>
          <span className="shrink-0 text-[10px]" style={{ color: C.faint }}>
            {formatMessageTime(conversation.lastMessageAt)}
          </span>
        </div>
        <p className="truncate text-xs" style={{ color: conversation.unreadCount > 0 ? C.cream : C.faint, fontWeight: conversation.unreadCount > 0 ? 600 : 400 }}>
          {conversation.lastMessageIsMine ? 'You: ' : ''}
          {conversation.lastMessageText}
        </p>
      </div>
      {conversation.unreadCount > 0 && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold" style={{ background: C.rust, color: C.onAccent }}>
          {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
        </span>
      )}
    </Link>
  )
}

// Shared by the list (via a summary) and the selected pane (which must open
// even for a rental with zero messages yet — the very first message to a
// party always starts from zero, so the thread can't wait on conversation
// summary data that, by definition, doesn't exist until after that).
function rentalParty(rental: RentalAccountEntry, myPubkey: PublicKey) {
  const isOwner = myPubkey.equals(rental.account.owner)
  const counterpartyRole: 'Owner' | 'Renter' = isOwner ? 'Renter' : 'Owner'
  return {
    counterpartyPubkey: isOwner ? rental.account.renter.toBase58() : rental.account.owner.toBase58(),
    counterpartyRole,
    locked: enumKey(rental.account.status) === 'completed',
  }
}

export function Messages() {
  const { publicKey } = useWallet()
  const { token } = useAuthContext()
  const { rentalPubkey: selectedPubkey } = useParams<{ rentalPubkey?: string }>()
  const { rentals, loading: rentalsLoading } = useRentals()

  const mine = useMemo(
    () => (publicKey ? rentals.filter((r) => r.account.owner.equals(publicKey) || r.account.renter.equals(publicKey)) : []),
    [rentals, publicKey],
  )
  const listingsMap = useListingsByKeys(mine.map((r) => r.account.listing))
  const rentalPubkeys = useMemo(() => mine.map((r) => r.publicKey.toBase58()), [mine])
  const { summaries, loading: summariesLoading } = useConversationSummaries(rentalPubkeys, token, true)

  if (!publicKey) {
    return <Gate message="Connect a wallet to see your messages." />
  }
  if (!token) {
    return <Gate message="Finish signing in with your wallet to see your messages." />
  }

  const conversations: Conversation[] = mine
    .filter((r) => summaries.has(r.publicKey.toBase58()))
    .map((r) => {
      const pk = r.publicKey.toBase58()
      return {
        rentalPubkey: pk,
        listing: listingsMap.get(r.account.listing.toBase58()),
        ...rentalParty(r, publicKey),
        ...summaries.get(pk)!,
      }
    })
    .sort((a, b) => b.lastMessageAt - a.lastMessageAt)

  const loading = rentalsLoading || summariesLoading
  // Resolved independently of `conversations` (which only lists rentals
  // that already have a message) — a deep link from a rental's Messages row
  // must open the thread even before either party has said anything yet.
  const selectedRental = selectedPubkey ? mine.find((r) => r.publicKey.toBase58() === selectedPubkey) : undefined
  const selectedListing = selectedRental ? listingsMap.get(selectedRental.account.listing.toBase58()) : undefined
  const selectedParty = selectedRental ? rentalParty(selectedRental, publicKey) : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 text-3xl font-bold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
        Messages
      </h1>
      <p className="mb-8 text-sm" style={{ color: C.faint }}>
        Conversations with owners and renters about your rentals.
      </p>

      <div className="flex gap-6">
        <div
          className={`${selectedPubkey ? 'hidden md:flex' : 'flex'} w-full flex-col gap-1 overflow-y-auto rounded-2xl p-3 md:w-80 md:shrink-0`}
          style={{ background: C.surface, border: `1px solid ${C.border}`, height: PANE_HEIGHT }}
        >
          {loading && conversations.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: C.faint }}>
              Loading…
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm leading-relaxed" style={{ color: C.faint }}>
              No conversations yet. Messages for your rentals will show up here.
            </p>
          ) : (
            conversations.map((c) => <ConversationRow key={c.rentalPubkey} conversation={c} active={c.rentalPubkey === selectedPubkey} />)
          )}
        </div>

        <div
          className={`${selectedPubkey ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col overflow-hidden rounded-2xl`}
          style={{ background: C.surface, border: `1px solid ${C.border}`, height: PANE_HEIGHT }}
        >
          {selectedRental && selectedParty ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3" style={{ borderColor: C.border }}>
                <Link to="/messages" aria-label="Back to messages" className="md:hidden" style={{ color: C.muted }}>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <span className="truncate text-sm font-semibold" style={{ fontFamily: FONT_HEAD, color: C.cream }}>
                  {selectedListing?.itemName ?? 'Item'}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <ConversationThread
                  rentalPubkey={selectedRental.publicKey.toBase58()}
                  counterpartyPubkey={selectedParty.counterpartyPubkey}
                  counterpartyRole={selectedParty.counterpartyRole}
                  token={token}
                  locked={selectedParty.locked}
                />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm" style={{ color: C.faint }}>
                {selectedPubkey ? "Couldn't find that conversation." : 'Select a conversation to see your messages.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
