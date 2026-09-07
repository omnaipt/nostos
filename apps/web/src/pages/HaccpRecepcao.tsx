import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { HaccpLayout } from "@/components/haccp/HaccpLayout";
import {
  NonconformityForm,
  type NonconformityFormValues,
} from "@/components/haccp/NonconformityForm";
import { useActiveRestaurant } from "@/hooks/use-active-restaurant";
import { useHaccpServiceDate } from "@/hooks/use-haccp-status";
import { useCreateNonconformity } from "@/hooks/use-haccp-nc";
import {
  useSuppliers,
  useCreateSupplier,
  useHaccpReceptions,
  useCreateReception,
  useCreateRejection,
  type ReceptionRow,
} from "@/hooks/use-haccp-receptions";
import { supabase } from "@/integrations/supabase/client";
import { fitDimensions, photoPath, PHOTO_JPEG_QUALITY } from "@/lib/haccp-photo";
import { shiftIsoDate, todayServiceDate } from "@/lib/service-date";
import {
  HACCP_REJECTION_CAUSE_LABEL,
  type HaccpRejectionCause,
} from "@/lib/types";

// Recepção de matérias-primas e recusa (item 6, B1/B2). Formulário rápido +
// fotografia comprimida no cliente. Não conforme abre logo a recusa e a NC.

async function resizeToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("imagem inválida"));
      el.src = url;
    });
    const { width, height } = fitDimensions(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("compressão falhou"))),
        "image/jpeg",
        PHOTO_JPEG_QUALITY,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isQuotaError(err: { message?: string; statusCode?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    err.statusCode === "403" ||
    m.includes("policy") ||
    m.includes("row-level security") ||
    m.includes("quota")
  );
}

