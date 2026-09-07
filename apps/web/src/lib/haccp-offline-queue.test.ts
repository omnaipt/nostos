import { describe, expect, it } from "vitest";
import {
  enqueue,
  hasPendingSync,
  markAttempt,
  peek,
  remove,
  type HaccpQueueItem,
} from "./haccp-offline-queue";

function item(localId: string, over: Partial<HaccpQueueItem> = {}): HaccpQueueItem {
  return {
    localId,
    controlPointId: "cp",
    turnId: "t",
    valueC: 4,
    capturedAt: "2026-09-07T10:00:00.000Z",
    attempts: 0,
    ...over,
  };
}

describe("fila offline HACCP (reducer puro)", () => {
  it("enqueue mantém ordem FIFO", () => {
    const q = enqueue(enqueue([], item("a")), item("b"));
    expect(q.map((i) => i.localId)).toEqual(["a", "b"]);
  });

  it("peek devolve o mais antigo sem remover", () => {
    const q = enqueue(enqueue([], item("a")), item("b"));
    expect(peek(q)?.localId).toBe("a");
    expect(q).toHaveLength(2);
  });

  it("peek de fila vazia devolve null", () => {
    expect(peek([])).toBeNull();
  });

  it("remove tira o item certo", () => {
    const q = enqueue(enqueue([], item("a")), item("b"));
    expect(remove(q, "a").map((i) => i.localId)).toEqual(["b"]);
  });

  it("remove é idempotente (remover inexistente não altera)", () => {
    const q = enqueue([], item("a"));
    expect(remove(q, "zzz").map((i) => i.localId)).toEqual(["a"]);
    expect(remove(remove(q, "a"), "a")).toEqual([]);
  });

  it("markAttempt incrementa só o item alvo", () => {
    const q = enqueue(enqueue([], item("a")), item("b", { attempts: 2 }));
    const next = markAttempt(q, "b");
    expect(next.find((i) => i.localId === "b")?.attempts).toBe(3);
    expect(next.find((i) => i.localId === "a")?.attempts).toBe(0);
  });

  it("enqueue não muta o array original", () => {
    const original = enqueue([], item("a"));
    enqueue(original, item("b"));
    expect(original).toHaveLength(1);
  });

  it("hasPendingSync casa por ponto+turno", () => {
    const q = enqueue([], item("a", { controlPointId: "cp1", turnId: "t1" }));
    expect(hasPendingSync(q, "cp1", "t1")).toBe(true);
    expect(hasPendingSync(q, "cp1", "t2")).toBe(false);
    expect(hasPendingSync(q, "cp2", "t1")).toBe(false);
    expect(hasPendingSync([], "cp1", "t1")).toBe(false);
  });
});
