/**
 * A row on the "Secretárias" screen — either an accepted link or an invitation
 * still waiting to be accepted.
 *
 * The two come from different tables (`doctor_secretaries` and
 * `secretary_invites`) but answer the same question the doctor is asking: "who
 * has access to my data?". Modelling them as one type with an `isPending` flag
 * keeps the screen a single list; splitting them would put an invitation and the
 * link it becomes in two separate places, which is not how the doctor thinks
 * about it.
 */
export interface SecretaryLink {
  /** The invite id when pending, the secretary's user id when active. */
  readonly id: string;
  /** Her name once she has signed up; the invited e-mail until then. */
  readonly label: string;
  readonly isPending: boolean;
}
