import type React from "react";

// Temas curados das superfícies PÚBLICAS (/m, /r, email) — decisão David
// 29-07: curadoria em vez de picker livre (picker livre produz menus
// ilegíveis com a nossa assinatura no rodapé). Cada tema é um conjunto
// COMPLETO de tokens com contraste AA verificado no desenho; a implementação
// sobrepõe as MESMAS CSS vars shadcn num wrapper — a estrutura não muda.
// O backoffice mantém-se costeiro nostos (identidade do produto).
// v2 registada (não fazer): acento personalizado com correcção de contraste.

export type ThemeSlug =
  | "costeiro"
  | "ardosia"
  | "trattoria"
  | "horta"
  | "carvao"
  | "editorial";

export const THEME_SLUGS: ThemeSlug[] = [
  "costeiro",
  "ardosia",
  "trattoria",
  "horta",
  "carvao",
  "editorial",
];

interface ThemeDef {
  label: string;
  hint: string;
  // Miniatura do selector (hex reais do tema).
  preview: { bg: string; hero: string; accent: string; ink: string };
  // Hex do acento para o email (a edge só precisa de 1 cor).
  accentHex: string;
  // Triplos HSL para as CSS vars (formato tailwind `hsl(var(--x))`).
  vars: Record<string, string>;
}

// Nota de contraste (AA): fg de texto corrido nunca abaixo de 4.5:1 sobre o
// bg do tema; estados semânticos nos escuros usam variantes claras.
export const THEMES: Record<ThemeSlug, ThemeDef> = {
  costeiro: {
    label: "Costeiro",
    hint: "areia, atlântico e terracota — a assinatura nostos",
    preview: { bg: "#FAF5EC", hero: "#16303F", accent: "#B4502A", ink: "#2A2723" },
    accentHex: "#B4502A",
    vars: {
      "--background": "39 58% 95%",
      "--foreground": "34 9% 15%",
      "--card": "0 0% 100%",
      "--card-foreground": "34 9% 15%",
      "--muted": "39 47% 90%",
      "--muted-foreground": "30 9% 40%",
      "--border": "37 32% 84%",
      "--input": "37 32% 84%",
      "--primary": "17 62% 44%",
      "--primary-foreground": "43 64% 98%",
      "--ring": "200 27% 60%",
      "--hero-bg": "202 48% 17%",
      "--hero-fg": "43 64% 98%",
      "--warn-fg": "37 69% 32%",
      "--status-seated-fg": "148 30% 30%",
    },
  },
  ardosia: {
    label: "Ardósia",
    hint: "escuro e dourado, fine-dining",
    preview: { bg: "#1C1B1A", hero: "#141312", accent: "#C89B3C", ink: "#ECE6DA" },
    accentHex: "#C89B3C",
    vars: {
      "--background": "30 4% 11%",
      "--foreground": "40 32% 89%",
      "--card": "30 6% 13%",
      "--card-foreground": "40 32% 89%",
      "--muted": "36 6% 17%",
      "--muted-foreground": "35 10% 68%",
      "--border": "34 6% 24%",
      "--input": "34 6% 24%",
      "--primary": "41 56% 51%",
      "--primary-foreground": "30 4% 11%",
      "--ring": "41 56% 51%",
      "--hero-bg": "30 5% 7%",
      "--hero-fg": "40 32% 89%",
      "--warn-fg": "41 60% 62%",
      "--status-seated-fg": "143 25% 70%",
    },
  },
  trattoria: {
    label: "Trattoria",
    hint: "creme, oliva e tomate",
    preview: { bg: "#FBF7EF", hero: "#5A6B3B", accent: "#B33A2B", ink: "#26231C" },
    accentHex: "#B33A2B",
    vars: {
      "--background": "40 60% 96%",
      "--foreground": "42 15% 13%",
      "--card": "0 0% 100%",
      "--card-foreground": "42 15% 13%",
      "--muted": "40 47% 90%",
      "--muted-foreground": "42 10% 40%",
      "--border": "41 38% 86%",
      "--input": "41 38% 86%",
      "--primary": "7 61% 44%",
      "--primary-foreground": "40 60% 97%",
      "--ring": "81 29% 33%",
      "--hero-bg": "81 29% 33%",
      "--hero-fg": "40 60% 96%",
      "--warn-fg": "37 69% 32%",
      "--status-seated-fg": "148 30% 30%",
    },
  },
  horta: {
    label: "Horta",
    hint: "verdes de mata e lima queimada",
    preview: { bg: "#F4F7F1", hero: "#2F5233", accent: "#2F5233", ink: "#1F241C" },
    accentHex: "#2F5233",
    vars: {
      "--background": "90 27% 96%",
      "--foreground": "98 13% 13%",
      "--card": "0 0% 100%",
      "--card-foreground": "98 13% 13%",
      "--muted": "90 29% 91%",
      "--muted-foreground": "99 9% 38%",
      "--border": "90 23% 86%",
      "--input": "90 23% 86%",
      "--primary": "127 27% 25%",
      "--primary-foreground": "90 27% 96%",
      "--ring": "69 56% 39%",
      "--hero-bg": "127 27% 25%",
      "--hero-fg": "90 27% 96%",
      "--warn-fg": "37 69% 32%",
      "--status-seated-fg": "148 30% 30%",
    },
  },
  carvao: {
    label: "Carvão",
    hint: "quentes profundos, brasa e osso",
    preview: { bg: "#211A16", hero: "#191410", accent: "#C4572E", ink: "#EFE6DA" },
    accentHex: "#C4572E",
    vars: {
      "--background": "22 20% 11%",
      "--foreground": "34 40% 90%",
      "--card": "21 20% 14%",
      "--card-foreground": "34 40% 90%",
      "--muted": "26 20% 17%",
      "--muted-foreground": "31 14% 68%",
      "--border": "23 17% 24%",
      "--input": "23 17% 24%",
      "--primary": "16 62% 47%",
      "--primary-foreground": "34 40% 95%",
      "--ring": "16 62% 47%",
      "--hero-bg": "20 22% 8%",
      "--hero-fg": "34 40% 90%",
      "--warn-fg": "41 60% 62%",
      "--status-seated-fg": "143 25% 70%",
    },
  },
  editorial: {
    label: "Editorial",
    hint: "branco, tinta e um só acento",
    preview: { bg: "#FFFFFF", hero: "#171717", accent: "#2E5E73", ink: "#171717" },
    accentHex: "#2E5E73",
    vars: {
      "--background": "0 0% 100%",
      "--foreground": "0 0% 9%",
      "--card": "0 0% 100%",
      "--card-foreground": "0 0% 9%",
      "--muted": "0 0% 96%",
      "--muted-foreground": "0 0% 40%",
      "--border": "0 0% 90%",
      "--input": "0 0% 90%",
      "--primary": "198 43% 32%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "198 43% 32%",
      "--hero-bg": "0 0% 9%",
      "--hero-fg": "0 0% 100%",
      "--warn-fg": "37 69% 32%",
      "--status-seated-fg": "148 30% 30%",
    },
  },
};

export function isThemeSlug(v: unknown): v is ThemeSlug {
  return typeof v === "string" && (THEME_SLUGS as string[]).includes(v);
}

// Style object com as CSS vars do tema, para o root da página pública.
// slug desconhecido/ausente → costeiro (default, também o default da coluna).
export function themeStyle(slug: string | null | undefined): React.CSSProperties {
  const theme = THEMES[isThemeSlug(slug) ? slug : "costeiro"];
  return theme.vars as unknown as React.CSSProperties;
}
