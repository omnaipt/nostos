/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Site da marca (13-11-2026): o nostos corps só entra em builds feitos a partir
// de 1 de dezembro de 2026 (data em Lisboa). VITE_NOSTOS_CORPS=1 ou =0 força o
// estado, para pré-visualizar. Com o valor a false, a página /corps e a entrada
// na página da marca nem chegam ao bundle.
const CORPS_DESDE = "2026-12-01";
const hojeLisboa = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(new Date());
const corps =
  process.env.VITE_NOSTOS_CORPS === "1"
    ? true
    : process.env.VITE_NOSTOS_CORPS === "0"
      ? false
      : hojeLisboa >= CORPS_DESDE;

const descricaoMarca = corps
  ? "Nostos é a família de produtos da OMNAI: Rest para restaurantes, Urbs para ateliers de arquitetura, Pulse para equipas comerciais e Corps para operações com pessoas e meios."
  : "Nostos é a família de produtos da OMNAI: Rest para restaurantes, Urbs para ateliers de arquitetura e Pulse para equipas comerciais.";

export default defineConfig({
  server: { host: "::", port: 8080 },
  plugins: [
    react(),
    {
      name: "nostos-descricao",
      transformIndexHtml: (html) => html.replace("NOSTOS_DESCRICAO_MARCA", descricaoMarca),
    },
  ],
  define: {
    __NOSTOS_CORPS__: JSON.stringify(corps),
    __NOSTOS_DESCRICAO_MARCA__: JSON.stringify(descricaoMarca),
  },
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
