// Fila offline de registos de temperatura (item 4, A2). Sem service worker: a
// fila vive em localStorage e é esvaziada por ordem no próximo `online`/mount.
//
// O reducer é PURO (opera sobre um array) para poder ser testado sem browser;
// as funções de persistência (load/save) isolam o acesso ao localStorage.

export const QUEUE_KEY = "nostos.haccp.queue.v1";

export interface HaccpQueueItem {
  localId: string;
  controlPointId: string;
  turnId: string;
  valueC: number;
  capturedAt: string; // ISO, relógio LOCAL do telemóvel (o servidor valida a janela)
  note?: string;
  rectifiesId?: string;
  attempts: number;
}

// ── Reducer puro (FIFO) ────────────────────────────────────────────────────

// Acrescenta ao fim (FIFO: o primeiro a entrar é o primeiro a sincronizar).
export function enqueue(items: HaccpQueueItem[], item: HaccpQueueItem): HaccpQueueItem[] {
  return [...items, item];
}

// Próximo a sincronizar (o mais antigo), sem o remover.
export function peek(items: HaccpQueueItem[]): HaccpQueueItem | null {
  return items[0] ?? null;
}

// Remove por localId. Idempotente: remover algo que já não existe devolve a
// mesma lista (por valor), nunca lança.
export function remove(items: HaccpQueueItem[], localId: string): HaccpQueueItem[] {
  return items.filter((it) => it.localId !== localId);
}

// Incrementa o contador de tentativas do item (após uma falha de rede).
export function markAttempt(items: HaccpQueueItem[], localId: string): HaccpQueueItem[] {
  return items.map((it) =>
    it.localId === localId ? { ...it, attempts: it.attempts + 1 } : it,
  );
}

// ── Persistência (localStorage) ─────────────────────────────────────────────

export function loadQueue(): HaccpQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HaccpQueueItem[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(items: HaccpQueueItem[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Quota do localStorage cheia: nada a fazer aqui, o chamador já tratou o
    // caso feliz; perder a fila é melhor do que rebentar a UI.
  }
}

// Gera um item novo (impuro: usa crypto para o localId). O capturedAt é o
// instante local em que o colaborador confirmou.
export function makeQueueItem(
  input: Omit<HaccpQueueItem, "localId" | "attempts">,
): HaccpQueueItem {
  const localId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${input.capturedAt}-${input.controlPointId}`;
  return { ...input, localId, attempts: 0 };
}
