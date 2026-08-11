/**
 * Prova que a cópia das regras de vaga dentro da função Deno ainda é a mesma
 * regra do domínio.
 *
 * `supabase/functions/whatsapp/slots.ts` duplica `freeSlots` e `conflictsAt` de
 * `src/domain/agenda/` porque o Deno não consegue importar `src/` — o alias
 * `@/` e as importações sem extensão não resolvem lá. A duplicação é o
 * precedente do repositório (`notify/plan.ts` faz o mesmo com a regra de
 * aniversário), e o perigo dela é sempre o mesmo: as duas versões divergem em
 * silêncio, e o sintoma é o app achar que 14:00 está livre enquanto a IA acha
 * que não — ou, pior, a IA marcar em cima de alguém porque a cópia dela não
 * aprendeu a regra nova.
 *
 * Um comentário pedindo atenção não impede isso. Este script impede: roda as
 * duas implementações sobre o mesmo conjunto de casos e falha se discordarem em
 * qualquer um. Ao mexer numa das duas, é ele que responde se elas ainda são a
 * mesma regra.
 *
 *   node scripts/check-slot-parity.mjs
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jiti = createJiti(root, { alias: { '@': join(root, 'src') } });

const domain = await jiti.import(join(root, 'src/domain/agenda/availability.ts'));
const domainConflicts = await jiti.import(join(root, 'src/domain/agenda/slot-conflicts.ts'));
const deno = await jiti.import(join(root, 'supabase/functions/whatsapp/slots.ts'));

let failures = 0;
const compare = (name, a, b) => {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) {
    failures += 1;
    console.log(`DIVERGIU ${name}\n  domínio: ${left}\n  função:  ${right}`);
  } else {
    console.log(`ok       ${name}`);
  }
};

/* --- O mesmo caso, nas duas linguagens de tipos ----------------------------- */

// `yyyy-MM-dd` → Date local. O lado Deno trabalha em string porque é o que a
// coluna `date` entrega; o lado do domínio trabalha em Date.
const toDate = (day) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
};

const domainRule = (r) => ({ id: `r-${r.location}-${r.weekday}`, ...r });
const domainException = (e) => ({ id: `e-${e.date}`, ...e, date: toDate(e.date), note: null });
const domainAppointment = (a) => ({
  id: a.id,
  patientId: 'p',
  scheduledDate: toDate('2026-03-10'),
  scheduledTime: a.scheduledTime,
  type: 'visit',
  location: a.location,
  status: a.status,
  finance: null,
  patientName: a.patientName,
  patientPhone: null,
  nextReturnDate: null,
  recallDate: null,
  followUpDate: null,
  followUpTime: null,
  notes: null,
  createdAt: toDate('2026-03-01'),
  createdBy: null,
});

/* --- O corpus -------------------------------------------------------------- */

// 2026-03-10 é uma terça (weekday 2); 2026-03-11, uma quarta.
const RULES = [
  {
    location: 'oncovie',
    weekday: 2,
    startTime: '08:00',
    endTime: '12:00',
    slotDurationMinutes: 30,
  },
  { location: 'home', weekday: 2, startTime: '14:00', endTime: '18:00', slotDurationMinutes: 90 },
  { location: 'idc', weekday: 3, startTime: '09:00', endTime: '11:00', slotDurationMinutes: 20 },
];

const HOLIDAY = {
  date: '2026-03-10',
  location: null,
  isClosed: true,
  startTime: null,
  endTime: null,
  slotDurationMinutes: null,
};
const SPECIAL_HOME = {
  date: '2026-03-10',
  location: 'home',
  isClosed: false,
  startTime: '15:00',
  endTime: '17:00',
  slotDurationMinutes: 60,
};

const APPOINTMENTS = [
  {
    id: 'a1',
    scheduledTime: '09:00',
    location: 'oncovie',
    status: 'scheduled',
    patientName: 'Ana',
  },
  {
    id: 'a2',
    scheduledTime: '14:00',
    location: 'home',
    status: 'scheduled',
    patientName: 'Rubens',
  },
  {
    id: 'a3',
    scheduledTime: '10:00',
    location: 'oncovie',
    status: 'cancelled',
    patientName: 'Ivo',
  },
  {
    id: 'a4',
    scheduledTime: null,
    location: 'oncovie',
    status: 'scheduled',
    patientName: 'Legado',
  },
];

