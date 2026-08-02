import * as React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useTurns } from "@/hooks/use-turns";
import { useIngredients } from "@/hooks/use-ingredients";
import { useItemVariants, useMenuItems } from "@/hooks/use-menu";
import { useTechSheetLines, useTechSheets } from "@/hooks/use-tech-sheets";
import { useSalesByItem, useSalesSummary, type SalesFilters } from "@/hooks/use-stats";
import { computeMenuMargins } from "@/lib/types";
import {
  canCompare,
  classifyDish,
  COVERAGE_WARN_PCT,
  coveragePct,
  formatEuroCents,
  formatQty,
  median,
  PERIOD_KEYS,
  PERIOD_LABEL,
  pctChange,
  periodFor,
  QUADRANT_ACTION,
  QUADRANT_LABEL,
  toFilterArray,
  WEEKDAYS,
  type PeriodKey,
  type Quadrant,
} from "@/lib/stats";

// Estatísticas v0 — "o pulso da casa" (spec 02-08-2026).
//
// Responde a três perguntas e não a cem: como correu o período, o que vende e
// dá dinheiro, e onde está escondido o prato que devia vender mais. Os filtros
// existem a seguir às respostas, não antes delas: um construtor de filtros
// vazio não ajuda quem não sabe que pergunta fazer.
//
// Regra que manda em tudo: nunca mostrar tendência sem amostra que a sustente,
// e ter sempre a cobertura de mapeamento à vista. Um número confiante e errado
// mata a credibilidade do módulo no primeiro uso.

const QUADRANT_ORDER: Quadrant[] = ["estrela", "cavalo", "enigma", "cao"];

const QUADRANT_TONE: Record<Quadrant, string> = {
  estrela: "border-[hsl(var(--status-seated-fg))]/40 bg-[hsl(var(--status-seated-fg))]/5",
  cavalo: "border-destructive/40 bg-destructive/5",
  enigma: "border-terracota-600/40 bg-terracota-600/5",
  cao: "border-input bg-muted/40",
};

