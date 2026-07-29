import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableManager, type TableRow } from "@/components/tables/TableManager";
import { TurnManager, type TurnRow } from "@/components/turns/TurnManager";
import { PantryManager } from "@/components/menu/PantryManager";
import { CasaLogo } from "@/components/CasaLogo";
import { useActiveRestaurant, useUpdateRestaurant } from "@/hooks/use-active-restaurant";
import { supabase } from "@/integrations/supabase/client";
import { isThemeSlug, THEME_SLUGS, THEMES } from "@/lib/themes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Restaurant } from "@/lib/types";
import { useCreateTable, useDeleteTable, useTables, useUpdateTable } from "@/hooks/use-tables";
import { useCreateTurn, useDeleteTurn, useTurns, useUpdateTurn } from "@/hooks/use-turns";
import type { IsoWeekday } from "@/lib/types";

// C1 + C2 em definições: gerir mesas e turnos depois do onboarding.
// WIRING #4: dados via TanStack Query (RLS tenant-scoped). Os managers são
// controlados; cada onChange é diffado contra o estado servido para mapear a
// operação (create / update / toggle-active / delete) à mutação Supabase certa.

function tablesToRows(
  rows: { id: string; label: string; seats: number; sort_order: number; active: boolean }[],
): TableRow[] {
  return rows.map((m) => ({ id: m.id, label: m.label, seats: m.seats, sortOrder: m.sort_order, active: m.active }));
}