const SLOT_CASES = [];
for (const day of ['2026-03-10', '2026-03-11']) {
  for (const location of ['oncovie', 'home', 'idc', 'hospital']) {
    for (const [label, exceptions] of [
      ['sem exceção', []],
      ['feriado geral', [HOLIDAY]],
      ['horário especial domiciliar', [SPECIAL_HOME]],
      ['feriado + especial', [HOLIDAY, SPECIAL_HOME]],
    ]) {
      for (const [bookedLabel, bookedTimes] of [
        ['agenda vazia', []],
        ['09:00 e 14:00 ocupados', ['09:00', '14:00']],
      ]) {
        SLOT_CASES.push({
          day,
          location,
          exceptions,
          exceptionsLabel: label,
          bookedTimes,
          bookedLabel,
        });
      }
    }
  }
}

for (const c of SLOT_CASES) {
  compare(
    `freeSlots ${c.day} ${c.location} · ${c.exceptionsLabel} · ${c.bookedLabel}`,
    domain.freeSlots({
      day: toDate(c.day),
      location: c.location,
      rules: RULES.map(domainRule),
      exceptions: c.exceptions.map(domainException),
      bookedTimes: c.bookedTimes,
    }),
    deno.freeSlots({
      day: c.day,
      location: c.location,
      rules: RULES,
      exceptions: c.exceptions,
      bookedTimes: c.bookedTimes,
    }),
  );
}

const CONFLICT_TIMES = ['07:00', '08:30', '09:00', '09:15', '09:30', '10:00', '14:30', '15:30'];
for (const time of CONFLICT_TIMES) {
  for (const location of ['oncovie', 'home', 'hospital']) {
    for (const ignore of [null, 'a1']) {
      compare(
        `conflictsAt ${time} ${location} ignorando=${ignore ?? 'nada'}`,
        domainConflicts
          .conflictsAt({
            day: toDate('2026-03-10'),
            time,
            location,
            appointments: APPOINTMENTS.map(domainAppointment),
            rules: RULES.map(domainRule),
            exceptions: [],
            ignoreAppointmentId: ignore,
          })
          // O domínio carrega `location` no conflito e a função não: ela só
          // precisa de quem e quando para escrever a frase de volta ao paciente.
          // Comparar o que as duas de fato prometem, e não a forma do objeto.
          .map(({ appointmentId, time, patientName }) => ({ appointmentId, time, patientName })),
        deno.conflictsAt({
          day: '2026-03-10',
          time,
          location,
          appointments: APPOINTMENTS,
          rules: RULES,
          exceptions: [],
          ignoreAppointmentId: ignore,
        }),
      );
    }
  }
}

/* --- A triagem de urgência ------------------------------------------------- */

// A mesma prova, para a regra de segurança. Ela é copiada pelo mesmo motivo que
// as regras de vaga, e é onde uma divergência silenciosa custa mais caro: a
// versão do app escalaria uma mensagem que a versão da função deixaria passar
// para o modelo — e o modelo é exatamente o que essa regra existe para não
// depender.
const domainUrgency = await jiti.import(join(root, 'src/domain/whatsapp/urgency.ts'));
const denoUrgency = await jiti.import(join(root, 'supabase/functions/whatsapp/urgency.ts'));

const MESSAGES = [
  'oi, queria marcar uma consulta',
  'estou com dor no peito',
  'DOR NO PEITO!!!',
  'dor  no   peito',
  'tive uma convulsão ontem',
  'não consigo respirar direito',
  'acho que foi um avc',
  'o exame avcb deu normal',
  'estou com dor nas costas',
  'minha mãe está com falta de ar',
  'ando pensando em me matar',
  'meu pai teve um infarto ano passado, queria marcar retorno',
  'pode ser quinta às 14h?',
  '',
  '???',
  'estou sangrando muito',
  'febre alta desde ontem',
];

for (const message of MESSAGES) {
  compare(
    `screenForUrgency ${JSON.stringify(message)}`,
    domainUrgency.screenForUrgency(message),
    denoUrgency.screenForUrgency(message),
  );
}

compare(
  'URGENCY_REPLY é a mesma frase nos dois lados',
  domainUrgency.URGENCY_REPLY,
  denoUrgency.URGENCY_REPLY,
);

const total = SLOT_CASES.length + CONFLICT_TIMES.length * 6 + MESSAGES.length + 1;
console.log(
  failures === 0
    ? `\n${total} casos, nenhuma divergência.`
    : `\n${failures} divergência(s) em ${total} casos.`,
);
process.exit(failures === 0 ? 0 : 1);
