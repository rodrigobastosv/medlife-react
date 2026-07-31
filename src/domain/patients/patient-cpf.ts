/**
 * What counts as "the same CPF".
 *
 * The column stores the CPF as it was typed — this app has no mask, and the
 * Flutter app that shares the table has its own idea of formatting — so
 * "12345678901" and "123.456.789-01" are the same person written two ways.
 * Deciding that is a rule about patients, not about the form or the repository,
 * so it lives here and both of them ask.
 *
 * Nothing here validates the check digits. A CPF that is well-formed but
 * arithmetically impossible is a data-entry problem; refusing to *look* for it
 * would only mean the duplicate it would have found is created instead.
 */

const CPF_LENGTH = 11;

/** The CPF as digits only: "123.456.789-01" → "12345678901". */
export const cpfDigits = (value: string): string => value.replace(/\D/g, '');

/**
 * Whether there is enough of a CPF to go looking for it.
 *
 * The lookup only makes sense on a whole one: eight digits match nobody, and a
 * half-typed CPF that "found" a patient would be worse than useless.
 */
export const isCompleteCpf = (value: string): boolean => cpfDigits(value).length === CPF_LENGTH;

/**
 * The spellings of one CPF that may be sitting in the column, most specific
 * first.
 *
 * Two, not every conceivable one: bare digits and the standard mask are what
 * the two apps actually produce. Searching for them with an `in` list keeps the
 * check a single indexed equality lookup, where a `like` over a normalised
 * expression would be a scan of the whole table on every blur.
 *
 * Empty when the value is not a complete CPF, so a caller that forgets to check
 * still cannot build a query that matches everybody.
 */
export function cpfSpellings(value: string): string[] {
  const digits = cpfDigits(value);
  if (digits.length !== CPF_LENGTH) return [];

  const masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return [digits, masked];
}
