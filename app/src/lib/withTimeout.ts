// Wallet extensions don't always reject signTransaction's promise when the
// user dismisses the approval popup by clicking away or closing it, rather
// than an explicit Reject — some just leave it pending forever. Without a
// timeout, that means our try/catch/finally never fires, and a submit
// button stays stuck in its loading state permanently with no way to retry
// short of a page reload. Every wallet-signing call site wraps its call in
// this so an abandoned popup fails loudly instead of hanging silently.
//
// Three minutes by default: a locked wallet needs time for the password to be
// typed before the approval even appears. Giving up does not cancel the
// request, so if the person approves after this fires, the step can still go
// through; pages that matter re-check the real state after a failure.
export const WALLET_TIMEOUT_MS = 180_000
export const WALLET_TIMEOUT_MESSAGE = "Your wallet didn't respond in time. Nothing was sent. Please try again."

export function withTimeout<T>(promise: Promise<T>, ms = WALLET_TIMEOUT_MS, message = WALLET_TIMEOUT_MESSAGE): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
