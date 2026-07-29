import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1200px" } },
    extend: {
      // Direcção "Costeiro quente" (29-07): paleta nomeada para uso directo
      // (bg-atlantico-900, text-terracota-600...). Os tokens shadcn do
      // index.css derivam dela; terracota é SÓ acção.
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["Fraunces", "Georgia", "Times New Roman", "serif"],
      },
      boxShadow: {
        warm: "0 1px 3px rgba(22,48,63,.06), 0 4px 14px rgba(22,48,63,.08)",
        "warm-lg": "0 2px 6px rgba(22,48,63,.07), 0 12px 32px rgba(22,48,63,.10)",
      },
      colors: {
        areia: { 50: "#FDFBF6", 100: "#FAF5EC", 200: "#F2EADB", 300: "#E7DCC6" },
        atlantico: { 300: "#7FA3B5", 500: "#2E5E73", 700: "#1E4257", 900: "#16303F" },
        terracota: { 100: "#F6E3D9", 500: "#C25B32", 600: "#B4502A" },
        alga: { 100: "#E2EFE7", 600: "#3E7256" },
        ambar: { 100: "#F7EDD8", 600: "#A8741F" },
        coral: { 100: "#F5E0DC", 600: "#A63D2F" },
        ink: { DEFAULT: "#2A2723", muted: "#6E655C" },
        line: "#E4DACA",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
