import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Registo de temperatura (item 3, A2) via RPC haccp_record_temperature. O
// servidor resolve o restaurante a partir do ponto, carimba recorded_at/by e
// valida a janela. Os erros chegam como error.message com o texto exacto do
// contrato (ex.: haccp_fora_da_janela) — a UI mapeia-os para copy honesta.

export interface RecordTemperatureInput {
  controlPointId: string;
  turnId: string;
  valueC: number;
  // Diferido (fila offline): instante de captura local. Nulo = online (now()).
  capturedAt?: string | null;
  note?: string | null;
  rectifiesId?: string | null;
}

export interface RecordTemperatureResult {
  id: string;
  within_limits: boolean;
  sync_mode: string;
  service_date: string;
}

export async function recordTemperature(
  input: RecordTemperatureInput,
): Promise<RecordTemperatureResult> {
  const { data, error } = await supabase.rpc("haccp_record_temperature", {
    p_control_point_id: input.controlPointId,
    p_turn_id: input.turnId,
    p_value_c: input.valueC,
    p_captured_at: input.capturedAt ?? undefined,
    p_note: input.note ?? undefined,
    p_rectifies_id: input.rectifiesId ?? undefined,
  });
  if (error) throw error;
  const row = (data as RecordTemperatureResult[])?.[0];
  if (!row) throw new Error("haccp_registo_sem_resposta");
  return row;
}

export function useRecordTemperature(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recordTemperature,
    onSuccess: () => {
      // O estado do turno mudou; invalidar tudo o que depende dele.
      qc.invalidateQueries({ queryKey: ["haccp", restaurantId] });
    },
  });
}
