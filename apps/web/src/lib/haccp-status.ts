// Semântica de estado por célula (dia, turno, ponto) — contrato HACCP §5.
// Puro: só rótulos e "tom" de cor (mapeado depois para tokens Costeiro). Nada
// de React aqui, para poder testar e reutilizar no hub, na lista e no dossiê.

export type HaccpCellStatus =
  | "futuro"
  | "por_verificar"
  | "conforme"
  | "desvio_sem_resposta"
  | "desvio_aberto"
  | "desvio_resolvido"
  | "em_falta";

// Tom semântico Costeiro: cinza (neutro), âmbar (a fazer), alga (ok), coral
// (problema). A tradução para classes Tailwind vive na UI (haccp chip),
// aqui fica a intenção.
export type HaccpTone = "cinza" | "ambar" | "alga" | "coral";

interface StatusMeta {
  label: string;
  tone: HaccpTone;
}

export const HACCP_STATUS_META: Record<HaccpCellStatus, StatusMeta> = {
  futuro: { label: "por abrir", tone: "cinza" },
  por_verificar: { label: "por verificar", tone: "ambar" },
  conforme: { label: "conforme", tone: "alga" },
  desvio_sem_resposta: { label: "desvio sem resposta", tone: "coral" },
  desvio_aberto: { label: "acção registada, por verificar", tone: "coral" },
  desvio_resolvido: { label: "desvio resolvido", tone: "alga" },
  em_falta: { label: "em falta (não recuperável)", tone: "coral" },
};

// Defensivo: o servidor é a fonte de verdade, mas se vier um status desconhecido
// mostramos-o cru em cinza em vez de rebentar.
export function statusMeta(status: string): StatusMeta {
  return (
    HACCP_STATUS_META[status as HaccpCellStatus] ?? { label: status, tone: "cinza" }
  );
}

// Classes de chip por tom (tokens Costeiro; zero cores hardcoded).
export const HACCP_TONE_CLASS: Record<HaccpTone, string> = {
  cinza: "bg-muted text-muted-foreground",
  ambar: "bg-ambar-100 text-ambar-600",
  alga: "bg-alga-100 text-alga-600",
  coral: "bg-coral-100 text-coral-600",
};

// Só estes estados permitem/pedem registo activo (janela aberta). O botão
// "Registar temperaturas" do hub aparece quando há pelo menos um por_verificar.
export function isOpenForRecording(status: string): boolean {
  return status === "por_verificar";
}
