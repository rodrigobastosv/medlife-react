/**
 * Especímenes do design system, com dados falsos.
 *
 * Serve para comparar o antes e o depois de uma mudança de token ou de
 * componente sem precisar de sessão do Supabase: as telas autenticadas exigem
 * login, esta não. Renderiza os componentes de verdade, não uma cópia deles, para
 * uma mudança em `Card` ou em `PageHeader` aparecer aqui sem ninguém lembrar de
 * replicar.
 *
 * Dev-only, montado por `preview.tsx` em /preview.html. `vite build` só tem o
 * `index.html` como entrada, então nada disto entra no bundle de produção.
 */
import { formatCurrency } from '@/core/format';
import type { Appointment } from '@/domain/appointments/appointment';
import {
  APPOINTMENT_LOCATIONS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  appointmentLocationLabel,
  appointmentStatusLabel,
  appointmentTypeLabel,
} from '@/domain/appointments/appointment-enums';
import type { Patient } from '@/domain/patients/patient';
import { AppointmentTile } from '@/features/appointments/appointment-tile';
import { BirthdaysCard } from '@/features/patients/birthdays-card';
import { Button } from '@/design-system/components/button';
import { Card, CardTitle } from '@/design-system/components/card';
import { SelectField, TextAreaField, TextField } from '@/design-system/components/form-fields';
import { BellIcon, PeopleIcon, RepeatIcon } from '@/design-system/components/icons';
import { PageHeader, Section } from '@/design-system/components/page';
import { Switch } from '@/design-system/components/switch';
import { Tag } from '@/design-system/components/tag';

const APPOINTMENTS: readonly Appointment[] = [
  {
    id: '1',
    patientId: 'p1',
    scheduledDate: new Date(2026, 6, 14),
    scheduledTime: '09:30',
    type: 'first_visit',
    location: 'oncovie',
    status: 'completed',
    finance: {
      amount: 1250,
      invoiceStatus: 'none',
      paymentMethod: 'pix',
      paymentInstallments: null,
    },
    patientName: 'Marina Albuquerque',
    patientPhone: '(85) 99999-8888',
    nextReturnDate: new Date(2026, 9, 14),
    recallDate: null,
    notes: null,
    createdAt: new Date(2026, 6, 1),
    createdBy: 'd1',
  },
  {
    id: '2',
    patientId: 'p2',
    scheduledDate: new Date(2026, 6, 22),
    scheduledTime: '14:00',
    type: 'first_visit',
    location: 'oncovie',
    status: 'scheduled',
    finance: {
      amount: 480.5,
      invoiceStatus: 'none',
      paymentMethod: 'pix',
      paymentInstallments: null,
    },
    patientName: 'Otávio Bandeira Filho',
    patientPhone: '8533334444',
    nextReturnDate: null,
    recallDate: new Date(2026, 7, 3),
    notes: null,
    createdAt: new Date(2026, 6, 2),
    createdBy: 'd1',
  },
  {
    id: '3',
    patientId: 'p3',
    scheduledDate: new Date(2026, 6, 28),
    // Sem horário de propósito: é uma consulta anterior à coluna existir, e o
    // tile precisa mostrar só a data em vez de um traço sem sentido.
    scheduledTime: null,
    type: 'first_visit',
    location: 'oncovie',
    status: 'no_show',
    finance: { amount: 92, invoiceStatus: 'none', paymentMethod: 'pix', paymentInstallments: null },
    patientName: 'Cecília Tavares',
    // Sem telefone de propósito: o tile não mostra nenhuma ação de contato
    // quando não há número — nem um botão desabilitado.
    patientPhone: null,
    nextReturnDate: null,
    recallDate: null,
    notes: null,
    createdAt: new Date(2026, 6, 3),
    // Sem autor, como toda linha anterior à coluna `created_by`.
    createdBy: null,
  },
];

/**
 * Pacientes falsos para o card de aniversariantes.
 *
 * O mês do espécime é fevereiro de 2026, que **não** é bissexto, e um dos
 * pacientes nasceu em 29/02: é a decisão registrada em `birthdaysInMonth` — o
 * aniversário fica em fevereiro mesmo no ano sem dia 29 — e é o caso que só dá
 * para conferir olhando. O dia 3 é "hoje" aqui, para o destaque aparecer.
 */
const BIRTHDAY_MONTH = new Date(2026, 1, 3);

const fakePatient = (id: string, fullName: string, birthDate: Date | null): Patient => ({
  id,
  fullName,
  origin: 'other',
  birthDate,
  cpf: null,
  phone: null,
  address: null,
  invoiceName: null,
  invoiceCpf: null,
  notes: null,
  createdAt: null,
});

const PATIENTS: readonly Patient[] = [
  // 1952 é bissexto, e tem de ser: `new Date(1949, 1, 29)` vira 1º de março
  // caladamente, e o espécime passaria a mostrar o contrário do que promete. Na
  // base isso não acontece — uma coluna `date` não aceita 29/02 de ano comum.
  fakePatient('p1', 'Bento Carvalho Nogueira', new Date(1952, 1, 29)),
  fakePatient('p2', 'Ana Beatriz Cordeiro', new Date(1948, 1, 3)),
  fakePatient('p3', 'Ângela Prado', new Date(1955, 1, 1)),
  fakePatient('p4', 'Marina Albuquerque', new Date(1972, 6, 14)),
  // Sem data de nascimento: fica fora da lista, mas conta no rodapé do card.
  fakePatient('p5', 'Otávio Bandeira Filho', null),
];

