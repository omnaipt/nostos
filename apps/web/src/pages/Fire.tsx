import {
  Bloco,
  CONTACTO,
  Estado,
  Lista,
  PaginaVertical,
  botaoPrincipal,
  usePageMeta,
} from "@/components/site/SiteChrome";

// nostos.pt/fire: página curta. Tratamento por você. Textos aprovados a 13-11-2026.
// Só é publicada em builds a partir de 01-12-2026 (ver vite.config.ts e App.tsx).
// O cliente não é nomeado.

export default function Fire() {
  usePageMeta(
    "nostos fire · a gestão diária de uma brigada de bombeiros industriais",
    "O nostos fire junta ponto, escalas e equipas num só sistema, do quiosque do quartel ao escritório.",
  );

  return (
    <PaginaVertical vertical="fire">
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.015em] text-[var(--titulo)] sm:text-5xl">
        A gestão diária de uma brigada de bombeiros industriais.
      </h1>
      <p className="mt-6 text-lg leading-relaxed">
        O nostos fire junta ponto, escalas e equipas num só sistema, do quiosque do quartel ao
        escritório.
      </p>
      <a href={CONTACTO} className={botaoPrincipal + " mt-8"}>
        Falar connosco
      </a>

      <Bloco titulo="Em produção">
        <Lista
          itens={[
            "Marcação de ponto em quiosque, com cartão e fotografia",
            "Escalas e regras de turno",
            "Exportação de horas para processamento salarial",
          ]}
        />
      </Bloco>

      <Bloco titulo="A seguir">
        <p>
          Portal de consulta para o cliente e gestão de manutenções de extintores e sistemas de
          deteção.
        </p>
      </Bloco>

      <Bloco titulo="Estado">
        <p>
          <Estado>Em operação numa brigada industrial em Portugal</Estado>
        </p>
      </Bloco>
    </PaginaVertical>
  );
}
