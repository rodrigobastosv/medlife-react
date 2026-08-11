import {
  slotDurationOn,
  timeToMinutes,
  type AvailabilityException,
  type AvailabilityRule,
} from '@/domain/agenda/availability';
import type { Appointment } from '@/domain/appointments/appointment';
import type { AppointmentLocation } from '@/domain/appointments/appointment-enums';

/**
 * "Is anybody already booked at this time?" — the rule behind the form's
 * double-booking warning.
 *
 * Pure, like `freeSlots` beside it and for the same reasons: the caller passes
 * the day's appointments in rather than this reading them, so the rule can be
 * run from the form, from the agenda, and later from the WhatsApp webhook,
 * which has no `Scope` to fetch with.
 *
 * It reports rather than refuses, and the UI must keep it that way. An
 * *encaixe* — squeezing a patient into an already-booked slot — is a normal
 * thing a practice does, and a form that rejected it would only teach people to
 * record the wrong time to get past it. A warning is read; a block is
 * circumvented.
 *
 * **Location does not narrow this.** Availability is declared per location
 * (`011_availability_by_location.sql`) because the doctor keeps different hours
 * at the clinic and for home visits — but she is still one person, so a 09:00
 * at the clinic collides with a 09:00 home visit, and rather worse than with
 * another clinic appointment, since there is travel in between. What location
 * *does* decide is how long each appointment runs: a 90-minute home visit
 * blocks a stretch of the day that a 20-minute teleconsultation does not.
 */
export interface SlotConflict {
  readonly appointmentId: string;
  /** `HH:mm` of the appointment already in the way. */
  readonly time: string;
  readonly location: AppointmentLocation;
  /** `null` when the appointments were loaded without the patient joined. */
  readonly patientName: string | null;
}

export function conflictsAt(params: {
  /** The day being booked — what the durations below are read for. */
  day: Date;
  /** The proposed `HH:mm`. */
  time: string;
  /** Where the proposed appointment happens, which sets how long it runs. */
  location: AppointmentLocation;
  appointments: readonly Appointment[];
  rules: readonly AvailabilityRule[];
  exceptions: readonly AvailabilityException[];
  /**
   * The appointment being edited, which must not be reported as colliding with
   * itself — saving an unchanged consultation would otherwise always warn.
   */
  ignoreAppointmentId: string | null;
}): SlotConflict[] {
  const proposedStart = timeToMinutes(params.time);
  const proposedLength = lengthOf(params.day, params.location, params);

  return params.appointments
    .filter((appointment) => {
      if (appointment.id === params.ignoreAppointmentId) return false;
      // A row recorded before `scheduled_time` existed occupies no particular
      // moment. Treating its null as midnight would make every legacy
      // appointment collide with an early-morning booking; treating it as "the
      // whole day" would make it collide with everything. It is simply not
      // evidence about this slot.
      if (appointment.scheduledTime === null) return false;
      // A cancelled consultation gave its slot back — that is what cancelling
      // means, and warning about it would train the user to ignore the warning.
      // `no_show` is deliberately *not* excluded: the slot was held for a
      // patient who was expected, so a second booking into it really was a
      // double-booking, and the only way to see one is to be editing the past.
      if (appointment.status === 'cancelled') return false;

      const start = timeToMinutes(appointment.scheduledTime);
      // Half-open intervals: a 30-minute 09:00 ends exactly where 09:30 begins,
      // and back-to-back consultations are the normal case, not a clash.
      return (
        start < proposedStart + proposedLength &&
        proposedStart < start + lengthOf(params.day, appointment.location, params)
      );
    })
    .map((appointment) => ({
      appointmentId: appointment.id,
      // Non-null by the filter above, which TypeScript cannot carry across the
      // `map` boundary.
      time: appointment.scheduledTime ?? '',
      location: appointment.location,
      patientName: appointment.patientName,
    }));
}

/**
 * How many minutes an appointment at `location` occupies on `day`, falling back
 * to one minute when the doctor has declared no hours there.
 *
 * The fallback is what makes the rule degrade honestly instead of needing a
 * second code path. Nothing forces her to fill in her hours, so "how long is a
 * consultation at the hospital" often has no answer — and inventing one would
 * either report collisions that are not there or, worse, stay silent about real
 * ones. An appointment that occupies exactly its own minute collides with
 * precisely the other appointments that start at the same time, which is the
 * one clash nobody has to be told about to agree with.
 */
function lengthOf(
  day: Date,
  location: AppointmentLocation,
  availability: {
    rules: readonly AvailabilityRule[];
    exceptions: readonly AvailabilityException[];
  },
): number {
  return slotDurationOn(day, location, availability.rules, availability.exceptions) ?? 1;
}
