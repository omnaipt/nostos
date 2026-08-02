import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

// Traduções do menu (0025), lado do backoffice. A IA escreve o rascunho, o dono
// corrige e valida, e só o que está validado chega ao menu público.
//
// Uma edição à mão marca a linha como `manual`, e a partir daí uma nova geração
// não lhe toca. É a diferença entre uma ferramenta que ajuda e uma que apaga
// trabalho feito.

// 0026: `turn` entrou porque a página de reserva passou a seguir o idioma do
// menu, e o turno é a escolha central dessa página.
export type TransEntity = "item" | "category" | "variant" | "turn";

export type TransLang = "en" | "es" | "fr";
export const TRANS_LANGS: TransLang[] = ["en", "es", "fr"];

export interface TranslationRow {
  id: string;
  entity_type: TransEntity;
  entity_id: string;
  lang: TransLang;
  name: string | null;
  description: string | null;
  source: "ai" | "manual";
  status: "rascunho" | "validada";
}

export interface TranslationProgress {
  lang: TransLang;
  rascunhos: number;
  validadas: number;
  total_itens: number;
}

export function useTranslationProgress(restaurantId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.translationProgress(restaurantId),
    queryFn: async (): Promise<TranslationProgress[]> => {
      const { data, error } = await supabase.rpc("menu_translation_progress", {
        p_restaurant: restaurantId as string,
      });
      if (error) throw error;
      return (data ?? []) as TranslationProgress[];
    },
    enabled: !!restaurantId,
  });
}

export function useTranslations(restaurantId: string | undefined, lang: TransLang) {
  return useQuery({
    queryKey: queryKeys.translations(restaurantId, lang),
    queryFn: async (): Promise<TranslationRow[]> => {
      const { data, error } = await supabase
        .from("menu_translations")
        .select("id, entity_type, entity_id, lang, name, description, source, status")
        .eq("restaurant_id", restaurantId as string)
        .eq("lang", lang);
      if (error) throw error;
      return (data ?? []) as TranslationRow[];
    },
    enabled: !!restaurantId,
  });
}

function useInvalidate(restaurantId: string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.translationsRoot });
    qc.invalidateQueries({ queryKey: queryKeys.translationProgress(restaurantId) });
  };
}

export interface GenerateResult {
  translated: boolean;
  reason?: string;
  results?: Record<string, { itens: number; categorias: number; doses: number }>;
}

const LANG_NOME: Record<TransLang, string> = {
  en: "inglês",
  es: "espanhol",
  fr: "francês",
};

// UM idioma por invocação. A primeira versão mandava os três de uma vez e a
// edge excedia o tempo limite a meio: o inglês ficava gravado e os outros dois
// perdiam-se, com o ecrã a dizer só "não foi possível gerar". Cada idioma são
// duas ou três chamadas ao modelo, e três idiomas seguidos não cabem numa
// única invocação. Como a gravação é upsert, repetir é inofensivo.
export function useGenerateTranslations(restaurantId: string | undefined) {
  const invalidate = useInvalidate(restaurantId);
  return useMutation({
    mutationFn: async (langs: TransLang[]): Promise<GenerateResult> => {
      const results: NonNullable<GenerateResult["results"]> = {};
      const falhados: string[] = [];

      for (const lang of langs) {
        try {
          const { data, error } = await supabase.functions.invoke("translate-menu", {
            body: { restaurantId, langs: [lang] },
          });
          if (error) {
            const ctx = (error as { context?: unknown }).context;
            let reason: string | null = null;
            if (ctx instanceof Response) {
              reason = await ctx
                .json()
                .then((b: { reason?: string }) => b?.reason ?? null)
                .catch(() => null);
            }
            throw new Error(reason ?? `a geração excedeu o tempo disponível`);
          }
          const res = data as GenerateResult;
          if (!res.translated) throw new Error(res.reason ?? "razão desconhecida");
          Object.assign(results, res.results ?? {});
        } catch (e) {
          falhados.push(`${LANG_NOME[lang]} (${e instanceof Error ? e.message : "erro"})`);
        }
      }

      // Falha parcial é o caso mais provável e tem de ser dita como tal: dizer
      // só "não foi possível" esconde que dois idiomas ficaram prontos.
      if (falhados.length === langs.length) {
        throw new Error(`nenhum idioma foi traduzido. ${falhados.join("; ")}`);
      }
      if (falhados.length > 0) {
        throw new Error(
          `${Object.keys(results).length} de ${langs.length} idiomas ficaram prontos. Falhou: ${falhados.join("; ")}. Voltar a gerar retoma o que falta.`,
        );
      }
      return { translated: true, results };
    },
    // Também em erro: uma falha parcial deixa linhas gravadas, e o ecrã tem de
    // as mostrar em vez de continuar a dizer "sem traduções".
    onSuccess: invalidate,
    onError: invalidate,
  });
}

// Editar à mão passa a linha a `manual`: gerações futuras deixam de lhe tocar.
export function useUpdateTranslation(restaurantId: string | undefined) {
  const invalidate = useInvalidate(restaurantId);
  return useMutation({
    mutationFn: async (input: { id: string; name: string; description: string | null }) => {
      const { error } = await supabase
        .from("menu_translations")
        .update({
          name: input.name,
          description: input.description,
          source: "manual",
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useValidateTranslations(restaurantId: string | undefined) {
  const invalidate = useInvalidate(restaurantId);
  return useMutation({
    mutationFn: async (input: { ids?: string[]; lang?: TransLang; status: "rascunho" | "validada" }) => {
      let q = supabase
        .from("menu_translations")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId as string);
      if (input.ids?.length) q = q.in("id", input.ids);
      else if (input.lang) q = q.eq("lang", input.lang);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
