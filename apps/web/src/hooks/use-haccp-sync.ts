import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recordTemperature } from "@/hooks/use-haccp-record";
import {
  enqueue,
  hasPendingSync,
  loadQueue,
  makeQueueItem,
  markAttempt,
  peek,
  remove,
  saveQueue,
  type HaccpQueueItem,
} from "@/lib/haccp-offline-queue";

// Sincronização diferida da fila offline (item 4, A2). No mount e a cada evento
// `online`, esvazia a fila por ordem chamando haccp_record_temperature com
// p_captured_at. Erros de negócio (janela fechada) descartam o item com aviso;
// erros de rede mantêm-no e voltam a tentar no próximo online.

const MAX_ATTEMPTS_BANNER = 20;

// Rede caiu vs erro de negócio: os erros de negócio da BD têm .code / mensagem
// haccp_*; uma falha de fetch é um TypeError sem code.
function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
}

export interface HaccpSyncState {
  pendingCount: number;
  trying: boolean; // algum item já passou das 20 tentativas
  enqueueLocal: (input: Omit<HaccpQueueItem, "localId" | "attempts">) => void;
  // Há um registo na fila para este ponto+turno (chip "por sincronizar")?
  isPendingSync: (controlPointId: string, turnId: string) => boolean;
  flush: () => void;
}

export function useHaccpSync(
  restaurantId: string | undefined,
  resolvePointName?: (controlPointId: string) => string | undefined,
): HaccpSyncState {
  const qc = useQueryClient();
  const [queue, setQueue] = React.useState<HaccpQueueItem[]>(() => loadQueue());
  const flushing = React.useRef(false);
  const nameRef = React.useRef(resolvePointName);
  nameRef.current = resolvePointName;

  const persist = React.useCallback((items: HaccpQueueItem[]) => {
    saveQueue(items);
    setQueue(items);
  }, []);

  const enqueueLocal = React.useCallback(
    (input: Omit<HaccpQueueItem, "localId" | "attempts">) => {
      persist(enqueue(loadQueue(), makeQueueItem(input)));
    },
    [persist],
  );

  const flush = React.useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let items = loadQueue();
      let synced = false;
      while (items.length > 0) {
        const it = peek(items);
        if (!it) break;
        try {
          await recordTemperature({
            controlPointId: it.controlPointId,
            turnId: it.turnId,
            valueC: it.valueC,
            capturedAt: it.capturedAt,
            note: it.note,
            rectifiesId: it.rectifiesId,
          });
          items = remove(items, it.localId);
          persist(items);
          synced = true;
        } catch (err) {
          if (isNetworkError(err)) {
            // Rede ainda em baixo: incrementa tentativas e pára; tenta no próximo
            // evento online/mount.
            items = markAttempt(items, it.localId);
            persist(items);
            break;
          }
          const msg = err instanceof Error ? err.message : String(err);
          const ponto = nameRef.current?.(it.controlPointId) ?? "um ponto";
          if (msg.includes("haccp_fora_da_janela")) {
            toast.error(
              `1 registo de ${ponto} não foi aceite: a janela fechou antes de sincronizar. Fica em falta.`,
              { duration: Infinity },
            );
          } else {
            // Outro erro de negócio (ponto inactivo, turno não corre): não vale
            // a pena retentar em loop — descarta com aviso honesto.
            toast.error(`1 registo de ${ponto} não foi aceite (${msg}).`, {
              duration: Infinity,
            });
          }
          items = remove(items, it.localId);
          persist(items);
        }
      }
      if (synced) qc.invalidateQueries({ queryKey: ["haccp", restaurantId] });
    } finally {
      flushing.current = false;
    }
  }, [persist, qc, restaurantId]);

  React.useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  const trying = queue.some((q) => q.attempts >= MAX_ATTEMPTS_BANNER);
  const isPendingSync = React.useCallback(
    (controlPointId: string, turnId: string) =>
      hasPendingSync(queue, controlPointId, turnId),
    [queue],
  );
  return { pendingCount: queue.length, trying, enqueueLocal, isPendingSync, flush };
}
