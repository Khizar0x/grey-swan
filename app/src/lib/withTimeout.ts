// Wallet extensions don't always reject signTransaction's promise when the
// user dismisses the approval popup by clicking away or closing it, rather
// than an explicit Reject — some just leave it pending forever. Without a
// timeout, that means our try/catch/finally never fires, and a submit
// button stays stuck in its loading state permanently with no way to retry
// short of a page reload. Every wallet-signing call site wraps its call in
// this so an abandoned popup fails loudly instead of hanging silently.
export function withTimeout<T>(promise: Promise<T>, ms = 10_000, message = "Wallet didn't respond — try again."): Promise<T> {
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
