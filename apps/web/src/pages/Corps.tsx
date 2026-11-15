import {
  Bloco,
  CONTACTO,
  Estado,
  Lista,
  PaginaVertical,
  botaoPrincipal,
  usePageMeta,
} from "@/components/site/SiteChrome";

// nostos.pt/corps: página curta. Tratamento por você. Nome e textos novos a 15-11-2026 (antes nostos fire), por aprovar.
// Só é publicada em builds a partir de 01-12-2026 (ver vite.config.ts e App.tsx).
// O cliente não é nomeado.

export default function Corps() {
  usePageMeta(
    "nostos corps · a gestão diária de operações com pessoas e meios",
    "O nostos corps junta ponto, escalas e equipas num só sistema, do quiosque no posto ao escritório.",
  );

  return (
    <PaginaVertical vertical="corps">
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-[-0.015em] text-[var(--titulo)] sm:text-5xl">
        A gestão diária de operações com pessoas e meios.
      </h1>
      <p className="mt-6 text-lg leading-relaxed">
        O nostos corps junta ponto, escalas e equipas num só sistema, do quiosque no posto ao
        escritório. Para brigadas de bombeiros, segurança, limpeza e outros serviços que vivem das
        suas equipas.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href={CONTACTO} className={botaoPrincipal}>
          Fale connosco
        </a>
      </div>

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
          Portal de consulta para o cliente e gestão de manutenções de equipamentos.
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
