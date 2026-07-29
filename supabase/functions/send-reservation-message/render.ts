// Composição e render da mensagem de agradecimento da reserva (spec Reserva
// Proximidade §3/§6b/§6c). O conteúdo compõe-se UMA vez; cada canal renderiza
// a mesma substância: email = HTML sóbrio, SMS = texto comprimido, WhatsApp
// reutiliza o SMS até haver templates Meta aprovados.

export type Tone = "proximo" | "formal";

export type HookKind = "daily" | "market" | "by_order";

export interface Hook {
  name: string;
  kind: HookKind;
}

export interface MessageInput {
  restaurantName: string;
  tone: Tone;
  customerName: string;
  partySize: number;
  /** Data legível por extenso (email) — ex.: "quinta-feira, 30 de julho". */
  dateLong: string;
  /** Data curta (SMS) — ex.: "30/07". */
  dateShort: string;
  /** Hora "HH:MM" no fuso do restaurante, se conhecida. */
  timeLabel: string | null;
  /** Notes da reserva, ecoados tal e qual (pedidos especiais). */
  notes: string | null;
  /** Ganchos do menu real, máx. 3-4; vazio = mensagem simples. */
  hooks: Hook[];
  /** Há reply-to da casa configurado (frase "responda..." só nesse caso). */
  hasReply: boolean;
  /** Identidade da casa (0019): logo no topo do email; ausente = sem imagem. */
  logoUrl?: string | null;
  /** Cor de acento do tema do restaurante (hex); default terracota nostos. */
  accentHex?: string;
}

// Acento por tema (0019) — espelho mínimo de lib/themes.ts (a edge não
// importa código da app); tema desconhecido cai no costeiro.
export const THEME_ACCENT: Record<string, string> = {
  costeiro: "#B4502A",
  ardosia: "#C89B3C",
  trattoria: "#B33A2B",
  horta: "#2F5233",
  carvao: "#C4572E",
  editorial: "#2E5E73",
};

// Dois registos chegam no v1; uma escala de 5 seria falsa precisão (§6b).
const COPY: Record<Tone, {
  subject: (rest: string) => string;
  greeting: (name: string) => string;
  thanks: (rest: string) => string;
  notesLabel: string;
  notesSuffix: string;
  hooksIntro: string;
  hookTag: Record<HookKind, string>;
  replyLine: string;
  signoff: (rest: string) => string;
}> = {
  proximo: {
    subject: (rest) => `A sua mesa está guardada · ${rest}`,
    greeting: (name) => `Olá ${name},`,
    thanks: (rest) => `A ${rest} agradece — a sua mesa está guardada.`,
    notesLabel: "Pedidos",
    notesSuffix: "confirmamos consigo.",
    hooksIntro: "Para já ir sonhando — hoje temos:",
    hookTag: {
      daily: "prato do dia, só hoje",
      market: "peixe da lota · preço do dia",
      by_order: "por encomenda — responda a esta mensagem para encomendar",
    },
    replyLine: "Responda a esta mensagem para qualquer pedido.",
    signoff: (rest) => `Até já,\n${rest}`,
  },
  formal: {
    subject: (rest) => `Reserva confirmada · ${rest}`,
    greeting: (name) => `Caro(a) ${name},`,
    thanks: (rest) => `A sua reserva no ${rest} está confirmada.`,
    notesLabel: "Pedidos registados",
    notesSuffix: "serão confirmados pela nossa equipa.",
    hooksIntro: "Sugestões do dia:",
    hookTag: {
      daily: "prato do dia",
      market: "preço de mercado",
      by_order: "por encomenda — responda a esta mensagem para encomendar",
    },
    replyLine: "Para qualquer pedido, responda a esta mensagem.",
    signoff: (rest) => `Com os melhores cumprimentos,\n${rest}`,
  },
};

// Linha do menu tal como sai da RPC public_menu_by_slug (campos relevantes).
export interface MenuRow {
  item_id: string | null;
  item_name: string | null;
  available: boolean | null;
  price_type: string | null;
  by_order?: boolean | null;
  kind?: string | null;
}

