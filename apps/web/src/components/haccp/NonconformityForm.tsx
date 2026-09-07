import * as React from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { HACCP_DISPOSITION_OPTIONS } from "@/lib/types";

// Formulário de não conformidade (item 5, C1). Usado no modal do registo de
// temperatura, na recusa da recepção e em /haccp/nc ("registar manualmente").
// Validação zod com as restrições do contrato (§2 haccp_nonconformities).

export interface NonconformityFormValues {
  description: string;
  measuredValue: string | null;
  limitText: string | null;
  productDisposition: string;
  immediateAction: string;
  rootCauseAction: string;
  executedByName: string;
}

const ncSchema = z.object({
  description: z
    .string()
    .trim()
    .min(3, "Descreva o que aconteceu (mínimo 3 caracteres).")
    .max(2000),
  measuredValue: z.string().trim().max(200).nullable(),
  limitText: z.string().trim().max(200).nullable(),
  productDisposition: z.string().trim().min(2, "Indique o destino do produto."),
  immediateAction: z.string().trim().min(2, "Indique a acção imediata."),
  rootCauseAction: z.string().trim().min(2, "Indique a acção sobre a causa."),
  executedByName: z.string().trim().min(2, "Indique quem executou."),
});

const OUTRO = "__outro__";

export function NonconformityForm({
  defaults,
  submitting = false,
  submitLabel = "Registar não conformidade",
  onSubmit,
  secondary,
}: {
  defaults?: Partial<NonconformityFormValues>;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: NonconformityFormValues) => void;
  secondary?: { label: string; onClick: () => void };
}) {
  const [description, setDescription] = React.useState(defaults?.description ?? "");
  const [measuredValue, setMeasuredValue] = React.useState(defaults?.measuredValue ?? "");
  const [limitText, setLimitText] = React.useState(defaults?.limitText ?? "");
  // Destino: um dos tipificados, ou "Outro" com texto livre.
  const initialDisp = defaults?.productDisposition ?? "";
  const initialIsKnown = HACCP_DISPOSITION_OPTIONS.includes(initialDisp);
  const [disposition, setDisposition] = React.useState(
    initialDisp === "" ? "" : initialIsKnown ? initialDisp : OUTRO,
  );
  const [dispositionOther, setDispositionOther] = React.useState(
    initialIsKnown ? "" : initialDisp,
  );
  const [immediateAction, setImmediateAction] = React.useState(defaults?.immediateAction ?? "");
  const [rootCauseAction, setRootCauseAction] = React.useState(defaults?.rootCauseAction ?? "");
  const [executedByName, setExecutedByName] = React.useState(defaults?.executedByName ?? "");
  const [errors, setErrors] = React.useState<Partial<Record<keyof NonconformityFormValues, string>>>(
    {},
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const productDisposition = disposition === OUTRO ? dispositionOther.trim() : disposition;
    const candidate: NonconformityFormValues = {
      description,
      measuredValue: measuredValue.trim() || null,
      limitText: limitText.trim() || null,
      productDisposition,
      immediateAction,
      rootCauseAction,
      executedByName,
    };
    const parsed = ncSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Partial<Record<keyof NonconformityFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof NonconformityFormValues;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field id="nc-desc" label="O que aconteceu" required error={errors.description}>
        {(p) => (
          <Textarea
            {...p}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: frigorífico 1 a 8 °C na abertura do turno."
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nc-measured" label="Valor medido">
          {(p) => (
            <Input
              {...p}
              value={measuredValue}
              onChange={(e) => setMeasuredValue(e.target.value)}
              placeholder="7,0 °C"
            />
          )}
        </Field>
        <Field id="nc-limit" label="Limite">
          {(p) => (
            <Input
              {...p}
              value={limitText}
              onChange={(e) => setLimitText(e.target.value)}
              placeholder="0 a 5 °C"
            />
          )}
        </Field>
      </div>

      <Field id="nc-disp" label="Destino do produto" required error={errors.productDisposition}>
        {(p) => (
          <Select
            {...p}
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
          >
            <option value="">Escolher…</option>
            {HACCP_DISPOSITION_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value={OUTRO}>Outro</option>
          </Select>
        )}
      </Field>
      {disposition === OUTRO && (
        <Input
          aria-label="Outro destino do produto"
          value={dispositionOther}
          onChange={(e) => setDispositionOther(e.target.value)}
          placeholder="Descreva o destino"
        />
      )}

      <Field id="nc-immediate" label="Acção imediata" required error={errors.immediateAction}>
        {(p) => (
          <Textarea
            {...p}
            value={immediateAction}
            onChange={(e) => setImmediateAction(e.target.value)}
            placeholder="O que se fez de imediato ao produto/equipamento."
          />
        )}
      </Field>

      <Field id="nc-root" label="Acção sobre a causa" required error={errors.rootCauseAction}>
        {(p) => (
          <Textarea
            {...p}
            value={rootCauseAction}
            onChange={(e) => setRootCauseAction(e.target.value)}
            placeholder="O que evita que volte a acontecer."
          />
        )}
      </Field>

      <Field id="nc-executed" label="Quem executou" required error={errors.executedByName}>
        {(p) => (
          <Input
            {...p}
            value={executedByName}
            onChange={(e) => setExecutedByName(e.target.value)}
          />
        )}
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "A registar…" : submitLabel}
        </Button>
        {secondary && (
          <Button type="button" variant="ghost" onClick={secondary.onClick} disabled={submitting}>
            {secondary.label}
          </Button>
        )}
      </div>
    </form>
  );
}
