import type { Program } from '@coral-xyz/anchor'
import type { Greyswan } from '../idl/greyswan.ts'
import { enumKey } from './listing'
import type { RentalAccountEntry } from './useRentals'

export type DisputeAccount = Awaited<ReturnType<Program<Greyswan>['account']['dispute']['fetch']>>
export type ConfigAccount = Awaited<ReturnType<Program<Greyswan>['account']['config']['fetch']>>
export type Role = 'admin' | 'reviewer'

// Where a dispute stands, in the words a reviewer needs. `group` decides which
// section of the page it sits in.
export type StageGroup = 'needs' | 'waiting' | 'posted' | 'resolved'
export function stageOf(kind: Record<string, object>, dispute: DisputeAccount | null): { label: string; group: StageGroup } {
  if (!dispute) return { label: 'Older dispute', group: 'needs' }
  const status = enumKey(dispute.status)
  const isDamage = enumKey(kind) === 'returnIssue'
  switch (status) {
    case 'appealed':
      return { label: 'Appealed', group: 'needs' }
    case 'voided':
      return { label: 'First review set aside', group: 'needs' }
    case 'verdictPosted':
      return { label: 'First review posted', group: 'posted' }
    case 'open':
      return isDamage ? { label: 'Waiting for the first review', group: 'waiting' } : { label: 'Needs a reviewer', group: 'needs' }
    default:
      return { label: status, group: 'needs' }
  }
}

export function disputePathLabel(kind: Record<string, object>): string {
  switch (enumKey(kind)) {
    case 'returnIssue':
      return 'Owner flagged after return'
    case 'arrivalIssue':
      return 'Renter rejected on arrival'
    case 'notReturned':
      return 'Owner says it was not returned'
    case 'returnNotReceived':
      return 'Owner says the return never arrived'
    case 'adminOpened':
      return 'Opened by the team'
    default:
      return enumKey(kind)
  }
}


export function groupOf(r: RentalAccountEntry, dispute: DisputeAccount | null): StageGroup {
  if (enumKey(r.account.status) === 'resolved') return 'resolved'
  return stageOf(r.account.disputeKind, dispute).group
}
