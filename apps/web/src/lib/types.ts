// Tipos de domínio STOA (vertical Restaurantes) — modelo Fase 1: mesas + turnos.
//
// As FORMAS das tabelas vêm agora dos tipos GERADOS por
// `supabase gen types typescript` (integrations/supabase/database.types.ts),
// que são a fonte de verdade do schema. Aqui só:
//   1. Damos aliases de domínio (Restaurant, RestaurantTable, ...) sobre as Row
//      geradas, estreitando campos `string` para os literais de domínio
//      (status, assignment_mode) — o Postgres CHECK não gera enum em TS.
//   2. Exportamos aliases Insert/Update para o wiring (#4) usar nas mutações.
//   3. Mantemos as constantes/helpers de UI (WEEKDAYS, labels, isoWeekdayOf).
//
// Regenerar tipos: `supabase gen types typescript --project-id emuwqkdummdmacnkltte`.

import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/integrations/supabase/database.types";

export type ReservationStatus =
  | "pendente"
  | "confirmada"
  | "sentada"
  | "cancelada"
  | "no_show";

// Dias da semana ISO-8601: 1 = Segunda ... 7 = Domingo (igual ao schema: turns.weekdays int[]).
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ── Restaurante (public.restaurants) ────────────────────────────────────────
export type Restaurant = Omit<Tables<"restaurants">, "assignment_mode"> & {
  assignment_mode: "manual" | "auto"; // Fase 1 = sempre 'manual'
};
export type RestaurantInsert = TablesInsert<"restaurants">;
export type RestaurantUpdate = TablesUpdate<"restaurants">;

// ── Mesa (public.tables) ────────────────────────────────────────────────────
export type RestaurantTable = Tables<"tables">;
export type RestaurantTableInsert = TablesInsert<"tables">;
export type RestaurantTableUpdate = TablesUpdate<"tables">;

// ── Turno (public.turns) ────────────────────────────────────────────────────
// weekdays gerado como number[]; estreitamos para IsoWeekday[] no domínio.
export type Turn = Omit<Tables<"turns">, "weekdays"> & {
  weekdays: IsoWeekday[];
};
export type TurnInsert = TablesInsert<"turns">;
export type TurnUpdate = TablesUpdate<"turns">;

// ── Cliente (public.customers) ──────────────────────────────────────────────
export type Customer = Tables<"customers">;
export type CustomerInsert = TablesInsert<"customers">;
export type CustomerUpdate = TablesUpdate<"customers">;

// ── Reserva (public.reservations) ───────────────────────────────────────────
// Atribuição Fase 1: turno OBRIGATÓRIO no fluxo da app (schema permite null
// para reservas órfãs); mesa OPCIONAL (null => POR ATRIBUIR). status estreitado.
export type Reservation = Omit<Tables<"reservations">, "status"> & {
  status: ReservationStatus;
};
export type ReservationInsert = TablesInsert<"reservations">;
export type ReservationUpdate = TablesUpdate<"reservations">;

export const WEEKDAYS: { key: IsoWeekday; label: string; short: string }[] = [
  { key: 1, label: "Segunda", short: "Seg" },
  { key: 2, label: "Terça", short: "Ter" },
  { key: 3, label: "Quarta", short: "Qua" },
  { key: 4, label: "Quinta", short: "Qui" },
  { key: 5, label: "Sexta", short: "Sex" },
  { key: 6, label: "Sábado", short: "Sáb" },
  { key: 7, label: "Domingo", short: "Dom" },
];

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  sentada: "Sentada",
  cancelada: "Cancelada",
  no_show: "No-show",
};

// Estados que contam para a ocupação/resumo do turno (exclui cancelada/no_show).
export const STATUSES_COUNTING_FOR_OCCUPANCY: ReservationStatus[] = [
  "pendente",
  "confirmada",
  "sentada",
];

// JS Date.getDay(): 0=Domingo..6=Sábado. Converte para ISO 1..7.
export function isoWeekdayOf(date: Date): IsoWeekday {
  const js = date.getDay();
  return (js === 0 ? 7 : js) as IsoWeekday;
}
