import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { useUpdateRestaurant } from "@/hooks/use-active-restaurant";
import { useHaccpStorageUsage, usePurgeExpired, type PurgeResult } from "@/hooks/use-haccp-admin";
import type { Restaurant } from "@/lib/types";

// Cartão HACCP das Definições (item 8). Retenção, quota de fotografias com barra
// de uso, purga (owner). Texto fixo NG7 sempre visível (copy exacta da spec).

// Copy exacta (NG7). NÃO alterar.
const NG7 =
  "O Nostos regista e guarda prova. Não substitui o plano HACCP nem a análise de perigos, que continuam a ser responsabilidade do estabelecimento.";

const MB = 1024 * 1024;

export function HaccpCard({ restaurant, isOwner }: { restaurant: Restaurant; isOwner: boolean }) {
  const update = useUpdateRestaurant();
  const usageQuery = useHaccpStorageUsage(restaurant.id);
  const purge = usePurgeExpired(restaurant.id);

  const [months, setMonths] = React.useState(String(restaurant.haccp_retention_months ?? 24));
  const [note, setNote] = React.useState(restaurant.haccp_retention_note ?? "");
  const [quota, setQuota] = React.useState(String(restaurant.haccp_photo_quota_mb ?? 500));
  const [confirming, setConfirming] = React.useState(false);
  const [purgeResult, setPurgeResult] = React.useState<PurgeResult | null>(null);

  const usageBytes = usageQuery.data ?? 0;
  const quotaMb = restaurant.haccp_photo_quota_mb ?? 500;
  const usedMb = usageBytes / MB;
  const pct = Math.min(100, Math.round((usedMb / quotaMb) * 100));

  function saveRetention() {
    const m = Math.trunc(Number(months));
    if (!Number.isFinite(m) || m < 12 || m > 120) {
      toast.error("A retenção tem de estar entre 12 e 120 meses.");
      setMonths(String(restaurant.haccp_retention_months ?? 24));
      return;
    }
    update.mutate(
      { id: restaurant.id, patch: { haccp_retention_months: m, haccp_retention_note: note.trim() } },
      {
        onSuccess: () => toast.success("Retenção guardada."),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível guardar."),
      },
    );
  }

  function saveQuota() {
    const q = Math.trunc(Number(quota));
    if (!Number.isFinite(q) || q < 50 || q > 5000) {
      toast.error("A quota tem de estar entre 50 e 5000 MB.");
      setQuota(String(restaurant.haccp_photo_quota_mb ?? 500));
      return;
    }
    update.mutate(
      { id: restaurant.id, patch: { haccp_photo_quota_mb: q } },
      {
        onSuccess: () => toast.success("Quota guardada."),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível guardar."),
      },
    );
  }

  function runPurge() {
    purge.mutate(undefined, {
      onSuccess: (res) => {
        setPurgeResult(res);
        setConfirming(false);
        toast.success("Registos fora da retenção apagados.");
      },
      onError: (e) => {
        setConfirming(false);
        toast.error(e instanceof Error ? e.message : "Não foi possível purgar.");
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HACCP</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="rounded-md border border-input bg-muted/30 p-3 text-sm text-muted-foreground">
          {NG7}
        </p>

        <div className="space-y-3">
          <Field
            id="haccp-months"
            label="Meses de retenção (12 a 120)"
            hint="Base da purga de registos antigos."
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                className="w-24"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
              />
            )}
          </Field>
          <Field id="haccp-note" label="Justificação da retenção">
            {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button size="sm" variant="outline" onClick={saveRetention} disabled={update.isPending}>
            Guardar retenção
          </Button>
        </div>

        <div className="space-y-2">
          <Field id="haccp-quota" label="Quota de fotografias (MB)">
            {(p) => (
              <div className="flex items-center gap-2">
                <Input
                  {...p}
                  inputMode="numeric"
                  className="w-24"
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                />
                <Button size="sm" variant="outline" onClick={saveQuota} disabled={update.isPending}>
                  Guardar
                </Button>
              </div>
            )}
          </Field>
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-atlantico-700"
                style={{ width: `${pct}%` }}
                aria-hidden="true"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {usedMb.toFixed(1)} MB de {quotaMb} MB usados ({pct}%)
            </p>
          </div>
        </div>

        {isOwner && (
          <div className="space-y-2 rounded-md border border-coral-600/30 p-3">
            <p className="text-sm font-medium">Purgar registos fora da retenção</p>
            {!confirming ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-coral-600"
                onClick={() => setConfirming(true)}
              >
                Purgar registos fora da retenção
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-coral-600">
                  Isto apaga definitivamente os registos com mais de {months} meses. Não há volta.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-coral-600 text-areia-50 hover:bg-coral-600/90"
                    onClick={runPurge}
                    disabled={purge.isPending}
                  >
                    {purge.isPending ? "A purgar…" : "Confirmar purga"}
                  </Button>
                </div>
              </div>
            )}
            {purgeResult && (
              <p className="text-xs text-muted-foreground">
                Apagados: {purgeResult.readings} registos, {purgeResult.nonconformities} NC,{" "}
                {purgeResult.verifications} verificações, {purgeResult.receptions} recepções,{" "}
                {purgeResult.rejections} recusas, {purgeResult.photos} fotografias.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