/** A linha de resumo do início, com a mesma estrutura da HomePage. */
function StatRow() {
  return (
    <div className="flex flex-col gap-4">
      <a
        href="#"
        className="bg-primary text-on-primary flex items-center gap-4 rounded-l p-6"
        onClick={(event) => event.preventDefault()}
      >
        <span className="bg-on-primary/20 rounded-full p-2">
          <PeopleIcon className="size-6" />
        </span>
        <span className="flex-1">
          <span className="font-display nums block text-3xl font-bold">248</span>
          <span className="text-sm opacity-90">pacientes cadastrados</span>
        </span>
      </a>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-primary-container text-on-primary-container flex flex-col gap-1">
          <BellIcon />
          <span className="font-display nums text-2xl font-bold">7</span>
          <span className="text-sm">Recalls pendentes</span>
        </Card>
        <Card className="bg-primary-container text-on-primary-container flex flex-col gap-1">
          <RepeatIcon />
          <span className="font-display nums text-2xl font-bold">12</span>
          <span className="text-sm">Retornos futuros</span>
        </Card>
      </div>
    </div>
  );
}

/** Uma coluna de dinheiro, onde o alinhamento dos dígitos aparece. */
function MoneyColumn() {
  const values = [1250, 480.5, 92, 15300.75, 8.4, 2040];
  return (
    <Card className="flex flex-col gap-2">
      <CardTitle>Receita por consulta</CardTitle>
      <div className="flex flex-col gap-1 text-sm">
        {values.map((value) => (
          <div
            key={value}
            className="border-outline/50 flex justify-between border-b pb-1 last:border-0"
          >
            <span className="text-on-surface-variant">Consulta</span>
            <span className="nums font-semibold">{formatCurrency(value)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Os controles de formulário, que antes não tinham espécime nenhum.
 *
 * Estão aqui principalmente pelo `SelectField`: a seta é desenhada pelo app, e a
 * distância dela até a borda é o tipo de detalhe que só se confere olhando — nos
 * dois temas, ao lado de um campo de texto e de um campo com erro, que é como
 * ela aparece no formulário de consulta.
 */
function FormFields() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold">Campos de formulário</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Data da consulta" type="date" defaultValue="2026-07-14" />
        <SelectField
          label="Tipo"
          defaultValue="visit"
          options={APPOINTMENT_TYPES.map((type) => ({
            value: type,
            label: appointmentTypeLabel[type],
          }))}
        />
        <SelectField
          label="Situação"
          defaultValue="completed"
          options={APPOINTMENT_STATUSES.map((status) => ({
            value: status,
            label: appointmentStatusLabel[status],
          }))}
        />
        <SelectField
          label="Local"
          placeholder="Selecione"
          error="Informe o local da consulta"
          options={APPOINTMENT_LOCATIONS.map((location) => ({
            value: location,
            label: appointmentLocationLabel[location],
          }))}
        />
      </div>
      <TextAreaField label="Observações" hint="Aparece no histórico do paciente." />
    </section>
  );
}

export function Specimens() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Relatórios" subtitle="Receita, consultas e pacientes novos." />
      <CardTitle>Título de card</CardTitle>

      <StatRow />

      <Section title="Recalls pendentes">
        {APPOINTMENTS.map((appointment) => (
          <AppointmentTile key={appointment.id} appointment={appointment} showPatientName />
        ))}
      </Section>

      <BirthdaysCard patients={PATIENTS} today={BIRTHDAY_MONTH} />

      <MoneyColumn />

      <FormFields />

      <Switches />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">Ações e status</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="accent">Nova consulta</Button>
          <Button variant="primary">Salvar</Button>
          <Button variant="outline">Editar</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger">Excluir</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="primary">Agendada</Tag>
          <Tag tone="success">Concluída</Tag>
          <Tag tone="warning">Não compareceu</Tag>
          <Tag tone="error">Cancelada</Tag>
          <Tag tone="neutral">Recall em 03/08/2026</Tag>
        </div>
      </section>
    </div>
  );
}

/**
 * Os dois estados do switch, lado a lado.
 *
 * O card de notificações inteiro não cabe aqui: ele depende de sessão, de query
 * e da permissão do navegador, e nada disso existe nesta página. O que precisa
 * ser olhado nos dois temas é o controle — principalmente o trilho desligado,
 * que usa `bg-outline` e é o único elemento do design system cujo contraste
 * muda de lado entre claro e escuro.
 */
function Switches() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold">Switches</h2>
      <Card className="flex flex-col gap-1">
        <Switch
          label="Consultas do dia"
          description="Um resumo com quantas consultas você tem hoje."
          isOn
          onToggle={() => undefined}
        />
        <Switch
          label="Pacientes para ligar"
          description="Quantos pacientes estão na fila de recall vencido."
          isOn={false}
          onToggle={() => undefined}
        />
        <Switch
          label="Nova consulta marcada"
          description="Avisa quando outra pessoa marca uma consulta na sua agenda."
          isOn={false}
          isDisabled
          onToggle={() => undefined}
        />
      </Card>
    </section>
  );
}

/** Um tema por coluna, para os dois aparecerem no mesmo screenshot. */
export function ThemeColumn({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <div className={isDark ? 'dark' : undefined}>
      <div className="bg-surface text-on-surface min-h-dvh px-6 py-8">
        <div className="text-on-surface-variant mb-6 text-xs font-semibold tracking-widest uppercase">
          {label}
        </div>
        <Specimens />
      </div>
    </div>
  );
}