export default function HaccpRecepcao() {
  const { data: restaurant } = useActiveRestaurant();
  const restaurantId = restaurant?.id;
  const quotaMb = restaurant?.haccp_photo_quota_mb ?? 500;
  const suppliersQuery = useSuppliers(restaurantId);
  const serviceDateQuery = useHaccpServiceDate(restaurantId);
  const receptionsQuery = useHaccpReceptions(restaurantId);
  const createSupplier = useCreateSupplier(restaurantId);
  const createReception = useCreateReception(restaurantId);
  const createRejection = useCreateRejection(restaurantId);

  const suppliers = (suppliersQuery.data ?? []).filter((s) => s.active);

  // Campos do formulário.
  const [supplierId, setSupplierId] = React.useState("");
  const [newSupplier, setNewSupplier] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newNif, setNewNif] = React.useState("");
  const [deliveredOn, setDeliveredOn] = React.useState(todayServiceDate());
  const [tempApplicable, setTempApplicable] = React.useState(false);
  const [tempValue, setTempValue] = React.useState("");
  const [expiryOk, setExpiryOk] = React.useState(true);
  const [packagingOk, setPackagingOk] = React.useState(true);
  const [conforming, setConforming] = React.useState(true);
  const [note, setNote] = React.useState("");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Passo de recusa (conforming=false).
  const [rejection, setRejection] = React.useState<{ receptionId: string } | null>(null);
  const [cause, setCause] = React.useState<HaccpRejectionCause | "">("");
  const [quantity, setQuantity] = React.useState("");
  const [rejDescription, setRejDescription] = React.useState("");
  const [ncStep, setNcStep] = React.useState<{ receptionId: string } | null>(null);

  const minDate = shiftIsoDate(todayServiceDate(), -7);
  const maxDate = todayServiceDate();

  function resetForm() {
    setSupplierId("");
    setNewSupplier(false);
    setNewName("");
    setNewNif("");
    setDeliveredOn(todayServiceDate());
    setTempApplicable(false);
    setTempValue("");
    setExpiryOk(true);
    setPackagingOk(true);
    setConforming(true);
    setNote("");
    setPhoto(null);
  }

  async function onCreateSupplier() {
    if (newName.trim().length < 2) {
      toast.error("Indique o nome do fornecedor.");
      return;
    }
    try {
      const s = await createSupplier.mutateAsync({ name: newName, nif: newNif || null });
      setSupplierId(s.id);
      setNewSupplier(false);
      setNewName("");
      setNewNif("");
      toast.success("Fornecedor criado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o fornecedor.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId || !serviceDateQuery.data) return;
    if (!supplierId) {
      toast.error("Escolha um fornecedor.");
      return;
    }
    if (tempApplicable && tempValue.trim() === "") {
      toast.error("Indique a temperatura ou desligue “temperatura aplicável”.");
      return;
    }
    setBusy(true);
    try {
      // Fotografia: comprimir e carregar antes de gravar a recepção.
      let uploadedPath: string | null = null;
      if (photo) {
        const blob = await resizeToJpeg(photo);
        const path = photoPath(restaurantId, new Date().getFullYear(), crypto.randomUUID());
        const { error } = await supabase.storage
          .from("haccp-evidence")
          .upload(path, blob, { contentType: "image/jpeg" });
        if (error) {
          if (isQuotaError(error as { message?: string; statusCode?: string })) {
            toast.error(
              `Limite de fotografias do restaurante atingido (${quotaMb} MB). Pode registar sem fotografia ou pedir ao gerente para rever o limite nas Definições.`,
            );
            setBusy(false);
            return;
          }
          throw error;
        }
        uploadedPath = path;
      }

      const reception = await createReception.mutateAsync({
        restaurantId,
        supplierId,
        deliveredOn,
        serviceDate: serviceDateQuery.data,
        temperatureApplicable: tempApplicable,
        temperatureC: tempApplicable ? Number(tempValue.replace(",", ".")) : null,
        expiryOk,
        packagingOk,
        conforming,
        photoPath: uploadedPath,
        note: note.trim() || null,
      });

      if (!conforming) {
        // Abre a recusa de imediato.
        setRejection({ receptionId: reception.id });
      } else {
        toast.success("Recepção registada.");
        resetForm();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registar a recepção.");
    } finally {
      setBusy(false);
    }
  }

  function submitRejection(e: React.FormEvent) {
    e.preventDefault();
    if (!rejection || cause === "") {
      toast.error("Escolha a causa da recusa.");
      return;
    }
    createRejection.mutate(
      {
        receptionId: rejection.receptionId,
        cause,
        quantityText: quantity.trim() || null,
        description: rejDescription.trim() || null,
      },
      {
        onSuccess: () => {
          const receptionId = rejection.receptionId;
          setRejection(null);
          setCause("");
          setQuantity("");
          setRejDescription("");
          setNcStep({ receptionId });
        },
        onError: (er) => toast.error(er instanceof Error ? er.message : "Não foi possível recusar."),
      },
    );
  }

  const createNcHook = useCreateReceptionNc(restaurantId);
  function submitNc(values: NonconformityFormValues) {
    if (!ncStep || !serviceDateQuery.data) return;
    createNcHook.mutate(
      { receptionId: ncStep.receptionId, serviceDate: serviceDateQuery.data, values },
      {
        onSuccess: () => {
          toast.success("Não conformidade registada.");
          setNcStep(null);
          resetForm();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível registar."),
      },
    );
  }

  return (
    <HaccpLayout>
      <h1 className="mb-4 font-display text-2xl font-semibold text-atlantico-900">
        Recepção de mercadoria
      </h1>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field id="rec-supplier" label="Fornecedor" required>
              {(p) => (
                <div className="space-y-2">
                  <Select
                    {...p}
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    disabled={newSupplier}
                  >
                    <option value="">Escolher…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  {!newSupplier ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => setNewSupplier(true)}
                    >
                      criar novo fornecedor
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
                      <Input
                        placeholder="Nome do fornecedor"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                      <Input
                        placeholder="NIF (opcional)"
                        inputMode="numeric"
                        value={newNif}
                        onChange={(e) => setNewNif(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={onCreateSupplier}
                          disabled={createSupplier.isPending}
                        >
                          Criar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setNewSupplier(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Field>

            <Field id="rec-date" label="Data de entrega" required>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={deliveredOn}
                  onChange={(e) => setDeliveredOn(e.target.value)}
                />
              )}
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={tempApplicable}
                onChange={(e) => setTempApplicable(e.target.checked)}
              />
              Temperatura aplicável
            </label>
            {tempApplicable && (
              <Field id="rec-temp" label="Temperatura (°C)">
                {(p) => (
                  <Input
                    {...p}
                    inputMode="decimal"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    placeholder="Ex.: 3,5"
                  />
                )}
              </Field>
            )}

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={expiryOk}
                  onChange={(e) => setExpiryOk(e.target.checked)}
                />
                Validade OK
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={packagingOk}
                  onChange={(e) => setPackagingOk(e.target.checked)}
                />
                Embalagem OK
              </label>
            </div>

            <Field id="rec-conforming" label="Conforme?">
              {() => (
                <div className="flex gap-2">
                  {[true, false].map((v) => {
                    const active = conforming === v;
                    return (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setConforming(v)}
                        aria-pressed={active}
                        className={
                          "min-h-11 flex-1 rounded-md border px-4 text-sm transition-colors " +
                          (active
                            ? v
                              ? "border-alga-600 bg-alga-100 font-medium text-alga-600"
                              : "border-coral-600 bg-coral-100 font-medium text-coral-600"
                            : "border-input bg-card hover:bg-muted")
                        }
                      >
                        {v ? "Conforme" : "Não conforme"}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>

            <Field id="rec-note" label="Nota">
              {(p) => (
                <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </Field>

            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Camera className="h-4 w-4" /> {photo ? "Trocar fotografia" : "Fotografia (opcional)"}
              </Button>
              {photo && <span className="ml-2 text-xs text-muted-foreground">{photo.name}</span>}
            </div>

            <Button type="submit" disabled={busy || createReception.isPending}>
              {busy ? "A registar…" : "Registar recepção"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Recepções (últimos 14 dias)
      </h2>
      {receptionsQuery.isLoading && <Skeleton className="h-16 w-full" />}
      {receptionsQuery.data && receptionsQuery.data.length === 0 && (
        <p className="rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          Ainda sem recepções registadas.
        </p>
      )}
      <div className="space-y-2">
        {(receptionsQuery.data ?? []).map((r) => (
          <ReceptionItem key={r.id} row={r} />
        ))}
      </div>

      {/* Passo de recusa */}
      {rejection && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-card">
          <div className="container max-w-2xl py-6">
            <h2 className="mb-4 font-display text-xl font-semibold text-atlantico-900">Recusa</h2>
            <form onSubmit={submitRejection} className="space-y-4" noValidate>
              <Field id="rej-cause" label="Causa da recusa" required>
                {(p) => (
                  <Select
                    {...p}
                    value={cause}
                    onChange={(e) => setCause(e.target.value as HaccpRejectionCause)}
                  >
                    <option value="">Escolher…</option>
                    {(Object.keys(HACCP_REJECTION_CAUSE_LABEL) as HaccpRejectionCause[]).map((c) => (
                      <option key={c} value={c}>
                        {HACCP_REJECTION_CAUSE_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="rej-qty" label="Quantidade">
                {(p) => (
                  <Input {...p} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                )}
              </Field>
              <Field id="rej-desc" label="Descrição">
                {(p) => (
                  <Textarea
                    {...p}
                    value={rejDescription}
                    onChange={(e) => setRejDescription(e.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" disabled={createRejection.isPending}>
                {createRejection.isPending ? "A registar…" : "Registar recusa"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Passo da NC da recepção */}
      {ncStep && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-card">
          <div className="container max-w-2xl py-6">
            <h2 className="mb-4 font-display text-xl font-semibold text-atlantico-900">
              Não conformidade da recepção
            </h2>
            <NonconformityForm
              submitting={createNcHook.isPending}
              onSubmit={submitNc}
              secondary={{
                label: "Registar acção mais tarde",
                onClick: () => {
                  setNcStep(null);
                  resetForm();
                },
              }}
            />
          </div>
        </div>
      )}
    </HaccpLayout>
  );
}

function ReceptionItem({ row }: { row: ReceptionRow }) {
  const thumb = useQuery({
    queryKey: ["haccp", "photo", row.photo_path],
    queryFn: async (): Promise<string | null> => {
      if (!row.photo_path) return null;
      const { data, error } = await supabase.storage
        .from("haccp-evidence")
        .createSignedUrl(row.photo_path, 3600);
      if (error) return null;
      return data.signedUrl;
    },
    enabled: !!row.photo_path,
    staleTime: 50 * 60 * 1000,
  });

  return (
    <div className="flex items-center gap-3 rounded-md border border-input bg-card p-3">
      {row.photo_path && (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
          {thumb.data && (
            <img src={thumb.data} alt="Evidência" className="h-full w-full object-cover" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.supplier_name ?? "Fornecedor"}</p>
        <p className="text-xs text-muted-foreground">
          Entrega {row.delivered_on} ·{" "}
          {row.conforming ? (
            "conforme"
          ) : (
            <span className="font-medium text-coral-600">recusada</span>
          )}
          {" · "}
          {new Intl.DateTimeFormat("pt-PT", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(row.recorded_at))}
        </p>
      </div>
    </div>
  );
}

// NC da recepção: pequeno wrapper que mapeia os valores do formulário para o
// contrato (source='reception').
function useCreateReceptionNc(restaurantId: string | undefined) {
  const create = useCreateNonconformity(restaurantId);
  return {
    isPending: create.isPending,
    mutate: (
      input: { receptionId: string; serviceDate: string; values: NonconformityFormValues },
      opts: { onSuccess: () => void; onError: (e: unknown) => void },
    ) =>
      create.mutate(
        {
          restaurantId: restaurantId as string,
          source: "reception",
          receptionId: input.receptionId,
          serviceDate: input.serviceDate,
          ...input.values,
        },
        opts,
      ),
  };
}
