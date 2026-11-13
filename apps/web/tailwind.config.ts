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
        sans: ["IBM Plex Sans", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["IBM Plex Sans", "system-ui", "sans-serif"],
      },
      boxShadow: {
        warm: "0 1px 3px rgba(22,64,60,.06), 0 4px 14px rgba(22,64,60,.08)",
        "warm-lg": "0 2px 6px rgba(22,64,60,.07), 0 12px 32px rgba(22,64,60,.10)",
      },
      colors: {
        areia: { 50: "#FBF8F2", 100: "#F7F2E8", 200: "#EFE8DA", 300: "#DDD3C0" },
        atlantico: { 300: "#6F9E96", 500: "#2A5F59", 700: "#1B4A45", 900: "#16403C" },
        terracota: { 100: "#F1E1E3", 500: "#8E3A47", 600: "#7A2E3A" },
        alga: { 100: "#E3EFE7", 600: "#2A6B45" },
        ambar: { 100: "#F6EDD6", 600: "#9A6B00" },
        coral: { 100: "#F7E1DE", 600: "#C2352B" },
        ink: { DEFAULT: "#1B2A27", muted: "#5A645F" },
        line: "#DDD3C0",
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
