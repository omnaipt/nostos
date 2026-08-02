import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, Languages, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LANG_LABEL } from "@/lib/i18n";
import { useItemVariants, useMenuCategories, useMenuItems } from "@/hooks/use-menu";
import {
  TRANS_LANGS,
  useGenerateTranslations,
  useTranslationProgress,
  useTranslations,
  useUpdateTranslation,
  useValidateTranslations,
  type TransLang,
  type TranslationRow,
} from "@/hooks/use-translations";

// Ementa noutros idiomas (0025), lado do backoffice. Mesmo padrão da importação
// de ementa e das fichas técnicas: a IA escreve o rascunho, o dono lê e valida,
// e só o validado chega à mesa. Sem tradução validada, o menu público mostra o
// original em português (fallback intencional, não é um erro).

// Nomes dos idiomas em português: o backoffice é ferramenta de trabalho de uma
// casa portuguesa. O endónimo (LANG_LABEL) aparece só na revisão, porque é o
// que o cliente vê no selector do menu público.
const LANG_PT: Record<TransLang, string> = {
  en: "Inglês",
  es: "Espanhol",
  fr: "Francês",
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Não foi possível concluir. Tente novamente.";
}

function entityKey(type: TranslationRow["entity_type"], id: string): string {
  return `${type}:${id}`;
}

function chipClass(on: boolean): string {
  return (
    "rounded-full border px-3 py-1 text-xs transition-colors " +
    (on
      ? "border-primary bg-primary text-primary-foreground"
      : "border-input text-muted-foreground hover:bg-muted")
  );
}

