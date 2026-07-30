/**
 * Every closed set of values an appointment carries, with its pt-BR label.
 *
 * They share a file because they are always used together (the form renders all
 * five in a row) and because each is four lines — one file per enum would be
 * ceremony. `fromWire` helpers keep an unknown value from crashing the mapper:
 * a row written by an older version of the app still renders.
 */

/* --- Type: first visit / visit / return ---------------------------------- */

export const APPOINTMENT_TYPES = ['first_visit', 'visit', 'return'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const appointmentTypeLabel: Record<AppointmentType, string> = {
  first_visit: 'Primeira consulta',
  visit: 'Consulta',
  return: 'Retorno',
};

export const toAppointmentType = (wire: string | null | undefined): AppointmentType =>
  APPOINTMENT_TYPES.includes(wire as AppointmentType) ? (wire as AppointmentType) : 'visit';

/* --- Location ------------------------------------------------------------ */

export const APPOINTMENT_LOCATIONS = [
  'oncovie',
  'idc',
  'home',
  'hospital',
  'teleconsult',
  'other',
] as const;
export type AppointmentLocation = (typeof APPOINTMENT_LOCATIONS)[number];

export const appointmentLocationLabel: Record<AppointmentLocation, string> = {
  oncovie: 'Oncovie',
  idc: 'IDC',
  home: 'Domicílio',
  hospital: 'Hospitalar',
  teleconsult: 'Teleconsulta',
  other: 'Outro',
};

export const toAppointmentLocation = (wire: string | null | undefined): AppointmentLocation =>
  APPOINTMENT_LOCATIONS.includes(wire as AppointmentLocation)
    ? (wire as AppointmentLocation)
    : 'other';

/* --- Status -------------------------------------------------------------- */

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  scheduled: 'Agendada',
  completed: 'Realizada',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
};

export const toAppointmentStatus = (wire: string | null | undefined): AppointmentStatus =>
  APPOINTMENT_STATUSES.includes(wire as AppointmentStatus)
    ? (wire as AppointmentStatus)
    : 'completed';

/* --- Payment method ------------------------------------------------------ */

export const PAYMENT_METHODS = [
  'pix',
  'cash',
  'credit',
  'debit',
  'courtesy',
  'plan',
  'insurance',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit: 'Crédito',
  debit: 'Débito',
  courtesy: 'Cortesia',
  plan: 'Plano',
  insurance: 'Convênio',
};

/** Only credit is instalment-based, so only credit shows the instalments field. */
export const supportsInstallments = (method: PaymentMethod): boolean => method === 'credit';

/**
 * Returns `null` rather than a default: unlike the other four, "no payment
 * method recorded yet" is a real state of an appointment, not a missing value to
 * be guessed at.
 */
export const toPaymentMethod = (wire: string | null | undefined): PaymentMethod | null =>
  PAYMENT_METHODS.includes(wire as PaymentMethod) ? (wire as PaymentMethod) : null;

/* --- Invoice status ------------------------------------------------------ */

export const INVOICE_STATUSES = [
  'none',
  'receipt_pending',
  'receipt_issued',
  'nf_pending',
  'nf_issued',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  none: 'Não precisa',
  receipt_pending: 'Emitir recibo',
  receipt_issued: 'Recibo emitido',
  nf_pending: 'Emitir NF',
  nf_issued: 'NF emitida',
};

/** Pending paperwork — what the doctor still owes someone. */
export const isInvoicePending = (status: InvoiceStatus): boolean =>
  status === 'receipt_pending' || status === 'nf_pending';

export const toInvoiceStatus = (wire: string | null | undefined): InvoiceStatus =>
  INVOICE_STATUSES.includes(wire as InvoiceStatus) ? (wire as InvoiceStatus) : 'none';
