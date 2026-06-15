import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeReservedAt, computeServiceDate } from "@/lib/service-date";
import { sendReservationEmail } from "@/lib/email";
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
  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error: updError } = await supabase
      .from("customers")
      .update({ name, email })
      .eq("id", existing.id);
    if (updError) throw updError;
    return existing.id;
  }
  const { data: created, error: insError } = await supabase
    .from("customers")
    .insert({ restaurant_id: restaurantId, name, phone, email })
    .select("id")
    .single();
  if (insError) throw insError;
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
      const reserved_at = computeReservedAt(values.date, values.time, turn?.start_time);
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
      // C7 — email best-effort. NUNCA bloqueia nem falha a criação da reserva.
      if (result.isNew && result.email) {
        void sendReservationEmail({
          reservationId: result.reservation.id,
          restaurant: result.restaurant,
          toEmail: result.email,
          customerName: result.reservation.customer_name,
          partySize: result.reservation.party_size,
          serviceDate: result.reservation.service_date,
        });
      }
      await qc.invalidateQueries({ queryKey: ["availability"] });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}
