import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useHaccpNonconformity, useVerifyNonconformity } from "@/hooks/use-haccp-nc";
import { supabase } from "@/integrations/supabase/client";

// Detalhe da NC (item 5, C1) + verificação de eficácia. A verificação tem de
// ser feita por alguém diferente do autor (contrato: haccp_verificacao_mesmo_
// utilizador). Depois de verificada, fica só de leitura.

function dt(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="py-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export default function HaccpNcDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const ncQuery = useHaccpNonconformity(id);
  const verify = useVerifyNonconformity(restaurantId);

  // Quem verificou (verified_by não está na vista): lê a verificação directa.
  const verificationQuery = useQuery({
    queryKey: ["haccp", "nc-verification", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("haccp_nc_verifications")
        .select("verified_by, verified_at, effective, note")
        .eq("nonconformity_id", id as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const [effective, setEffective] = React.useState<"sim" | "nao" | "">("");
  const [note, setNote] = React.useState("");

  const nc = ncQuery.data;
  const isAuthor = !!nc && !!user && nc.recorded_by === user.id;
  const isVerified = nc?.nc_status === "verificada";

  function submitVerification() {
    if (!id || effective === "") {
      toast.error("Indique se a acção foi eficaz.");
      return;
    }
    verify.mutate(
      { nonconformityId: id, effective: effective === "sim", note: note.trim() || null },
      {
        onSuccess: () => {
          toast.success("Verificação registada.");
          verificationQuery.refetch();
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : "Não foi possível verificar.";
          toast.error(
            msg.includes("haccp_verificacao_mesmo_utilizador")
              ? "A verificação tem de ser feita por outra pessoa."
              : msg,
          );
        },
      },
    );
  }

  if (ncQuery.isLoading) {
    return (
      <div className="container max-w-2xl py-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!nc) {
    return (
      <div className="container max-w-2xl py-6">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Não conformidade não encontrada.
          </CardContent>
        </Card>
      </div>
    );
  }

  const verification = verificationQuery.data;

  return (
    <div className="container max-w-2xl py-6">
      <header className="mb-4 flex items-center gap-2">
        <Link to="/haccp/nc" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Voltar">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-atlantico-900">
          Não conformidade
        </h1>
      </header>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <dl className="divide-y divide-border">
            <Row label="O que aconteceu" value={nc.description} />
            <Row
              label="Origem"
              value={
                nc.source === "temperature"
                  ? nc.turn_id
                    ? <Link to={`/haccp/registar/${nc.turn_id}`} className="underline">registo de temperatura</Link>
                    : "registo de temperatura"
                  : nc.source === "reception"
                    ? <Link to="/haccp/recepcao" className="underline">recepção de mercadoria</Link>
                    : "registo manual"
              }
            />
            <Row
              label="Valor medido / limite"
              value={
                nc.measured_value || nc.limit_text
                  ? `${nc.measured_value ?? "sem valor"} (limite ${nc.limit_text ?? "não definido"})`
                  : null
              }
            />
            <Row label="Destino do produto" value={nc.product_disposition} />
            <Row label="Acção imediata" value={nc.immediate_action} />
            <Row label="Acção sobre a causa" value={nc.root_cause_action} />
            <Row label="Quem executou" value={nc.executed_by_name} />
            <Row label="Registada" value={dt(nc.recorded_at)} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verificação de eficácia</CardTitle>
        </CardHeader>
        <CardContent>
          {isVerified || verification ? (
            <div className="space-y-1 text-sm">
              <p>
                Resultado:{" "}
                <span className="font-medium">
                  {verification?.effective ?? nc.effective ? "eficaz" : "não eficaz"}
                </span>
              </p>
              <p className="text-muted-foreground">
                Verificada {dt(verification?.verified_at ?? nc.verified_at)}
                {verification &&
                  (verification.verified_by === user?.id
                    ? " · por si"
                    : " · por outro membro")}
              </p>
              {verification?.note && <p className="text-muted-foreground">Nota: {verification.note}</p>}
            </div>
          ) : isAuthor ? (
            <p className="rounded-md border border-input bg-muted/30 p-3 text-sm text-muted-foreground">
              A verificação tem de ser feita por outra pessoa.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(["sim", "nao"] as const).map((v) => {
                  const active = effective === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEffective(v)}
                      aria-pressed={active}
                      className={
                        "min-h-11 flex-1 rounded-md border px-4 text-sm transition-colors " +
                        (active
                          ? "border-terracota-600 bg-terracota-600 font-medium text-areia-50"
                          : "border-input bg-card hover:bg-muted")
                      }
                    >
                      {v === "sim" ? "Foi eficaz" : "Não foi eficaz"}
                    </button>
                  );
                })}
              </div>
              <Textarea
                aria-label="Nota da verificação"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (opcional)."
              />
              <Button onClick={submitVerification} disabled={verify.isPending}>
                {verify.isPending ? "A registar…" : "Registar verificação"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
