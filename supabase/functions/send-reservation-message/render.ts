// Composição e render das mensagens ao CLIENTE (reserva + take-away).
// Canais v1 (decisão de canais 30-07): email (Resend) é o único garantido;
// WhatsApp fica stub até a Meta aprovar. SMS saiu do v1 — sem render de SMS.

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
    // Revisão de copy (David, 30-07): "reservada" e não "guardada"; nada de
    // gerúndio ("ir sonhando") nem de travessões; o nome da casa nunca leva
    // artigo colado (pode ser masculino: "O Cantinho"), por isso as frases são
    // construídas sem género.
    subject: (rest) => `A sua mesa está reservada · ${rest}`,
    greeting: (name) => `Olá ${name},`,
    thanks: () => `Agradecemos a sua reserva. A mesa fica à sua espera.`,
    notesLabel: "Pedidos",
    notesSuffix: "confirmamos consigo.",
    hooksIntro: "Para lhe abrir o apetite, hoje temos:",
    hookTag: {
      daily: "prato do dia, só hoje",
      market: "peixe da lota, ao preço do dia",
      by_order: "por encomenda, responda a esta mensagem",
    },
    replyLine: "Responda a esta mensagem para qualquer pedido.",
    signoff: (rest) => `Até já,\n${rest}`,
  },
  formal: {
    subject: (rest) => `Reserva confirmada · ${rest}`,
    greeting: (name) => `Caro(a) ${name},`,
    thanks: () => `A sua reserva está confirmada. Agradecemos a preferência.`,
    notesLabel: "Pedidos registados",
    notesSuffix: "serão confirmados pela nossa equipa.",
    hooksIntro: "Sugestões da nossa cozinha para hoje:",
    hookTag: {
      daily: "prato do dia",
      market: "preço de mercado",
      by_order: "por encomenda, responda a esta mensagem",
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
      ? `<p><strong>${escapeHtml(c.notesLabel)}:</strong> ${escapeHtml(input.notes)}. ${escapeHtml(c.notesSuffix.charAt(0).toUpperCase() + c.notesSuffix.slice(1))}</p>`
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

// ── Take-away (spec Roles §3): mensagens ao cliente por email ────────────────
// "Encomenda recebida" e "A sua encomenda está pronta". Mesma voz da casa (tom
// próximo|formal), sem ganchos de menu (não se aplicam a uma encomenda).

export type TakeawayKind = "takeaway_received" | "takeaway_ready";

export interface TakeawayInput {
  restaurantName: string;
  tone: Tone;
  customerName: string;
  kind: TakeawayKind;
  /** Hora de levantamento "HH:MM" no fuso do restaurante, se conhecida. */
  pickupLabel: string | null;
  logoUrl?: string | null;
  accentHex?: string;
}

const TAKEAWAY_COPY: Record<Tone, {
  receivedSubject: (rest: string) => string;
  readySubject: (rest: string) => string;
  greeting: (name: string) => string;
  received: (rest: string, pickup: string | null) => string;
  ready: (rest: string, pickup: string | null) => string;
  signoff: (rest: string) => string;
}> = {
  proximo: {
    receivedSubject: (rest) => `Recebemos a sua encomenda · ${rest}`,
    readySubject: (rest) => `A sua encomenda está pronta · ${rest}`,
    greeting: (name) => `Olá ${name},`,
    // O pickup já vem com preposição e, se não for hoje, com o dia por extenso.
    received: (_rest, pickup) =>
      `Recebemos a sua encomenda${pickup ? ` para levantar ${pickup}` : ""}. Paga no levantamento.`,
    ready: (_rest, pickup) =>
      `A sua encomenda está pronta${pickup ? ` para levantar ${pickup}` : " para levantar"}. Ficamos à sua espera.`,
    signoff: (rest) => `Até já,\n${rest}`,
  },
  formal: {
    receivedSubject: (rest) => `Encomenda recebida · ${rest}`,
    readySubject: (rest) => `Encomenda pronta · ${rest}`,
    greeting: (name) => `Caro(a) ${name},`,
    received: (_rest, pickup) =>
      `Confirmamos a recepção da sua encomenda${pickup ? ` para levantamento ${pickup}` : ""}. O pagamento é efectuado no levantamento.`,
    ready: (_rest, pickup) =>
      `A sua encomenda encontra-se pronta${pickup ? ` para levantamento ${pickup}` : " para levantamento"}.`,
    signoff: (rest) => `Com os melhores cumprimentos,\n${rest}`,
  },
};

export function renderTakeawaySubject(input: TakeawayInput): string {
  const c = TAKEAWAY_COPY[input.tone];
  return input.kind === "takeaway_ready"
    ? c.readySubject(input.restaurantName)
    : c.receivedSubject(input.restaurantName);
}

export function renderTakeawayEmailHtml(input: TakeawayInput): string {
  const c = TAKEAWAY_COPY[input.tone];
  const body = input.kind === "takeaway_ready"
    ? c.ready(input.restaurantName, input.pickupLabel)
    : c.received(input.restaurantName, input.pickupLabel);
  const accent = input.accentHex ?? THEME_ACCENT.costeiro;
  return `
    <div style="font-family: system-ui, sans-serif; color: #1a1a1a; line-height: 1.5;">
      ${
    input.logoUrl
      ? `<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.restaurantName)}" style="max-height:120px;max-width:200px;margin-bottom:12px;" />`
      : ""
  }
      <p>${escapeHtml(c.greeting(input.customerName))}</p>
      <p style="color:${escapeHtml(accent)};font-weight:600;">${escapeHtml(body)}</p>
      <p style="white-space: pre-line;">${escapeHtml(c.signoff(input.restaurantName))}</p>
    </div>`;
}
