// Identidade da casa em todo o lado (decisão David 29-07): com logo mostra-o;
// sem logo, monograma com as iniciais do nome em Fraunces sobre gradiente
// atlântico — NADA fica vazio. `logoUrl` já é aceite para o PR do white-label
// ligar o logo real com 1 prop.

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "dos", "das", "e", "o", "a", "os", "as"]);

export function monogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !PALAVRAS_VAZIAS.has(w.toLowerCase()));
  const letters = words.slice(0, 2).map((w) => w[0].toUpperCase());
  return letters.join("") || "·";
}

export function CasaLogo({
  name,
  logoUrl,
  size = 32,
  className = "",
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`Logótipo de ${name}`}
        style={{ height: size, width: size }}
        className={`shrink-0 rounded-[9px] bg-white object-contain ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ height: size, width: size, fontSize: Math.round(size * 0.44) }}
      className={`grid shrink-0 select-none place-items-center rounded-[9px] bg-gradient-to-br from-atlantico-500 to-atlantico-900 font-display font-semibold leading-none text-areia-50 ${className}`}
    >
      {monogram(name)}
    </span>
  );
}
