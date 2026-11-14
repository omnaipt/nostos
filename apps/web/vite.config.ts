/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Site da marca (13-11-2026): o nostos fire só entra em builds feitos a partir
// de 1 de dezembro de 2026 (data em Lisboa). VITE_NOSTOS_FIRE=1 ou =0 força o
// estado, para pré-visualizar. Com o valor a false, a página /fire e a entrada
// na página da marca nem chegam ao bundle.
const FIRE_DESDE = "2026-12-01";
const hojeLisboa = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Lisbon" }).format(new Date());
const fire =
  process.env.VITE_NOSTOS_FIRE === "1"
    ? true
    : process.env.VITE_NOSTOS_FIRE === "0"
      ? false
      : hojeLisboa >= FIRE_DESDE;

const descricaoMarca = fire
  ? "Nostos é a família de produtos da OMNAI: Rest para restaurantes, Urbs para ateliers de arquitetura, Pulse para equipas comerciais e Fire para brigadas de bombeiros industriais."
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
    __NOSTOS_FIRE__: JSON.stringify(fire),
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
