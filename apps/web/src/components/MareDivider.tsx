// A "linha da maré": separador em scallop subtil, o motivo da marca costeira
// (em vez de um hr recto). Usar com parcimónia — 1× por página.
export function MareDivider({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 8"
      preserveAspectRatio="none"
      className={`h-2 w-full max-w-60 text-areia-300 ${className}`}
    >
      <path
        d="M0 7 Q10 2 20 7 Q30 2 40 7 Q50 2 60 7 Q70 2 80 7 Q90 2 100 7 Q110 2 120 7 Q130 2 140 7 Q150 2 160 7 Q170 2 180 7 Q190 2 200 7 Q210 2 220 7 Q230 2 240 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
