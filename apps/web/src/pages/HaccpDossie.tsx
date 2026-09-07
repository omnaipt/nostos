import * as React from "react";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { HaccpLayout } from "@/components/haccp/HaccpLayout";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useHaccpServiceDate } from "@/hooks/use-haccp-status";
import { shiftIsoDate } from "@/lib/service-date";

// Dossiê para inspecção (item 1, E1). Selector de intervalo com presets e
// personalizado (máximo 92 dias, mesma regra do contrato). "Gerar dossiê" abre
// a página de impressão sem chrome (/haccp/dossie/imprimir?from&to).

type Preset = "7d" | "30d" | "mes-anterior" | "personalizado";

function firstOfPrevMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m é 1-based; -2 => primeiro dia do mês anterior
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastOfPrevMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(y, m - 1, 0); // dia 0 do mês actual = último dia do anterior
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export default function HaccpDossie() {
  const navigate = useNavigate();
  const { data: restaurant } = useActiveRestaurant();
  const today = useHaccpServiceDate(restaurant?.id).data;

  const [preset, setPreset] = React.useState<Preset>("30d");
  const [customFrom, setCustomFrom] = React.useState("");
  const [customTo, setCustomTo] = React.useState("");

  const range = React.useMemo<{ from: string; to: string } | null>(() => {
    if (!today) return null;
    switch (preset) {
      case "7d":
        return { from: shiftIsoDate(today, -6), to: today };
      case "30d":
        return { from: shiftIsoDate(today, -29), to: today };
      case "mes-anterior":
        return { from: firstOfPrevMonth(today), to: lastOfPrevMonth(today) };
      case "personalizado":
        return customFrom && customTo ? { from: customFrom, to: customTo } : null;
    }
  }, [preset, today, customFrom, customTo]);

  const error = React.useMemo(() => {
    if (!range) return preset === "personalizado" ? "Escolha as duas datas." : null;
    if (range.from > range.to) return "A data inicial tem de ser anterior à final.";
    if (daysBetween(range.from, range.to) > 92) return "O intervalo não pode exceder 92 dias.";
    return null;
  }, [range, preset]);

  function gerar() {
    if (!range || error) return;
    navigate(`/haccp/dossie/imprimir?from=${range.from}&to=${range.to}`);
  }

  const PRESETS: { key: Preset; label: string }[] = [
    { key: "7d", label: "Últimos 7 dias" },
    { key: "30d", label: "Últimos 30 dias" },
    { key: "mes-anterior", label: "Mês anterior" },
    { key: "personalizado", label: "Personalizado" },
  ];

  return (
    <HaccpLayout>
      <header className="mb-4">
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">
          Dossiê para inspecção
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha o período e gere o dossiê. Guarda-se em PDF pelo diálogo de impressão.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-5 py-5">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = preset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPreset(p.key)}
                  aria-pressed={active}
                  className={
                    "min-h-11 rounded-full border px-4 text-sm transition-colors " +
                    (active
                      ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
                      : "border-input bg-card text-foreground hover:bg-muted")
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {preset === "personalizado" && (
            <div className="grid grid-cols-2 gap-4">
              <Field id="dossie-from" label="De">
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                )}
              </Field>
              <Field id="dossie-to" label="Até">
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                )}
              </Field>
            </div>
          )}

          {range && !error && (
            <p className="text-sm text-muted-foreground">
              Período: {range.from} a {range.to} ({daysBetween(range.from, range.to) + 1} dias).
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-coral-600">
              {error}
            </p>
          )}

          <Button size="lg" className="h-12" onClick={gerar} disabled={!range || !!error}>
            <FileText className="h-5 w-5" /> Gerar dossiê
          </Button>
        </CardContent>
      </Card>
    </HaccpLayout>
  );
}
