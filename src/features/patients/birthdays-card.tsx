import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { formatMonthName } from '@/core/format';
import type { Patient } from '@/domain/patients/patient';
import { birthdaysInMonth, type PatientBirthday } from '@/domain/patients/patient-birthdays';
import { Card, CardTitle } from '@/design-system/components/card';
import { cn } from '@/design-system/cn';
import { CakeIcon } from '@/design-system/components/icons';
import { Tag } from '@/design-system/components/tag';

/**
 * Who to wish a happy birthday this month.
 *
 * It sits on Início rather than on Pacientes because it is a *today* list, like
 * the recalls above it: the question it answers is "who should I contact", and
 * the answer stops being useful the month after. The whole calculation is
 * `birthdaysInMonth`; this component only decides how it is worded.
 *
 * `today` is handed in rather than read from the clock here. The month appears
 * three times on this card — in the title, in the filter, and in the "hoje"
 * badge — and three separate `new Date()` calls are three chances to straddle
 * midnight on the last day of a month and print a heading that disagrees with
 * the list under it. One clock read, one answer; the value is frozen for the
 * session, and a reload is what moves it on, which is the same bargain the
 * agenda's initial month makes.
 */
export function BirthdaysCard({
  patients,
  today,
  className,
}: {
  patients: readonly Patient[];
  /** The day the whole card describes — see above. Only its month is filtered on. */
  today: Date;
  className?: string;
}) {
  // Both figures walk every patient, so they are tied to the list identity
  // rather than recomputed on every unrelated render of the home screen.
  const { birthdays, withoutBirthDate } = useMemo(
    () => ({
      birthdays: birthdaysInMonth(patients, today),
      withoutBirthDate: patients.filter((patient) => patient.birthDate === null).length,
    }),
    [patients, today],
  );

  // Nothing to celebrate in an empty register, and the screen that matters then
  // is the one inviting the first patient — not a card apologising for having
  // no birthdays.
  if (patients.length === 0) return null;

  const month = formatMonthName(today);

  return (
    <Card className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center gap-3">
        <span className="bg-primary-container text-on-primary-container rounded-full p-2">
          <CakeIcon />
        </span>
        <CardTitle className="min-w-0 flex-1">Aniversariantes de {month}</CardTitle>
      </div>

      {birthdays.length === 0 ? (
        <p className="text-on-surface-variant text-sm">
          Nenhum paciente faz aniversário em {month}.
        </p>
      ) : (
        <ul className="flex flex-col">
          {birthdays.map((birthday) => (
            <li key={birthday.patient.id}>
              <BirthdayRow
                birthday={birthday}
                // The card only ever shows one month, so the day alone settles
                // it — no second date comparison to keep in step with the
                // filter above.
                isToday={birthday.day === today.getDate()}
              />
            </li>
          ))}
        </ul>
      )}

      {withoutBirthDate > 0 && (
        // Said out loud, for the same reason the age profile says it: this list
        // is only as complete as the register, and a clinic that has filled in
        // half the birth dates would otherwise read "quiet month" when the truth
        // is "we do not know".
        <p className="text-on-surface-variant text-xs">{missingLabel(withoutBirthDate)}</p>
      )}
    </Card>
  );
}

function BirthdayRow({ birthday, isToday }: { birthday: PatientBirthday; isToday: boolean }) {
  const { patient, day, turningAge } = birthday;

  return (
    <Link
      to={routes.patient(patient.id)}
      // The visible row is a number in a circle beside a name, which a screen
      // reader would announce as a bare digit. The label says the same thing as
      // a sentence instead.
      aria-label={rowLabel(patient.fullName, day, turningAge, isToday)}
      className="hover:bg-surface-container -mx-2 flex items-center gap-3 rounded-l px-2 py-2 transition-colors"
    >
      <span
        aria-hidden
        className={cn(
          'font-display nums flex size-10 shrink-0 items-center justify-center rounded-full font-bold',
          // The day of the person being celebrated today is the one thing on
          // this card worth the accent; the rest stay quiet so it stands out.
          isToday ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant',
        )}
      >
        {day}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{patient.fullName}</span>
        <span className="text-on-surface-variant block truncate text-sm">
          {ageLine(turningAge)}
        </span>
      </span>

      {isToday && <Tag tone="primary">Hoje</Tag>}
    </Link>
  );
}

/** "Faz 78 anos", "Faz 1 ano", or the honest line for a date that cannot be right. */
function ageLine(turningAge: number | null): string {
  if (turningAge === null) return 'Data de nascimento a conferir';
  return turningAge === 1 ? 'Faz 1 ano' : `Faz ${turningAge} anos`;
}

/** "Ana Souza, dia 14, faz 78 anos" — the row as one sentence. */
function rowLabel(
  fullName: string,
  day: number,
  turningAge: number | null,
  isToday: boolean,
): string {
  const when = isToday ? 'hoje' : `dia ${day}`;
  if (turningAge === null) return `${fullName}, ${when}`;
  return `${fullName}, ${when}, ${turningAge === 1 ? 'faz 1 ano' : `faz ${turningAge} anos`}`;
}

/** The footnote about the patients this list cannot know about. */
function missingLabel(count: number): string {
  return count === 1
    ? '1 paciente sem data de nascimento não entra nesta lista.'
    : `${count} pacientes sem data de nascimento não entram nesta lista.`;
}
