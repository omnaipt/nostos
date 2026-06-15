import * as React from "react";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableManager, type TableRow } from "@/components/tables/TableManager";
import { TurnManager, type TurnRow } from "@/components/turns/TurnManager";
import { onboardingSchema } from "@/lib/schemas";
import { runOnboarding } from "@/lib/onboarding";
import { queryKeys } from "@/lib/query-keys";

// C3 — Onboarding do restaurante (modelo novo: mesas + turnos).
// NÃO recolhe capacidade/horário simples. assignment_mode NÃO é exposto
// (o schema cria sempre 'manual'). Bloqueia submit sem ≥1 mesa E ≥1 turno.
// WIRING #4: signUp + insert restaurant (assignment_mode default 'manual',
// timezone gravado) + tables[] + turns[] + restaurant_members (owner) via
// runOnboarding(); depois invalida cache e redirect para /disponibilidade.

type ContactErrors = Partial<Record<"name" | "email" | "phone" | "password", string>>;

export function OnboardingForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [turns, setTurns] = React.useState<TurnRow[]>([]);

  const [contactErrors, setContactErrors] = React.useState<ContactErrors>({});
  const [tablesError, setTablesError] = React.useState<string>();
  const [turnsError, setTurnsError] = React.useState<string>();
  const [globalError, setGlobalError] = React.useState<string>();

  const mutation = useMutation({
    mutationFn: runOnboarding,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.activeRestaurant });
      onCreated();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (/already registered|already been registered|user already/i.test(msg)) {
        setContactErrors((prev) => ({ ...prev, email: "Já existe uma conta com este email." }));
      } else {
        setGlobalError(msg || "Não foi possível criar a conta. Tenta novamente.");
      }
    },
  });
  const submitting = mutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError(undefined);

    const parsed = onboardingSchema.safeParse({
      name,
      email,
      phone,
      password,
      tables: tables.map((t) => ({ label: t.label, seats: t.seats, sortOrder: t.sortOrder, active: t.active })),
      turns: turns.map((t) => ({ label: t.label, startTime: t.startTime, service: t.service, weekdays: t.weekdays, active: t.active })),
    });

    if (!parsed.success) {
      const ce: ContactErrors = {};
      let te: string | undefined;
      let se: string | undefined;
      for (const issue of parsed.error.issues) {
        const root = String(issue.path[0]);
        if (root === "name" || root === "email" || root === "phone" || root === "password") {
          if (!ce[root]) ce[root] = issue.message;
        } else if (root === "tables" && !te) {
          te = issue.message;
        } else if (root === "turns" && !se) {
          se = issue.message;
        }
      }
      setContactErrors(ce);
      setTablesError(te);
      setTurnsError(se);
      return;
    }
    setContactErrors({});
    setTablesError(undefined);
    setTurnsError(undefined);

    mutation.mutate({ ...parsed.data, password });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Dados do restaurante</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field id="ob-name" label="Nome do restaurante" error={contactErrors.name} required>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Taberna do Zé" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ob-email" label="Email de contacto" error={contactErrors.email} hint="Usado como reply-to das confirmações." required>
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contacto@restaurante.pt" />}
            </Field>
            <Field id="ob-phone" label="Telefone" error={contactErrors.phone} required>
              {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="912 345 678" />}
            </Field>
          </div>
          <Field id="ob-password" label="Palavra-passe" error={contactErrors.password} hint="Mínimo 8 caracteres. Usa-a para entrar na STOA." required>
            {(p) => <Input {...p} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Esquema de mesas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tables.length === 0 && (
            <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              Adiciona a tua primeira mesa (etiqueta + nº de lugares).
            </p>
          )}
          <TableManager tables={tables} onChange={setTables} busy={submitting} />
          {tablesError && <p className="text-xs font-medium text-destructive">{tablesError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Turnos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {turns.length === 0 && (
            <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
              Define o teu primeiro turno (nome + hora + dias). O serviço é opcional. O horário de funcionamento deriva dos turnos.
            </p>
          )}
          <TurnManager turns={turns} onChange={setTurns} busy={submitting} />
          {turnsError && <p className="text-xs font-medium text-destructive">{turnsError}</p>}
        </CardContent>
      </Card>

      {globalError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {globalError}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "A criar conta..." : "Criar restaurante"}
      </Button>
    </form>
  );
}
