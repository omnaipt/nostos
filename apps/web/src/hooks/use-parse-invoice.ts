import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Ingredient } from "@/lib/types";
import type { MatchedLine } from "../../../../supabase/functions/parse-invoice/match";

// Parse de fatura (PDF ou fotos) → resultado pré-preenchível. Chama a edge
// parse-invoice, que é PURA (bytes → JSON, nunca escreve stock). O formulário
// manual de /entradas é o ecrã de revisão; registar continua a ser o único
// botão que escreve. Progressive enhancement: qualquer falha aqui deixa o
// fluxo manual intacto.

export interface ParseInvoiceResult {
  parsed: boolean;
  reason?: string;
  supplier?: string | null;
  supplier_norm?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  lines?: MatchedLine[];
  remaining?: number;
}

export type { MatchedLine };

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

async function fileToBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function useParseInvoice(
  restaurantId: string | undefined,
  ingredients: Ingredient[],
) {
  return useMutation({
    mutationFn: async (files: File[]): Promise<ParseInvoiceResult> => {
      const pdfs = files.filter((f) => f.type === "application/pdf");
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (pdfs.length + images.length === 0) {
        throw new Error("Escolhe um PDF ou fotos da fatura.");
      }
      if (pdfs.length > 1 || (pdfs.length === 1 && images.length > 0)) {
        throw new Error("Um PDF de cada vez, ou até 5 fotos.");
      }
      const chosen = pdfs.length === 1 ? pdfs : images.slice(0, MAX_FILES);
      const totalBytes = chosen.reduce((acc, f) => acc + f.size, 0);
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error("Ficheiros demasiado grandes (máx. 10 MB no total).");
      }

      const payloadFiles = await Promise.all(
        chosen.map(async (f) => ({
          kind: f.type === "application/pdf" ? ("pdf" as const) : ("image" as const),
          mediaType: f.type,
          dataBase64: await fileToBase64(f),
        })),
      );

      const { data, error } = await supabase.functions.invoke("parse-invoice", {
        body: {
          restaurantId,
          files: payloadFiles,
          ingredients: ingredients
            .filter((i) => i.active !== false)
            .map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
        },
      });
      if (error) throw new Error("Não foi possível ler a fatura. O registo manual continua disponível.");
      return data as ParseInvoiceResult;
    },
  });
}
