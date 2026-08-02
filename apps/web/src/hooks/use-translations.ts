import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";

// Traduções do menu (0025), lado do backoffice. A IA escreve o rascunho, o dono
// corrige e valida, e só o que está validado chega ao menu público.
//
// Uma edição à mão marca a linha como `manual`, e a partir daí uma nova geração
// não lhe toca. É a diferença entre uma ferramenta que ajuda e uma que apaga
// trabalho feito.

export type TransLang = "en" | "es" | "fr";
export const TRANS_LANGS: TransLang[] = ["en", "es", "fr"];

export interface TranslationRow {
  id: string;
  entity_type: "item" | "category" | "variant";
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

export function useGenerateTranslations(restaurantId: string | undefined) {
  const invalidate = useInvalidate(restaurantId);
  return useMutation({
    mutationFn: async (langs: TransLang[]): Promise<GenerateResult> => {
      const { data, error } = await supabase.functions.invoke("translate-menu", {
        body: { restaurantId, langs },
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
        throw new Error(reason ?? "não foi possível gerar as traduções");
      }
      const res = data as GenerateResult;
      if (!res.translated) throw new Error(res.reason ?? "não foi possível gerar as traduções");
      return res;
    },
    onSuccess: invalidate,
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
