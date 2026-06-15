import { z } from "zod";

// Validação na fronteira (forms) com zod, em PT-PT.
// Estes schemas estão prontos para o Marco reutilizar no wiring Supabase (#4):
// o output validado mapeia diretamente para os inserts das tabelas
// tables / turns / restaurants / reservations / customers.

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const phoneSchema = z
  .string()
  .trim()
  .min(9, "Telefone inválido (mín. 9 dígitos)")
  .regex(/^[0-9+\s]+$/, "Telefone só pode ter números, espaços e +");

// ── C1: Mesa (public.tables) ────────────────────────────────────────────────
export const tableSchema = z.object({
  label: z.string().trim().min(1, "Indica a etiqueta da mesa"),
  seats: z.coerce
    .number({ invalid_type_error: "Indica o nº de lugares" })
    .int("Tem de ser um número inteiro")
    .min(1, "A mesa tem de ter ≥ 1 lugar")
    .max(99, "Valor demasiado alto"),
  sortOrder: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export type TableValues = z.infer<typeof tableSchema>;

// ── C2: Turno (public.turns) ────────────────────────────────────────────────
// label + hora início + ≥1 dia são obrigatórios. Serviço é OPCIONAL e texto
// livre (NÃO enum): vazio nunca bloqueia o submit.
export const turnSchema = z.object({
  label: z.string().trim().min(1, "Indica o nome do turno"),
  startTime: z.string().regex(HHMM, "Indica a hora de início (HH:mm)"),
  service: z.string().trim().max(40, "Máximo 40 caracteres").optional().or(z.literal("")),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Escolhe pelo menos um dia da semana"),
  active: z.boolean().default(true),
});
export type TurnValues = z.infer<typeof turnSchema>;

// ── C3: Onboarding do restaurante ────────────────────────────────────────────
// NÃO recolhe capacidade/horário simples. Recolhe esquema de mesas (≥1) +
// turnos (≥1). assignment_mode NÃO é exposto (schema cria sempre 'manual').
// O "horário de funcionamento" deriva dos turnos — não há campo separado.
export const onboardingSchema = z.object({
  name: z.string().trim().min(2, "Indica o nome do restaurante"),
  email: z.string().trim().email("Email de contacto inválido"),
  phone: phoneSchema,
  // Password da conta do owner (auth signUp). Recolhida no onboarding porque é
  // o único ponto de criação de conta do fluxo (C3).
  password: z.string().min(8, "A palavra-passe tem de ter pelo menos 8 caracteres"),
  tables: z.array(tableSchema).min(1, "Adiciona pelo menos uma mesa"),
  turns: z.array(turnSchema).min(1, "Define pelo menos um turno"),
});
export type OnboardingValues = z.infer<typeof onboardingSchema>;

// ── C4: Criar / editar reserva ───────────────────────────────────────────────
// turno OBRIGATÓRIO; mesa OPCIONAL ("" = deixar por atribuir => table_id null).
// pax obrigatório; cliente nome+telefone obrigatórios, email opcional.
// hora exacta opcional (exibição). A data é validada contra "hoje" (walk-in
// para hoje permitido, datas passadas anteriores a hoje bloqueadas) na UI,
// porque precisa da timezone do restaurante — ver nota service_date abaixo.
export const reservationSchema = z.object({
  customerName: z.string().trim().min(2, "Indica o nome do cliente"),
  customerPhone: phoneSchema,
  customerEmail: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  partySize: z.coerce
    .number({ invalid_type_error: "Indica o nº de pessoas" })
    .int("Tem de ser um número inteiro")
    .min(1, "Mínimo 1 pessoa")
    .max(100, "Valor demasiado alto"),
  date: z.string().min(1, "Indica a data"), // "yyyy-MM-dd" (= service_date)
  time: z.string().regex(HHMM, "Hora inválida (HH:mm)").optional().or(z.literal("")), // hora exacta opcional
  turnId: z.string().min(1, "Escolhe um turno"), // OBRIGATÓRIO
  tableId: z.string().optional().or(z.literal("")), // "" = POR ATRIBUIR (table_id null)
  notes: z.string().trim().max(500, "Máximo 500 caracteres").optional().or(z.literal("")),
});
export type ReservationValues = z.infer<typeof reservationSchema>;
