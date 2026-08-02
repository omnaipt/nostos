import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeReservedAt, computeServiceDate } from "@/lib/service-date";
import { queryKeys } from "@/lib/query-keys";
import { sendReservationMessage } from "@/lib/reservation-message";
import type { Restaurant, Turn } from "@/lib/types";
import type { ReservationValues } from "@/lib/schemas";

// C4 (criar/editar reserva) + C6 (upsert customer por telefone) + C7 (email).
// service_date e reserved_at são SEMPRE enviados explícitos (contrato FROZEN):
// nunca se confia no default UTC do schema.

const UNASSIGNED_TABLE = "";

export interface SaveReservationInput {
  values: ReservationValues;
  /** Id da reserva quando é edição; ausente => criação. */
  id?: string;
}

interface SaveContext {
  restaurant: Restaurant;
  turns: Turn[];
}

// C6 — match de cliente por telefone DENTRO do tenant (índice único parcial
// customers_restaurant_phone_uidx). Se existe, actualiza nome/email; senão cria.
async function upsertCustomer(
  restaurantId: string,
  name: string,
  phone: string,
  email: string | null,
): Promise<string | null> {
  if (!phone) return null;

  // Selecciona o existente do tenant (índice único parcial por telefone).
  async function findExistingId(): Promise<string | null> {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  const existingId = await findExistingId();
  if (existingId) {
    const { error: updError } = await supabase
      .from("customers")
      .update({ name, email })
      .eq("id", existingId);
    if (updError) throw updError;
    return existingId;
  }

  const { data: created, error: insError } = await supabase
    .from("customers")
    .insert({ restaurant_id: restaurantId, name, phone, email })
    .select("id")
    .single();
  if (insError) {
    // Nit (a) — race no unique de telefone por tenant: dois inserts concorrentes
    // do mesmo telefone. Em vez de rebentar, re-seleccionamos o existente
    // (criado pelo concorrente) e actualizamos nome/email.
    if ((insError as { code?: string }).code === "23505") {
      const racedId = await findExistingId();
      if (racedId) {
        const { error: updError } = await supabase
          .from("customers")
          .update({ name, email })
          .eq("id", racedId);
        if (updError) throw updError;
        return racedId;
      }
    }
    throw insError;
  }
  return created.id;
}

export function useSaveReservation(ctx: SaveContext | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ values, id }: SaveReservationInput) => {
      if (!ctx) throw new Error("Restaurante não carregado.");
      const { restaurant, turns } = ctx;
      const turn = turns.find((t) => t.id === values.turnId);

      const email = values.customerEmail ? values.customerEmail : null;
      const customerId = await upsertCustomer(
        restaurant.id,
        values.customerName,
        values.customerPhone,
        email,
      );

      // Contrato FROZEN: service_date no fuso do restaurante; reserved_at NOT NULL.
      const service_date = computeServiceDate(values.date, restaurant.timezone, values.time);
      const reserved_at = computeReservedAt(
        values.date,
        values.time,
        turn?.start_time,
        restaurant.timezone,
      );
      const table_id = values.tableId && values.tableId !== UNASSIGNED_TABLE ? values.tableId : null;

      const row = {
        restaurant_id: restaurant.id,
        customer_id: customerId,
        customer_name: values.customerName,
        customer_phone: values.customerPhone || null,
        party_size: values.partySize,
        turn_id: values.turnId,
        table_id,
        service_date,
        reserved_at,
        status: "confirmada" as const,
        notes: values.notes ? values.notes : null,
      };

      if (id) {
        const { data, error } = await supabase
          .from("reservations")
          .update(row)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return { reservation: data, email, restaurant, isNew: false };
      }
      const { data, error } = await supabase
        .from("reservations")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return { reservation: data, email, restaurant, isNew: true };
    },
    onSuccess: async (result) => {
      // C7 — confirmação multi-canal best-effort. NUNCA bloqueia a criação.
      // O telefone é obrigatório na reserva; o email é opcional — a edge
      // decide os canais com o que houver.
      if (result.isNew && (result.email || result.reservation.customer_phone)) {
        void sendReservationMessage({
          reservationId: result.reservation.id,
          restaurant: result.restaurant,
          toEmail: result.email,
          toPhone: result.reservation.customer_phone,
          customerName: result.reservation.customer_name,
          partySize: result.reservation.party_size,
          serviceDate: result.reservation.service_date,
          reservedAt: result.reservation.reserved_at,
          notes: result.reservation.notes,
          // 0026: o idioma em que o cliente reservou. Quem marca pela sala não
          // o escolhe (fica 'pt' por defeito), mas quem reservou pelo /r em
          // francês deixou-o gravado, e é por aqui que ele chega à mensagem.
          // A edge ainda compõe em português; o campo segue à frente para a
          // informação não se perder no caminho.
          lang: (result.reservation as { lang?: string }).lang ?? "pt",
        });
      }
      await qc.invalidateQueries({ queryKey: queryKeys.availabilityRoot });
    },
  });
}

// C5 — atribuir mesa a uma reserva por atribuir. update table_id; sujeito ao
// índice único parcial (reservations_table_slot_uidx) e ao CHECK
// table_requires_turn (turn_id já está preenchido na reserva, logo OK).
export function useAssignTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reservationId, tableId }: { reservationId: string; tableId: string }) => {
      const { error } = await supabase
        .from("reservations")
        .update({ table_id: tableId })
        .eq("id", reservationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.availabilityRoot }),
  });
}

// C8 — confirmar reserva pendente (vinda do canal público). Só na confirmação
// segue a mensagem C7 (best-effort): o email do cliente vive em customers, o
// telefone na própria reserva.
export function useConfirmReservation(restaurant: Restaurant | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: string) => {
      const { data, error } = await supabase
        .from("reservations")
        .update({ status: "confirmada" })
        .eq("id", reservationId)
        .select("*, customers(email)")
        .single();
      if (error) throw error;
      return data as { customers: { email: string | null } | null } & Record<string, unknown>;
    },
    onSuccess: (row) => {
      const email = row.customers?.email ?? null;
      const phone = (row.customer_phone as string | null) ?? null;
      if (restaurant && (email || phone)) {
        void sendReservationMessage({
          reservationId: row.id as string,
          restaurant,
          toEmail: email,
          toPhone: phone,
          customerName: row.customer_name as string,
          partySize: row.party_size as number,
          serviceDate: row.service_date as string,
          reservedAt: (row.reserved_at as string | null) ?? null,
          notes: (row.notes as string | null) ?? null,
        });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.availabilityRoot });
    },
  });
}

// G4 — mudar estado inline (Sentada / No-show) a partir da vista de
// disponibilidade. O trigger de reservation_events (0003) regista o evento.
export function useUpdateReservationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      reservationId,
      status,
    }: {
      reservationId: string;
      status: "sentada" | "no_show" | "confirmada";
    }) => {
      const { error } = await supabase
        .from("reservations")
        .update({ status })
        .eq("id", reservationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.availabilityRoot }),
  });
}

// Cancelar reserva (status -> cancelada). Liberta o slot da mesa (índice parcial
// ignora canceladas).
export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: string) => {
      const { error } = await supabase
        .from("reservations")
        .update({ status: "cancelada" })
        .eq("id", reservationId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.availabilityRoot }),
  });
}
