/**
 * The stored phone as the digits a `tel:` or `wa.me` link needs, or `null` when
 * the value on the record cannot be dialled.
 *
 * Numbers are typed by hand into a free text field, so what comes back is
 * "(85) 99999-8888", "85999998888" or the occasional note somebody left in the
 * wrong box. Everything that is not a digit goes, and what is left has to look
 * like a Brazilian number before the app offers to call it — a link built from
 * junk is worse than no link, because it fails after the tap, in another app.
 *
 * The country code is added only when it is missing, and **length is what
 * decides that**, never the leading digits. `55` is both Brazil and the DDD of
 * Santa Maria/RS, so `55988887777` is genuinely ambiguous read left to right —
 * but not by length: a national number is 10 digits (landline: DDD + 8) or 11
 * (mobile: DDD + 9), and with the country code in front it is 12 or 13. Eleven
 * digits therefore cannot already carry a country code, so `55988887777` is a
 * Santa Maria mobile and gets `55` prefixed; only a 12- or 13-digit value is
 * treated as already prefixed.
 *
 * Anything else — too short to be a phone, or long enough to be a CNPJ or a
 * number from a country the clinic does not serve — returns `null`, and the
 * caller renders nothing at all rather than a dead button.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) return null;

  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;

  return null;
}

/** `tel:` wants the international form spelled out; `wa.me` wants bare digits. */
export const telHref = (whatsAppNumber: string): string => `tel:+${whatsAppNumber}`;

export const whatsAppHref = (whatsAppNumber: string): string => `https://wa.me/${whatsAppNumber}`;
