import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Customer, Reservation } from "@/lib/types";

// C6 — Ficha de cliente. Queries tenant-scoped via RLS (customers_member_all):
// nunca filtramos tenant no cliente além do necessário para índices/cache.
// A ficha nasce automaticamente no upsert por telefone (use-reservations);
// aqui só se LÊ, se pesquisa e se editam as notas persistentes.

async function fetchCustomers(restaurantId: string, search: string): Promise<Customer[]> {
  let query = supabase
    .from("customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("name", { ascending: true })
    .limit(200);
  const s = search.trim();
  if (s) {
    // Pesquisa por nome OU telefone (ilike). Vírgulas quebrariam o filtro .or;
    // nomes/telefones não as têm em uso normal — removemo-las por defesa.
    const safe = s.replace(/[,()]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Customer[];
}

export function useCustomers(restaurantId: string | undefined, search: string) {
  return useQuery({
    queryKey: queryKeys.customers(restaurantId, search),
    queryFn: () => fetchCustomers(restaurantId as string, search),
    enabled: !!restaurantId,
  });
}

// Match por telefone DENTRO do tenant (mesma igualdade exacta que o upsert de
// use-reservations usa — coerente com o índice único parcial por telefone).
async function fetchCustomerByPhone(
  restaurantId: string,
  phone: string,
): Promise<Customer | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  return (data as Customer) ?? null;
}

export function useCustomerByPhone(restaurantId: string | undefined, phone: string) {
  const digits = phone.replace(/\D/g, "");
  return useQuery({
    queryKey: queryKeys.customerByPhone(restaurantId, phone),
    queryFn: () => fetchCustomerByPhone(restaurantId as string, phone),
    // Só pesquisa com telefone plausível (≥ 9 dígitos, regra do phoneSchema).
    enabled: !!restaurantId && digits.length >= 9,
    staleTime: 30 * 1000,
  });
}

// Histórico de reservas do cliente com labels de turno e mesa embebidos
// (FKs únicas reservations.turn_id -> turns / table_id -> tables).
export type CustomerReservation = Reservation & {
  turns: { label: string; start_time: string } | null;
  tables: { label: string } | null;
};

async function fetchCustomerReservations(customerId: string): Promise<CustomerReservation[]> {
  const { data, error } = await supabase
    .from("reservations")
    .select("*, turns(label, start_time), tables(label)")
    .eq("customer_id", customerId)
    .order("service_date", { ascending: false })
    .order("reserved_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as CustomerReservation[];
}

export function useCustomerReservations(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customerReservations(customerId),
    queryFn: () => fetchCustomerReservations(customerId as string),
    enabled: !!customerId,
  });
}

// Notas persistentes do cliente (distintas das notas de cada reserva).
export function useUpdateCustomerNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("customers")
        .update({ notes: notes.trim() ? notes.trim() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.customersRoot }),
  });
}

// Valor com atraso — evita disparar a pesquisa por telefone a cada tecla.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
