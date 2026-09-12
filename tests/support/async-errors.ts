/**
 * Awaits a promise that is expected to reject and returns the error.
 *
 * Bun types `expect(...).rejects.toThrow()` as void, so asserting on a captured
 * error keeps both the message and the types honest.
 */
export async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error(`Expected an Error rejection but received ${typeof error}`)
  }

  throw new Error("Expected the promise to reject, but it resolved")
}