export default function Stats() {
  const { data: restaurant, isLoading: loadingRest } = useActiveRestaurant();
  const restaurantId = restaurant?.id;

  const [periodKey, setPeriodKey] = React.useState<PeriodKey>("30d");
  const [turnIds, setTurnIds] = React.useState<string[]>([]);
  const [weekdays, setWeekdays] = React.useState<number[]>([]);

  const turnsQuery = useTurns(restaurantId);

  // `hoje` fixo por montagem: sem isto, cada render às 23:59:59 podia calcular
  // um período diferente do render anterior.
  const hoje = React.useMemo(() => new Date(), []);
  const { current, previous } = React.useMemo(
    () => periodFor(periodKey, hoje),
    [periodKey, hoje],
  );

  const filters: SalesFilters = React.useMemo(
    () => ({
      from: current.from,
      to: current.to,
      turnIds: toFilterArray(turnIds),
      weekdays: toFilterArray(weekdays),
    }),
    [current.from, current.to, turnIds, weekdays],
  );
  const prevFilters: SalesFilters = React.useMemo(
    () => ({ ...filters, from: previous.from, to: previous.to }),
    [filters, previous.from, previous.to],
  );

  const summaryQuery = useSalesSummary(restaurantId, filters);
  const prevQuery = useSalesSummary(restaurantId, prevFilters);
  const itemsSalesQuery = useSalesByItem(restaurantId, filters);

  // Margem por prato: exactamente o mesmo cálculo do ecrã /margens (ficha
  // técnica + custo médio 6m). É o cruzamento com as vendas que os POS não
  // conseguem fazer, porque têm as vendas e não têm o custo do prato.
  const menuItems = useMenuItems(restaurantId);
  const variants = useItemVariants(restaurantId);
  const sheets = useTechSheets(restaurantId);
  const sheetLines = useTechSheetLines(restaurantId);
  const ingredients = useIngredients(restaurantId);

  const marginByItem = React.useMemo(() => {
    if (!menuItems.data) return new Map<string, { name: string; marginPct: number | null; complete: boolean }>();
    const variantsByItem = new Map<string, { price_cents: number | null; is_default: boolean }[]>();
    for (const v of variants.data ?? []) {
      const arr = variantsByItem.get(v.item_id) ?? [];
      arr.push({ price_cents: v.price_cents, is_default: v.is_default });
      variantsByItem.set(v.item_id, arr);
    }
    const summary = computeMenuMargins(
      menuItems.data,
      sheets.data ?? [],
      sheetLines.data ?? [],
      new Map(
        (ingredients.data ?? []).map((i) => [
          i.id,
          { unit: i.unit, cost_per_unit_cents: i.cost_per_unit_cents },
        ]),
      ),
      restaurant?.target_margin_pct ?? 65,
      variantsByItem,
    );
    return new Map(
      summary.rows.map((r) => [r.itemId, { name: r.name, marginPct: r.marginPct, complete: r.complete }]),
    );
  }, [menuItems.data, variants.data, sheets.data, sheetLines.data, ingredients.data, restaurant?.target_margin_pct]);

  const loading =
    loadingRest || summaryQuery.isLoading || itemsSalesQuery.isLoading || menuItems.isLoading;
  const error = summaryQuery.isError || itemsSalesQuery.isError;

  const s = summaryQuery.data;
  const p = prevQuery.data;
  const rows = itemsSalesQuery.data ?? [];

  const cobertura = s ? coveragePct(s.lines_mapped, s.lines_total) : null;
  const comparavel = s && p ? canCompare(s.days, s.units) && p.days > 0 : false;
  const ticket = s && s.docs > 0 ? s.gross_cents / s.docs : null;
  const ticketPrev = p && p.docs > 0 ? p.gross_cents / p.docs : null;

  const ordenados = React.useMemo(() => [...rows].sort((a, b) => b.qty - a.qty), [rows]);

  // Quadrantes: só pratos com ficha COMPLETA e margem calculável. Um prato sem
  // ficha não tem custo, e sem custo não há quadrante nenhum para o pôr.
  const quadrantes = React.useMemo(() => {
    const comMargem = rows
      .map((r) => {
        const m = marginByItem.get(r.menu_item_id);
        return m && m.complete && m.marginPct != null
          ? { ...r, marginPct: m.marginPct }
          : null;
      })
      .filter((x): x is (typeof rows)[number] & { marginPct: number } => x !== null);
    if (comMargem.length === 0) return null;
    const medQty = median(comMargem.map((x) => x.qty));
    const medMargin = median(comMargem.map((x) => x.marginPct));
    const grupos: Record<Quadrant, typeof comMargem> = {
      estrela: [],
      cavalo: [],
      enigma: [],
      cao: [],
    };
    for (const x of comMargem) {
      grupos[classifyDish(x.qty, x.marginPct, medQty, medMargin)].push(x);
    }
    for (const k of QUADRANT_ORDER) grupos[k].sort((a, b) => b.qty - a.qty);
    return { grupos, medQty, medMargin, total: comMargem.length };
  }, [rows, marginByItem]);

  return (
    <div className="container max-w-4xl py-8">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">
          O pulso da casa
        </h1>
        <p className="text-sm text-muted-foreground">
          O que se vendeu, quando, e quanto disso dá dinheiro.
        </p>
      </header>

      {/* Perguntas antes dos filtros. Um ecrã de filtros vazio não ajuda quem
          não sabe que pergunta fazer (spec §5.1). */}
      <div className="mb-4 flex flex-wrap gap-2">
        <QuickQuestion
          label="Como correu o mês passado?"
          onClick={() => {
            setPeriodKey("mes_passado");
            setTurnIds([]);
            setWeekdays([]);
          }}
        />
        <QuickQuestion
          label="O que vendo ao fim de semana?"
          onClick={() => {
            setPeriodKey("3m");
            setTurnIds([]);
            setWeekdays([6, 7]);
          }}
        />
        <QuickQuestion
          label="E o que mudou em 3 meses?"
          onClick={() => {
            setPeriodKey("3m");
            setTurnIds([]);
            setWeekdays([]);
          }}
        />
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-3 py-4">
          <FilterRow label="Período">
            {PERIOD_KEYS.map((k) => (
              <Chip key={k} active={periodKey === k} onClick={() => setPeriodKey(k)}>
                {PERIOD_LABEL[k]}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="Refeição">
            <Chip active={turnIds.length === 0} onClick={() => setTurnIds([])}>
              Todas
            </Chip>
            {(turnsQuery.data ?? []).map((t) => (
              <Chip
                key={t.id}
                active={turnIds.includes(t.id)}
                onClick={() =>
                  setTurnIds((cur) =>
                    cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id],
                  )
                }
              >
                {t.label}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="Dias">
            <Chip active={weekdays.length === 0} onClick={() => setWeekdays([])}>
              Todos
            </Chip>
            {WEEKDAYS.map((d) => (
              <Chip
                key={d.n}
                active={weekdays.includes(d.n)}
                onClick={() =>
                  setWeekdays((cur) =>
                    cur.includes(d.n) ? cur.filter((x) => x !== d.n) : [...cur, d.n],
                  )
                }
                title={d.label}
              >
                {d.short}
              </Chip>
            ))}
          </FilterRow>

          <p className="pt-1 text-xs text-muted-foreground">
            {current.from} a {current.to}
            {s?.first_date && (
              <>
                {" · "}dados de {s.first_date} a {s.last_date}
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Não foi possível carregar as estatísticas.
          </CardContent>
        </Card>
      )}

      {!error && loading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!error && !loading && s && (
        <>
          {s.lines_total === 0 ? (
            <Card>
              <CardContent className="space-y-2 py-12 text-center">
                <p className="text-sm font-medium">Ainda não há vendas neste período.</p>
                <p className="text-sm text-muted-foreground">
                  As vendas de sala entram pelo{" "}
                  <Link to="/fecho-dia" className="underline">
                    ficheiro SAF-T do seu programa de facturação
                  </Link>
                  . As de take-away entram sozinhas.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <CoverageNote
                cobertura={cobertura}
                linesTotal={s.lines_total}
                linesMapped={s.lines_mapped}
                linesNoTime={s.lines_no_time}
                filtrouTurno={turnIds.length > 0}
              />

              <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Kpi
                  label="Vendas"
                  value={formatEuroCents(s.gross_cents)}
                  delta={comparavel && p ? pctChange(s.gross_cents, p.gross_cents) : null}
                />
                <Kpi
                  label="Documentos"
                  value={s.docs.toLocaleString("pt-PT")}
                  delta={comparavel && p ? pctChange(s.docs, p.docs) : null}
                />
                <Kpi
                  label="Ticket médio"
                  value={ticket != null ? formatEuroCents(ticket) : "—"}
                  delta={
                    comparavel && ticket != null && ticketPrev != null
                      ? pctChange(ticket, ticketPrev)
                      : null
                  }
                />
              </div>

              {!comparavel && (
                <p className="-mt-3 mb-6 text-xs text-muted-foreground">
                  Poucos dados para comparar com o período anterior ({s.days}{" "}
                  {s.days === 1 ? "dia" : "dias"} de serviço,{" "}
                  {formatQty(s.units)} unidades). Mostram-se os valores, não a tendência.
                </p>
              )}

              <MenuEngineering data={quadrantes} />

              <TopList
                title="O que mais sai"
                rows={ordenados.slice(0, 10)}
                marginByItem={marginByItem}
              />
              <TopList
                title="O que menos sai"
                rows={[...ordenados].reverse().slice(0, 10)}
                marginByItem={marginByItem}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1 text-xs transition-colors " +
        (active
          ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
          : "border-input bg-card text-muted-foreground hover:border-atlantico-300")
      }
    >
      {children}
    </button>
  );
}

function QuickQuestion({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-atlantico-300/60 bg-card px-3 py-2 text-left text-sm transition-colors hover:border-terracota-600 hover:text-atlantico-900"
    >
      {label}
    </button>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  return (
    <div className="rounded-lg border border-input bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-atlantico-900">{value}</p>
      {delta != null && (
        <p
          className={
            "mt-0.5 text-xs tabular-nums " +
            (delta >= 0 ? "text-[hsl(var(--status-seated-fg))]" : "text-destructive")
          }
        >
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(0)}% face ao período anterior
        </p>
      )}
    </div>
  );
}

// Cobertura de mapeamento sempre à vista (spec §6.2). Se o POS da casa emitir
// "Prato do dia" ou "Diversos", nenhuma análise salva isso, e o sistema tem de
// o dizer em vez de calar e apresentar totais que parecem completos.
function CoverageNote({
  cobertura,
  linesTotal,
  linesMapped,
  linesNoTime,
  filtrouTurno,
}: {
  cobertura: number | null;
  linesTotal: number;
  linesMapped: number;
  linesNoTime: number;
  filtrouTurno: boolean;
}) {
  if (cobertura == null) return null;
  const fraca = cobertura < COVERAGE_WARN_PCT;
  return (
    <div
      className={
        "mb-4 rounded-lg border p-3 text-xs " +
        (fraca ? "border-destructive/50 bg-destructive/5" : "border-input bg-muted/40")
      }
    >
      <p className={fraca ? "font-medium text-destructive" : "text-muted-foreground"}>
        {cobertura.toFixed(0)}% das linhas de venda estão associadas a pratos da sua ementa (
        {linesMapped} de {linesTotal}).
        {fraca && (
          <>
            {" "}
            Abaixo de {COVERAGE_WARN_PCT}%: os totais por prato estão incompletos.{" "}
            <Link to="/fecho-dia" className="underline">
              Conciliar os códigos em falta
            </Link>
            .
          </>
        )}
      </p>
      {linesNoTime > 0 && !filtrouTurno && (
        <p className="mt-1 text-muted-foreground">
          {linesNoTime} linhas vieram de ficheiros antigos, sem hora. Contam para os totais mas
          desaparecem assim que filtrar por refeição.
        </p>
      )}
    </div>
  );
}

// Engenharia de menu: o cruzamento de volume com a margem da ficha técnica.
// Referência é a MEDIANA do próprio menu, não uma constante inventada: cada
// casa é a sua própria referência.
function MenuEngineering({
  data,
}: {
  data: {
    grupos: Record<Quadrant, { menu_item_id: string; item_name: string; qty: number; marginPct: number }[]>;
    medQty: number;
    medMargin: number;
    total: number;
  } | null;
}) {
  if (!data) {
    return (
      <Card className="mb-6">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Sem pratos com ficha técnica completa neste período. A engenharia de menu precisa do
          custo do prato, que vem das{" "}
          <Link to="/margens" className="underline">
            fichas técnicas
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="mb-6">
      <h2 className="mb-1 font-display text-lg font-semibold text-atlantico-900">
        O que vende e o que dá dinheiro
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {data.total} pratos com ficha completa, comparados com a mediana da própria casa (
        {formatQty(data.medQty)} unidades, {data.medMargin.toFixed(0)}% de margem).
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUADRANT_ORDER.map((q) => (
          <div key={q} className={"rounded-lg border p-3 " + QUADRANT_TONE[q]}>
            <p className="text-sm font-medium text-atlantico-900">{QUADRANT_LABEL[q]}</p>
            <p className="mb-2 text-xs text-muted-foreground">{QUADRANT_ACTION[q]}</p>
            {data.grupos[q].length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum.</p>
            ) : (
              <ul className="space-y-1">
                {data.grupos[q].slice(0, 6).map((d) => (
                  <li key={d.menu_item_id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">{d.item_name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatQty(d.qty)} un · {d.marginPct.toFixed(0)}%
                    </span>
                  </li>
                ))}
                {data.grupos[q].length > 6 && (
                  <li className="text-xs text-muted-foreground">
                    e mais {data.grupos[q].length - 6}
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TopList({
  title,
  rows,
  marginByItem,
}: {
  title: string;
  rows: { menu_item_id: string; item_name: string; qty: number; gross_cents: number }[];
  marginByItem: Map<string, { name: string; marginPct: number | null; complete: boolean }>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-display text-lg font-semibold text-atlantico-900">{title}</h2>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const m = marginByItem.get(r.menu_item_id);
          return (
            <div
              key={r.menu_item_id}
              className="flex items-center gap-3 rounded-md border border-input bg-card p-2.5"
            >
              <p className="min-w-0 flex-1 truncate text-sm">{r.item_name}</p>
              <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatQty(r.qty)} un
              </p>
              <p className="w-20 shrink-0 text-right text-sm tabular-nums">
                {formatEuroCents(r.gross_cents)}
              </p>
              <p className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {m?.complete && m.marginPct != null ? `${m.marginPct.toFixed(0)}%` : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