export default function Settings() {
  const { data: restaurant, isLoading: loadingRest, isError: restError } = useActiveRestaurant();
  const restaurantId = restaurant?.id;

  const tablesQuery = useTables(restaurantId);
  const turnsQuery = useTurns(restaurantId);

  const createTable = useCreateTable(restaurantId);
  const updateTable = useUpdateTable(restaurantId);
  const deleteTable = useDeleteTable(restaurantId);
  const createTurn = useCreateTurn(restaurantId);
  const updateTurn = useUpdateTurn(restaurantId);
  const deleteTurn = useDeleteTurn(restaurantId);

  const loading = loadingRest || tablesQuery.isLoading || turnsQuery.isLoading;
  const error = restError || tablesQuery.isError || turnsQuery.isError;

  const tables: TableRow[] = React.useMemo(
    () => tablesToRows(tablesQuery.data ?? []),
    [tablesQuery.data],
  );
  const turns: TurnRow[] = React.useMemo(
    () =>
      (turnsQuery.data ?? []).map((m) => ({
        id: m.id,
        label: m.label,
        startTime: m.start_time,
        service: m.service ?? "",
        weekdays: m.weekdays,
        active: m.active,
      })),
    [turnsQuery.data],
  );

  // Diff de mesas: o manager devolve a lista nova; deduzimos a operação.
  function onTablesChange(next: TableRow[]) {
    if (!restaurantId) return;
    const prevById = new Map(tables.map((t) => [t.id, t]));
    const nextById = new Map(next.map((t) => [t.id, t]));

    for (const t of next) {
      const prev = prevById.get(t.id);
      if (!prev) {
        // id local-* => criação.
        createTable.mutate(
          { restaurantId, label: t.label, seats: t.seats, sortOrder: t.sortOrder, active: t.active },
          { onSuccess: () => toast.success("Mesa criada"), onError: (e) => toast.error(errMsg(e)) },
        );
      } else if (
        prev.label !== t.label ||
        prev.seats !== t.seats ||
        prev.sortOrder !== t.sortOrder ||
        prev.active !== t.active
      ) {
        updateTable.mutate(
          { id: t.id, patch: { label: t.label, seats: t.seats, sort_order: t.sortOrder, active: t.active } },
          { onSuccess: () => toast.success("Mesa guardada"), onError: (e) => toast.error(errMsg(e)) },
        );
      }
    }
    for (const prev of tables) {
      if (!nextById.has(prev.id)) {
        deleteTable.mutate(prev.id, {
          onSuccess: () => toast.success("Mesa removida"),
          onError: (e) => toast.error(errMsg(e)),
        });
      }
    }
  }

  function onTurnsChange(next: TurnRow[]) {
    if (!restaurantId) return;
    const prevById = new Map(turns.map((t) => [t.id, t]));
    const nextById = new Map(next.map((t) => [t.id, t]));

    for (const t of next) {
      const prev = prevById.get(t.id);
      const service = t.service ? t.service : null;
      const weekdays = t.weekdays as IsoWeekday[];
      if (!prev) {
        createTurn.mutate(
          { restaurantId, label: t.label, service, startTime: t.startTime, weekdays, active: t.active },
          { onSuccess: () => toast.success("Turno criado"), onError: (e) => toast.error(errMsg(e)) },
        );
      } else if (
        prev.label !== t.label ||
        (prev.service ? prev.service : "") !== (t.service ?? "") ||
        prev.startTime !== t.startTime ||
        prev.active !== t.active ||
        JSON.stringify(prev.weekdays) !== JSON.stringify(t.weekdays)
      ) {
        updateTurn.mutate(
          { id: t.id, patch: { label: t.label, service, start_time: t.startTime, weekdays, active: t.active } },
          { onSuccess: () => toast.success("Turno guardado"), onError: (e) => toast.error(errMsg(e)) },
        );
      }
    }
    for (const prev of turns) {
      if (!nextById.has(prev.id)) {
        deleteTurn.mutate(prev.id, {
          onSuccess: () => toast.success("Turno removido"),
          onError: (e) => toast.error(errMsg(e)),
        });
      }
    }
  }

  return (
    <div className="container max-w-2xl py-8">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">Definições</h1>
        <p className="text-sm text-muted-foreground">
          Mesas, turnos, catálogo da despensa, margem alvo e tom da casa. A ementa
          e o QR do menu vivem na página{" "}
          <Link to="/ementa" className="underline">
            Ementa
          </Link>
          .
        </p>
      </header>

      {error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar as definições.</p>
            <button
              className={buttonVariants({ variant: "outline", size: "sm" })}
              onClick={() => {
                tablesQuery.refetch();
                turnsQuery.refetch();
              }}
            >
              Tentar novamente
            </button>
          </CardContent>
        </Card>
      )}

      {!error && loading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!error && !loading && (
        <div className="space-y-6">
          {/* Identidade primeiro: é o que o dono procura mais vezes (logo, tom,
              tema) e estava enterrada debaixo do catálogo da despensa — David
              não a encontrou no tour de 29-07. */}
          <Card>
            <CardHeader>
              <CardTitle>Identidade da casa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {restaurant && (
                <>
                  <LogoField key={`logo-${restaurant.id}`} restaurant={restaurant} />
                  <ToneField
                    key={`tone-${restaurant.id}`}
                    current={restaurant.tone === "formal" ? "formal" : "proximo"}
                    restaurantId={restaurant.id}
                  />
                  <ThemeField key={`theme-${restaurant.id}`} restaurant={restaurant} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Esquema de mesas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tables.length === 0 && (
                <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                  Ainda não tens mesas. Adiciona a primeira.
                </p>
              )}
              <TableManager tables={tables} onChange={onTablesChange} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Turnos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {turns.length === 0 && (
                <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
                  Ainda não tens turnos. Adiciona o primeiro.
                </p>
              )}
              <TurnManager turns={turns} onChange={onTurnsChange} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Despensa</CardTitle>
            </CardHeader>
            <CardContent>
              {restaurantId && <PantryManager restaurantId={restaurantId} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Margem alvo</CardTitle>
            </CardHeader>
            <CardContent>
              {restaurant && <TargetMarginField key={restaurant.id} current={restaurant.target_margin_pct ?? 65} restaurantId={restaurant.id} />}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Não foi possível guardar. Tenta novamente.";
}

// Margem alvo (%): abaixo disto, o prato conta como alerta em /margens e no
// dashboard. Guardar explícito no blur, com clamp 0-95 (CHECK do schema).
function TargetMarginField({ current, restaurantId }: { current: number; restaurantId: string }) {
  const [value, setValue] = React.useState(String(current));
  const update = useUpdateRestaurant();

  function save() {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n < 0 || n > 95) {
      toast.error("A margem alvo tem de estar entre 0 e 95%.");
      setValue(String(current));
      return;
    }
    if (n === current) return;
    update.mutate(
      { id: restaurantId, patch: { target_margin_pct: n } },
      {
        onSuccess: () => toast.success(`Margem alvo guardada: ${n}%`),
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Margem alvo em percentagem"
          inputMode="numeric"
          className="w-20 text-right"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Pratos com margem abaixo deste valor aparecem como alerta em Margens.
      </p>
    </div>
  );
}

// Tom da casa (0015): decide a voz das mensagens ao cliente (confirmação de
// reserva, e o que vier). As frases de exemplo são as reais da edge
// send-reservation-message, para o dono ouvir exactamente o que vai sair.
const TONE_OPTIONS: { value: "proximo" | "formal"; label: string; example: string }[] = [
  {
    value: "proximo",
    label: "Próximo",
    example: "“A casa agradece — a sua mesa está guardada. Até já!”",
  },
  {
    value: "formal",
    label: "Formal",
    example: "“A sua reserva está confirmada. Com os melhores cumprimentos.”",
  },
];

// Logo da casa (0019): bucket restaurant-logos, path {restaurant_id}/logo.ext,
// leitura pública + escrita por membros (policies na migração). Sem logo, o
// CasaLogo cai no monograma — nada fica vazio.
function LogoField({ restaurant }: { restaurant: Restaurant }) {
  const update = useUpdateRestaurant();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const kinds: Record<string, string> = {
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/jpeg": "jpg",
    };
    const ext = kinds[file.type];
    if (!ext) {
      toast.error("Usa PNG, SVG ou JPG.");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("O logo tem de ter no máximo 1 MB.");
      return;
    }
    if (file.type !== "image/svg+xml") {
      const bigEnough = await new Promise<boolean>((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img.width >= 128 && img.height >= 128);
        };
        img.onerror = () => resolve(false);
        img.src = url;
      });
      if (!bigEnough) {
        toast.error("Imagem demasiado pequena — mínimo 128px de lado.");
        return;
      }
    }
    setBusy(true);
    const path = `${restaurant.id}/logo.${ext}`;
    const { error } = await supabase.storage
      .from("restaurant-logos")
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (error) {
      toast.error(error.message || "Não foi possível carregar o logo.");
      setBusy(false);
      return;
    }
    const { data } = supabase.storage.from("restaurant-logos").getPublicUrl(path);
    // cache-bust: substituir o ficheiro mantém o URL; o ?v= força refrescar.
    const url = `${data.publicUrl}?v=${Date.now()}`;
    update.mutate(
      { id: restaurant.id, patch: { logo_url: url } },
      {
        onSuccess: () => toast.success("Logo da casa guardado"),
        onError: (e) => toast.error(errMsg(e)),
        onSettled: () => setBusy(false),
      },
    );
  }

  function removeLogo() {
    update.mutate(
      { id: restaurant.id, patch: { logo_url: null } },
      {
        onSuccess: () => toast.success("Logo removido — fica o monograma"),
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Logo</p>
      <div className="flex flex-wrap items-center gap-4">
        <CasaLogo name={restaurant.name} logoUrl={restaurant.logo_url} size={56} />
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? "A carregar…" : restaurant.logo_url ? "Substituir logo" : "Carregar logo"}
            </Button>
            {restaurant.logo_url && (
              <Button size="sm" variant="ghost" disabled={busy || update.isPending} onClick={removeLogo}>
                Remover
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, SVG ou JPG até 1 MB, mínimo 128px. Aparece no menu, nas
            reservas, nas fichas e aqui no backoffice.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// Tema das superfícies públicas (0019): 6 conjuntos curados (lib/themes.ts).
// O backoffice não muda com o tema — é identidade nostos.
function ThemeField({ restaurant }: { restaurant: Restaurant }) {
  const update = useUpdateRestaurant();
  const current = isThemeSlug(restaurant.theme) ? restaurant.theme : "costeiro";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Tema do menu e das reservas</p>
        {restaurant.slug && (
          <a
            href={`/m/${restaurant.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline"
          >
            ver o meu menu
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Muda só o que o cliente vê (menu, reserva e email). Contraste verificado
        em todos.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {THEME_SLUGS.map((slug) => {
          const t = THEMES[slug];
          const active = current === slug;
          return (
            <button
              key={slug}
              type="button"
              disabled={update.isPending}
              aria-pressed={active}
              onClick={() => {
                if (slug === current) return;
                update.mutate(
                  { id: restaurant.id, patch: { theme: slug } },
                  {
                    onSuccess: () => toast.success(`Tema guardado: ${t.label}`),
                    onError: (e) => toast.error(errMsg(e)),
                  },
                );
              }}
              className={
                "overflow-hidden rounded-md border text-left transition-shadow " +
                (active
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-input hover:shadow-warm")
              }
            >
              {/* Miniatura: hero + linha de item + preço, nas cores reais. */}
              <span className="block" style={{ background: t.preview.bg }}>
                <span
                  className="block px-2 py-1.5 text-[10px] font-semibold"
                  style={{ background: t.preview.hero, color: t.preview.bg }}
                >
                  {restaurant.name.split(" ")[0]}
                </span>
                <span className="flex items-center justify-between px-2 py-2">
                  <span className="text-[10px]" style={{ color: t.preview.ink }}>
                    Prato do dia
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: t.preview.accent }}>
                    12,50 €
                  </span>
                </span>
              </span>
              <span className="block border-t border-input bg-card px-2 py-1.5">
                <span className="block text-xs font-medium">{t.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToneField({
  current,
  restaurantId,
}: {
  current: "proximo" | "formal";
  restaurantId: string;
}) {
  const update = useUpdateRestaurant();

  function choose(tone: "proximo" | "formal") {
    if (tone === current) return;
    update.mutate(
      { id: restaurantId, patch: { tone } },
      {
        onSuccess: () =>
          toast.success(`Tom guardado: ${tone === "proximo" ? "próximo" : "formal"}`),
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Como a casa fala com os clientes nas mensagens (confirmações de reserva).
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {TONE_OPTIONS.map((opt) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={update.isPending}
              onClick={() => choose(opt.value)}
              aria-pressed={active}
              className={
                "rounded-md border p-3 text-left transition-colors " +
                (active
                  ? "border-primary bg-primary/5"
                  : "border-input hover:bg-muted/50")
              }
            >
              <p className="text-sm font-medium">
                {opt.label}
                {active && <span className="ml-2 text-xs font-normal text-primary">em uso</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{opt.example}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
