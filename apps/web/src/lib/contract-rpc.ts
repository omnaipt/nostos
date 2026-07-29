import { supabase } from "@/integrations/supabase/client";

// Chamadas "à frente do contrato": os tipos gerados vêm da BD de PRODUÇÃO, por
// isso RPCs/tabelas de fases do Marco ainda não fundidas (member_role, orders,
// submit_takeaway_order, advance_order, invite_member) não existem nos tipos.
// Escape LOCALIZADO e comentado, para não espalhar `as any` pela app. Quando as
// migrações do Marco chegarem e os tipos forem regenerados, estas chamadas
// passam a estar tipadas e este ficheiro pode encolher.

export interface LooseResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export function looseRpc<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<LooseResult<T>> {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<LooseResult<T>>;
  return rpc(fn, args);
}

// Query builder sobre uma tabela ainda ausente dos tipos. Devolve o builder do
// supabase-js sem tipos — usar só nos sítios comentados como contract-ahead.
export function looseFrom(table: string) {
  const from = supabase.from as unknown as (t: string) => ReturnType<typeof supabase.from>;
  return from(table);
}

// True quando o erro é "a função/tabela ainda não existe" (fase do Marco por
// fundir) — para degradar em silêncio em vez de gritar.
export function isMissingContract(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "PGRST202" || // função RPC não encontrada
    err.code === "42P01" || // relação não existe
    err.code === "42883" || // função não existe
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("not found")
  );
}
