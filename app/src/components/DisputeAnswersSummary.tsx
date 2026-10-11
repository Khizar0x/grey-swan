import { damageTypeLabel, type DisputeAnswers } from '../lib/disputeAnswersApi'
import { shotLabel } from '../lib/handoverShots'
import { C } from '../lib/theme'
import { usePhotoUrls } from '../lib/usePhotoUrls'
import { RetryImage } from './RetryImage'

const YNU_TEXT = { yes: 'Yes', no: 'No', unsure: 'Not sure' } as const

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span style={{ color: C.faint }}>{label}</span>
      <span className="text-right" style={{ color: C.cream }}>
        {value}
      </span>
    </div>
  )
}

// What each side told us, read-only. Shown to the two parties and reviewers.
export function DisputeAnswersSummary({ answers }: { answers: DisputeAnswers }) {
  const { urls, shots } = usePhotoUrls(answers.owner?.photosCid)
  if (!answers.owner && !answers.renter) return null
  return (
    <div className="flex flex-col gap-5 text-left">
      {answers.owner && (
        <div className="flex flex-col gap-2 rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
            The owner reported
          </p>
          <Row label="Where" value={answers.owner.areas.map(shotLabel).join(', ')} />
          <Row label="What" value={`${damageTypeLabel(answers.owner.damageType)}, ${answers.owner.severity}`} />
          {answers.owner.missingAccessories && <Row label="Missing" value={answers.owner.missingAccessories} />}
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            "{answers.owner.statement}"
          </p>
          {urls.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {urls.map((url, i) => (
                <div key={url}>
                  <div className="aspect-square overflow-hidden rounded-lg" style={{ border: `1px solid ${C.border}` }}>
                    <RetryImage src={url} alt={shots[i] ? shotLabel(shots[i]!.shot) : `Close-up ${i + 1}`} className="h-full w-full object-cover" />
                  </div>
                  {shots[i] && (
                    <p className="mt-1 text-xs" style={{ color: shots[i]!.capture === 'uploaded' ? C.rust : C.faint }}>
                      {shotLabel(shots[i]!.shot)}
                      {shots[i]!.capture === 'uploaded' ? ', uploaded, not captured' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {answers.renter && (
        <div className="flex flex-col gap-2 rounded-xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: C.faint }}>
            The renter responded
          </p>
          <Row label="Agrees there is damage" value={answers.renter.agrees === 'yes' ? 'Yes' : 'No'} />
          <Row label="Happened during use" value={YNU_TEXT[answers.renter.duringUse]} />
          <Row label="Could have happened in packing or posting" value={YNU_TEXT[answers.renter.duringPacking]} />
          <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
            "{answers.renter.statement}"
          </p>
        </div>
      )}
    </div>
  )
}
