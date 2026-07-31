import { cn } from '@/design-system/cn';
import { buttonClasses } from '@/design-system/components/button-classes';
import { ChatIcon, PhoneIcon } from '@/design-system/components/icons';
import { telHref, toWhatsAppNumber, whatsAppHref } from '@/domain/patients/patient-phone';

/**
 * "Ligar" and "WhatsApp" for a patient, or nothing at all.
 *
 * The recall workflow ends outside this app — the number gets read off the
 * screen and typed into the dialer or into WhatsApp. These two links remove that
 * step, which is the whole point, so they live in a component both the
 * appointment row and the patient's record can render rather than being written
 * twice with two different sets of edge cases.
 *
 * When `toWhatsAppNumber` cannot make a number out of what is stored, this
 * renders **nothing** — not a disabled button. A greyed-out control still looks
 * like the action exists and invites a second click; the honest answer to "there
 * is no phone on this record" is an absence.
 */
export function PatientContactActions({
  phone,
  patientName,
  className,
}: {
  phone: string | null;
  /** Only used for the accessible names, which is why an absent one is fine. */
  patientName?: string | null;
  className?: string;
}) {
  const number = toWhatsAppNumber(phone);
  if (number === null) return null;

  // In a list every row has the same two buttons, so "Ligar" on its own is
  // ambiguous to anyone navigating by control rather than by row. The name makes
  // each one unique; without it the fallback is still better than nothing.
  const who = patientName === null || patientName === undefined ? 'o paciente' : patientName;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <a
        href={telHref(number)}
        aria-label={`Ligar para ${who}`}
        className={buttonClasses({ variant: 'outline', size: 'sm' })}
      >
        <PhoneIcon className="size-4" />
        Ligar
      </a>
      {/* A new tab, because WhatsApp Web is a destination the user stays in:
          navigating the app away from the recall list would lose the place they
          are working through. `noreferrer` also covers `noopener`. */}
      <a
        href={whatsAppHref(number)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Abrir conversa no WhatsApp com ${who}`}
        className={buttonClasses({ variant: 'outline', size: 'sm' })}
      >
        <ChatIcon className="size-4" />
        WhatsApp
      </a>
    </div>
  );
}
