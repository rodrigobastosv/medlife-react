/**
 * The Flutter app returns `Result<MLError, T>` from every repository call and
 * unwraps it with `.when(failure, success)`. This port **throws** instead, and
 * that is a deliberate translation rather than a shortcut.
 *
 * The reason is TanStack Query. It already models every async read as
 * `{ data, error, isPending }`, and it decides what to do — retry, keep the
 * previous data, surface an error boundary — by watching whether the promise
 * rejects. A repository that resolves with a `Failure` object looks like a
 * *success* to the query cache, so the caller would have to re-implement, by
 * hand and at every call site, the branching the library already does. Two error
 * channels in one codebase is worse than either alone.
 *
 * What the `Result` type was really buying is that a failure carries a sentence
 * the user can read. `AppError` keeps exactly that: a human message plus the
 * original cause for the console.
 */
export class AppError extends Error {
  /**
   * `cause` is assigned in the body rather than declared as a constructor
   * parameter property (`constructor(readonly cause)`). Parameter properties are
   * one of the few TypeScript features that emit runtime code, which
   * `erasableSyntaxOnly` forbids — the setting that guarantees every `.ts` file
   * here is valid JavaScript once the types are stripped, and therefore runnable
   * by Node and by any bundler with no TypeScript-specific transform.
   *
   * @param message shown to the user: Portuguese, a full sentence, no codes.
   * @param cause the underlying failure (a PostgrestError, an AuthError, …).
   */
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AppError';
  }
}

/**
 * Anything can be thrown in JavaScript — a string, an object, `undefined`. This
 * narrows whatever arrived into a sentence worth showing.
 */
export function messageOf(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Algo deu errado. Tente novamente.';
}