export function TranslationsCard({ restaurantId }: { restaurantId: string }) {
  const progressQuery = useTranslationProgress(restaurantId);
  const generate = useGenerateTranslations(restaurantId);
  const [picked, setPicked] = React.useState<TransLang[]>([...TRANS_LANGS]);
  const [reviewLang, setReviewLang] = React.useState<TransLang | null>(null);

  const byLang = React.useMemo(
    () => new Map((progressQuery.data ?? []).map((p) => [p.lang, p])),
    [progressQuery.data],
  );

  function toggle(lang: TransLang) {
    setPicked((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  function run() {
    if (picked.length === 0) return;
    generate.mutate(picked, {
      onSuccess: () =>
        toast.success(
          picked.length === 1
            ? `Rascunho gerado em ${LANG_PT[picked[0]]}. Rever antes de validar.`
            : "Rascunhos gerados. Rever antes de validar.",
        ),
      onError: (e) => toast.error(`Não foi possível gerar: ${errMsg(e)}`),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" aria-hidden="true" /> Ementa noutros idiomas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A IA escreve um primeiro rascunho da ementa em inglês, espanhol e francês. Só as
          traduções validadas chegam ao menu público: um prato sem tradução validada é
          mostrado em português ao cliente estrangeiro.
        </p>

        {progressQuery.isError && (
          <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            Não foi possível carregar o estado das traduções. Recarregue a página.
          </p>
        )}

        {progressQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!progressQuery.isLoading && !progressQuery.isError && (
          <ul className="divide-y divide-border rounded-md border border-input">
            {TRANS_LANGS.map((lang) => {
              const p = byLang.get(lang);
              const rascunhos = p?.rascunhos ?? 0;
              const validadas = p?.validadas ?? 0;
              const traduzidos = rascunhos + validadas;
              const total = p?.total_itens ?? 0;
              return (
                <li
                  key={lang}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-medium">{LANG_PT[lang]}</span>
                    <span className="block text-xs text-muted-foreground">
                      {total === 0
                        ? "Ainda não há pratos activos na ementa."
                        : traduzidos === 0
                          ? `Sem traduções. Os ${total} pratos activos aparecem em português.`
                          : `${traduzidos} de ${total} pratos traduzidos, ${validadas} validados.`}
                      {traduzidos > 0 &&
                        validadas === 0 &&
                        " Por validar, ainda não chega ao cliente."}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={traduzidos === 0 && total === 0}
                    onClick={() => setReviewLang(lang)}
                  >
                    Rever {LANG_PT[lang].toLowerCase()}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {generate.isPending ? (
          <div className="flex items-start gap-3 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span>
              A gerar traduções. O modelo lê a ementa toda e pode demorar dezenas de
              segundos. Mantenha esta página aberta. Nada é publicado sem validação.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {TRANS_LANGS.map((lang) => {
                const on = picked.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={on}
                    className={chipClass(on)}
                    onClick={() => toggle(lang)}
                  >
                    {LANG_PT[lang]}
                  </button>
                );
              })}
              <Button size="sm" disabled={picked.length === 0} onClick={run}>
                Gerar traduções
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A geração escreve apenas rascunhos. As linhas já validadas e as editadas à
              mão ficam intactas.
            </p>
            {generate.isError && (
              <p className="text-sm text-destructive">
                Não foi possível gerar: {errMsg(generate.error)}
              </p>
            )}
          </div>
        )}

        {reviewLang && (
          <ReviewDialog
            key={reviewLang}
            restaurantId={restaurantId}
            lang={reviewLang}
            open
            onOpenChange={(o) => {
              if (!o) setReviewLang(null);
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Revisão de um idioma em diálogo: o dono está a comparar duas colunas e a
// decidir, e essa leitura merece o ecrã todo sem o resto da página à volta.
function ReviewDialog({
  restaurantId,
  lang,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  lang: TransLang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rowsQuery = useTranslations(restaurantId, lang);
  const itemsQuery = useMenuItems(restaurantId);
  const catsQuery = useMenuCategories(restaurantId);
  const variantsQuery = useItemVariants(restaurantId);
  const update = useUpdateTranslation(restaurantId);
  const validate = useValidateTranslations(restaurantId);
  const [onlyPending, setOnlyPending] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const rows = React.useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const byEntity = React.useMemo(
    () => new Map(rows.map((r) => [entityKey(r.entity_type, r.entity_id), r])),
    [rows],
  );

  // Só o que o cliente vê: pratos e categorias activos, e as doses desses
  // pratos. A edge traduz exactamente este conjunto.
  const items = React.useMemo(
    () => (itemsQuery.data ?? []).filter((i) => i.active),
    [itemsQuery.data],
  );
  const cats = React.useMemo(
    () => (catsQuery.data ?? []).filter((c) => c.active),
    [catsQuery.data],
  );
  const variants = React.useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    return (variantsQuery.data ?? []).filter((v) => ids.has(v.item_id));
  }, [variantsQuery.data, items]);
  const itemNameById = React.useMemo(
    () => new Map(items.map((i) => [i.id, i.name])),
    [items],
  );

  const loading =
    rowsQuery.isLoading ||
    itemsQuery.isLoading ||
    catsQuery.isLoading ||
    variantsQuery.isLoading;

  const traduzidos = items.filter((i) => byEntity.has(entityKey("item", i.id))).length;
  const porValidar = rows.filter((r) => r.status === "rascunho").length;
  const semTraducao = items.length - traduzidos;

  function handleSave(id: string, name: string, description: string | null) {
    setBusyId(id);
    update.mutate(
      { id, name, description },
      {
        onSuccess: () => toast.success("Tradução guardada."),
        onError: (e) => toast.error(errMsg(e)),
        onSettled: () => setBusyId(null),
      },
    );
  }

  function handleStatus(id: string, status: "rascunho" | "validada") {
    setBusyId(id);
    validate.mutate(
      { ids: [id], status },
      {
        onSuccess: () =>
          toast.success(
            status === "validada" ? "Tradução validada." : "Tradução reposta em rascunho.",
          ),
        onError: (e) => toast.error(errMsg(e)),
        onSettled: () => setBusyId(null),
      },
    );
  }

  function handleValidateAll() {
    validate.mutate(
      { lang, status: "validada" },
      {
        onSuccess: () => toast.success(`Traduções em ${LANG_PT[lang]} validadas.`),
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  function visible(row: TranslationRow | undefined): boolean {
    return !onlyPending || !row || row.status === "rascunho";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Rever a ementa em ${LANG_PT[lang].toLowerCase()} (${LANG_LABEL[lang]})`}
      description="Original em português à esquerda, tradução à direita. Guarde cada alteração antes de validar."
      className="sm:max-w-4xl"
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {items.length === 0
                ? "Não há pratos activos na ementa."
                : `${traduzidos} de ${items.length} pratos traduzidos, ${porValidar} por validar` +
                  (semTraducao > 0
                    ? `, ${semTraducao} sem tradução (ficam em português).`
                    : ".")}
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={onlyPending}
                onChange={(e) => setOnlyPending(e.target.checked)}
              />
              Mostrar apenas o que falta rever
            </label>
          </div>

          {items.length > 0 &&
            cats.map((cat) => {
              const list = items
                .filter((i) => i.category_id === cat.id)
                .filter((i) => visible(byEntity.get(entityKey("item", i.id))));
              if (list.length === 0) return null;
              return (
                <section key={cat.id} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cat.label}
                  </h3>
                  <ul className="divide-y divide-border rounded-md border border-input">
                    {list.map((item) => {
                      const row = byEntity.get(entityKey("item", item.id));
                      return (
                        <ItemRow
                          key={item.id}
                          name={item.name}
                          description={item.description}
                          row={row}
                          langPt={LANG_PT[lang]}
                          busy={!!row && busyId === row.id}
                          onSave={handleSave}
                          onStatus={handleStatus}
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}

          {/* Pratos activos numa categoria desactivada: continuam a existir e a
              edge traduz-nos, por isso aparecem aqui em vez de desaparecerem. */}
          {(() => {
            const catIds = new Set(cats.map((c) => c.id));
            const orphans = items
              .filter((i) => !catIds.has(i.category_id))
              .filter((i) => visible(byEntity.get(entityKey("item", i.id))));
            if (orphans.length === 0) return null;
            return (
              <section className="space-y-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pratos em categorias desactivadas
                </h3>
                <ul className="divide-y divide-border rounded-md border border-input">
                  {orphans.map((item) => {
                    const row = byEntity.get(entityKey("item", item.id));
                    return (
                      <ItemRow
                        key={item.id}
                        name={item.name}
                        description={item.description}
                        row={row}
                        langPt={LANG_PT[lang]}
                        busy={!!row && busyId === row.id}
                        onSave={handleSave}
                        onStatus={handleStatus}
                      />
                    );
                  })}
                </ul>
              </section>
            );
          })()}

          {cats.length > 0 && (
            <CompactSection
              title="Categorias"
              note="Os títulos das secções da ementa."
              entries={cats
                .map((c) => ({
                  key: c.id,
                  original: c.label,
                  row: byEntity.get(entityKey("category", c.id)),
                }))
                .filter((e) => visible(e.row))}
              langPt={LANG_PT[lang]}
              busyId={busyId}
              onSave={handleSave}
              onStatus={handleStatus}
            />
          )}

          {variants.length > 0 && (
            <CompactSection
              title="Doses e formatos"
              note="Meia dose, dose, jarro e afins, tal como aparecem no prato."
              entries={variants
                .map((v) => ({
                  key: v.id,
                  original: v.label,
                  hint: itemNameById.get(v.item_id) ?? undefined,
                  row: byEntity.get(entityKey("variant", v.id)),
                }))
                .filter((e) => visible(e.row))}
              langPt={LANG_PT[lang]}
              busyId={busyId}
              onSave={handleSave}
              onStatus={handleStatus}
            />
          )}

          {items.length === 0 && cats.length === 0 && (
            <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              Ainda não há pratos activos para traduzir. Registe a ementa primeiro.
            </p>
          )}

          {onlyPending && porValidar === 0 && semTraducao === 0 && items.length > 0 && (
            <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              Não há nada por rever neste idioma.
            </p>
          )}

          <div className="space-y-3 rounded-md border border-[hsl(var(--status-pending-fg))]/40 bg-[hsl(var(--status-pending-bg))] p-3">
            <p className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Validar tudo marca as traduções deste idioma como validadas e publica-as no
                menu público, incluindo as que ainda não leu. O texto foi escrito por IA e
                pode ter erros que o cliente lê à mesa. Reveja os rascunhos antes de
                continuar.
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={validate.isPending || porValidar === 0}
                onClick={handleValidateAll}
              >
                Validar tudo ({porValidar})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function StatusBadges({ row }: { row: TranslationRow }) {
  return (
    <>
      <Badge variant={row.status === "validada" ? "confirmada" : "pendente"}>
        {row.status === "validada" ? "Validada" : "Rascunho"}
      </Badge>
      <Badge variant="neutral">
        {row.source === "manual" ? "Editada à mão" : "Escrita por IA"}
      </Badge>
    </>
  );
}

interface EditorProps {
  row: TranslationRow;
  langPt: string;
  busy: boolean;
  withDescription: boolean;
  compact?: boolean;
  onSave: (id: string, name: string, description: string | null) => void;
  onStatus: (id: string, status: "rascunho" | "validada") => void;
}

function TranslationEditor({
  row,
  langPt,
  busy,
  withDescription,
  compact,
  onSave,
  onStatus,
}: EditorProps) {
  const [name, setName] = React.useState(row.name ?? "");
  const [description, setDescription] = React.useState(row.description ?? "");

  // O servidor manda: depois de guardar (ou de uma nova geração) a linha volta
  // a espelhar o que está gravado.
  React.useEffect(() => {
    setName(row.name ?? "");
    setDescription(row.description ?? "");
  }, [row.name, row.description]);

  const dirty = name !== (row.name ?? "") || description !== (row.description ?? "");
  const canSave = dirty && name.trim().length > 0 && !busy;

  return (
    <div className="space-y-2">
      <Input
        aria-label={`Nome em ${langPt}`}
        className={compact ? "h-9" : undefined}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {withDescription && (
        <Textarea
          aria-label={`Descrição em ${langPt}`}
          className="min-h-[64px]"
          maxLength={600}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadges row={row} />
        {dirty && (
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!canSave}
            onClick={() => onSave(row.id, name.trim(), description.trim() || null)}
          >
            Guardar
          </Button>
        )}
        {row.status === "rascunho" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy || dirty}
            onClick={() => onStatus(row.id, "validada")}
          >
            Validar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => onStatus(row.id, "rascunho")}
          >
            Repor em rascunho
          </Button>
        )}
      </div>
      {dirty && (
        <p className="text-xs text-muted-foreground">Guarde a alteração antes de validar.</p>
      )}
    </div>
  );
}

function ItemRow({
  name,
  description,
  row,
  langPt,
  busy,
  onSave,
  onStatus,
}: {
  name: string;
  description: string | null;
  row: TranslationRow | undefined;
  langPt: string;
  busy: boolean;
  onSave: (id: string, name: string, description: string | null) => void;
  onStatus: (id: string, status: "rascunho" | "validada") => void;
}) {
  return (
    <li className="grid gap-3 p-3 sm:grid-cols-2">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{name}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Sem descrição no original.</p>
        )}
      </div>
      {row ? (
        <TranslationEditor
          row={row}
          langPt={langPt}
          busy={busy}
          withDescription={!!description}
          onSave={onSave}
          onStatus={onStatus}
        />
      ) : (
        // Fallback do sistema, dito na linha: o prato não desaparece, aparece
        // em português a quem lê noutro idioma.
        <p className="self-start rounded-md border border-dashed border-input p-2 text-xs text-muted-foreground">
          Sem tradução. Este prato aparece em português ao cliente que escolher{" "}
          {langPt.toLowerCase()}.
        </p>
      )}
    </li>
  );
}

interface CompactEntry {
  key: string;
  original: string;
  hint?: string;
  row: TranslationRow | undefined;
}

// Categorias e doses: são poucas e curtas, mas um "1/2 dose" por traduzir
// aparece em português no meio de uma ementa inglesa.
function CompactSection({
  title,
  note,
  entries,
  langPt,
  busyId,
  onSave,
  onStatus,
}: {
  title: string;
  note: string;
  entries: CompactEntry[];
  langPt: string;
  busyId: string | null;
  onSave: (id: string, name: string, description: string | null) => void;
  onStatus: (id: string, status: "rascunho" | "validada") => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{note}</p>
      <ul className="divide-y divide-border rounded-md border border-input">
        {entries.map((e) => (
          <li key={e.key} className="grid gap-2 px-3 py-2 sm:grid-cols-2 sm:items-start">
            <span className="min-w-0 text-sm">
              {e.original}
              {e.hint && (
                <span className="block text-xs text-muted-foreground">{e.hint}</span>
              )}
            </span>
            {e.row ? (
              <TranslationEditor
                row={e.row}
                langPt={langPt}
                busy={busyId === e.row.id}
                withDescription={false}
                compact
                onSave={onSave}
                onStatus={onStatus}
              />
            ) : (
              <span className="self-start text-xs text-muted-foreground">
                Sem tradução. Aparece em português.
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