// Selecção pura dos ganchos (o fetch vive na edge): pratos do dia só se a
// reserva for para HOJE; preço de mercado e por encomenda valem sempre.
// Máx. 3-4 compactos; zero candidatos = mensagem simples.
export function selectHooks(rows: MenuRow[], isToday: boolean, max = 4): Hook[] {
  const items = rows.filter((r) => r.item_id && r.item_name && r.available !== false);
  const hooks: Hook[] = [];
  const seen = new Set<string>();
  const push = (name: string, kind: HookKind) => {
    if (hooks.length >= max || seen.has(name)) return;
    seen.add(name);
    hooks.push({ name, kind });
  };
  if (isToday) {
    for (const r of items.filter((i) => i.kind === "daily").slice(0, 2)) {
      push(r.item_name as string, "daily");
    }
  }
  for (const r of items.filter((i) => i.price_type === "market").slice(0, 2)) {
    push(r.item_name as string, "market");
  }
  for (const r of items.filter((i) => i.by_order === true)) {
    push(r.item_name as string, "by_order");
  }
  return hooks;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSubject(input: MessageInput): string {
  return COPY[input.tone].subject(input.restaurantName);
}

// Email: HTML simples e sóbrio, consistente com o que a edge antiga enviava;
// nada de template engine (guardrail do prompt).
export function renderEmailHtml(input: MessageInput): string {
  const c = COPY[input.tone];
  const when = input.timeLabel
    ? `${input.dateLong}, ${input.timeLabel}`
    : input.dateLong;
  const hooks = input.hooks
    .map(
      (h) =>
        `<li><strong>${escapeHtml(h.name)}</strong> <span style="color:#6b6b6b;">· ${escapeHtml(c.hookTag[h.kind])}</span></li>`,
    )
    .join("\n        ");
  const accent = input.accentHex ?? THEME_ACCENT.costeiro;
  return `
    <div style="font-family: system-ui, sans-serif; color: #1a1a1a; line-height: 1.5;">
      ${
    input.logoUrl
      ? `<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.restaurantName)}" style="max-height:120px;max-width:200px;margin-bottom:12px;" />`
      : ""
  }
      <p>${escapeHtml(c.greeting(input.customerName))}</p>
      <p style="color:${escapeHtml(accent)};font-weight:600;">${escapeHtml(c.thanks(input.restaurantName))}</p>
      <ul>
        <li><strong>Data:</strong> ${escapeHtml(when)}</li>
        <li><strong>Pessoas:</strong> ${input.partySize}</li>
      </ul>
      ${
    input.notes
      ? `<p><strong>${escapeHtml(c.notesLabel)}:</strong> ${escapeHtml(input.notes)} — ${escapeHtml(c.notesSuffix)}</p>`
      : ""
  }
      ${
    input.hooks.length > 0
      ? `<p>${escapeHtml(c.hooksIntro)}</p>\n      <ul>\n        ${hooks}\n      </ul>`
      : ""
  }
      ${input.hasReply ? `<p>${escapeHtml(c.replyLine)}</p>` : ""}
      <p style="white-space: pre-line;">${escapeHtml(c.signoff(input.restaurantName))}</p>
    </div>`;
}

// SMS: a mesma substância, comprimida. Sem HTML, ganchos só por nome+tag curta,
// alvo <320 chars (2 segmentos GSM); corta ganchos antes de cortar o essencial.
export function renderSms(input: MessageInput): string {
  const c = COPY[input.tone];
  const when = input.timeLabel
    ? `${input.dateShort} ${input.timeLabel}`
    : input.dateShort;
  const base = input.tone === "proximo"
    ? `${input.restaurantName}: a sua mesa está guardada — ${when}, ${input.partySize} pessoas.`
    : `${input.restaurantName}: reserva confirmada — ${when}, ${input.partySize} pessoas.`;
  const notes = input.notes ? ` ${c.notesLabel}: ${input.notes} — ${c.notesSuffix}` : "";
  const shortTag: Record<HookKind, string> = {
    daily: "prato do dia",
    market: "preço do dia",
    by_order: "por encomenda",
  };
  const reply = input.hasReply ? ` ${c.replyLine}` : "";

  let sms = base + notes;
  if (input.hooks.length > 0) {
    const hookText = ` Hoje: ${input.hooks.map((h) => `${h.name} (${shortTag[h.kind]})`).join("; ")}.`;
    if ((sms + hookText + reply).length <= 320) sms += hookText;
  }
  if ((sms + reply).length <= 320) sms += reply;
  return sms;
}
