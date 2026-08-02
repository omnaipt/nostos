// Idiomas do menu público (0025). PT é a base; EN, ES e FR são traduções.
//
// Só o MENU PÚBLICO é multilingue. O backoffice é ferramenta de trabalho de uma
// casa portuguesa e fica em português, o que também evita traduzir centenas de
// strings de gestão que ninguém estrangeiro vai ler.
//
// Detecção: idioma do aparelho, com selector sempre visível por cima. A
// detecção acerta na maioria dos casos e falha em casos reais e frequentes (o
// telemóvel do estrangeiro que vive cá, o casal que partilha o telemóvel), por
// isso nunca é a última palavra.

export type Lang = "pt" | "en" | "es" | "fr";

export const LANGS: Lang[] = ["pt", "en", "es", "fr"];

export const LANG_LABEL: Record<Lang, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
  fr: "Français",
};

// Código curto para o selector em ecrã estreito.
export const LANG_SHORT: Record<Lang, string> = {
  pt: "PT",
  en: "EN",
  es: "ES",
  fr: "FR",
};

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

// Idioma do aparelho, reduzido aos que o menu suporta. `navigator.languages`
// vem por ordem de preferência do utilizador, por isso a primeira que bater
// certo é a melhor. Português de qualquer variante cai em 'pt'. Sem
// correspondência, 'pt': é uma casa portuguesa e o português é a base.
export function detectLang(available: Lang[] = LANGS): Lang {
  if (typeof navigator === "undefined") return "pt";
  const prefs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language].filter(Boolean);
  for (const raw of prefs) {
    const base = String(raw).toLowerCase().split("-")[0];
    if (isLang(base) && available.includes(base)) return base;
  }
  return "pt";
}

// ── Strings da interface do menu público ────────────────────────────────────
// Chaves em português para o código se ler sozinho.

type Dict = Record<string, string>;

const PT: Dict = {
  menu: "Ementa",
  pratosDoDia: "Pratos de hoje",
  soHoje: "só hoje",
  porEncomenda: "por encomenda",
  porEncomendaNota: "por encomenda, reserve com antecedência",
  indisponivel: "Indisponível hoje",
  precoDoDia: "preço do dia",
  porKg: "por kg",
  paraPessoas: "para {n} pessoas",
  alergenios: "Alergénios",
  alergeniosNota: "Informação fornecida pela casa. Em caso de alergia, fale com a equipa.",
  reservarMesa: "Reservar mesa para outro dia",
  encomendarLevar: "Encomendar para levar",
  queVinho: "Que vinho combina?",
  semItens: "Sem pratos disponíveis de momento.",
  erroCarregar: "Não foi possível carregar a ementa. Tente outra vez.",
  naoEncontrado: "Restaurante não encontrado. Confirme o link.",
  categorias: "Categorias",
  queVinhoCom: "Que vinho combina com {prato}?",
  assinatura: "reservas e ementa por",
  idioma: "Idioma",
  traduzidoAviso: "Tradução automática revista pela casa. Em caso de dúvida, o original em português manda.",

  // Sommelier Virtual (widget do menu público). Só rótulos: os valores que o
  // widget envia à edge continuam em português (ver SommelierWidget.tsx).
  somPedir: "Pedir sugestão ao sommelier",
  somTitulo: "O sommelier da casa",
  somDescComPrato: "Vais comer isto; nós tratamos do vinho.",
  somDescSemPrato: "Sugestões da nossa carta, à tua medida.",
  somParaAcompanhar: "Para acompanhar:",
  somRemoverPrato: "Remover prato; sugerir para a refeição em geral",
  somTantoFaz: "Tanto faz",
  somTipoTinto: "Tinto",
  somTipoBranco: "Branco",
  somTipoRose: "Rosé",
  somTipoEspumante: "Espumante",
  somTipoDoce: "Doce / Porto",
  somPerfilLeve: "Leve e fresco",
  somPerfilEncorpado: "Encorpado",
  somPerfilAcidez: "Acidez viva",
  somPerfilFrutado: "Macio e frutado",
  somPerfilSeco: "Seco",
  somPerfilMineral: "Mineral",
  somPerguntaTipo: "Que tipo de vinho?",
  somPerguntaPerfil: "Como gostas? (escolhe os que quiseres)",
  somPerguntaRegiao: "Alguma região preferida?",
  somPerguntaPreco: "Quanto queres gastar na garrafa?",
  somGrupoTipo: "Tipo de vinho",
  somGrupoPerfil: "Perfil de gosto",
  somGrupoRegiao: "Região",
  somGrupoPreco: "Escalão de preço",
  somPrecoAte15: "até 15 €",
  somPreco15a25: "15 a 25 €",
  somPreco25a40: "25 a 40 €",
  somPreco40Mais: "40 €+",
  somCastaPergunta: "Alguma casta ou outro detalhe? (opcional)",
  somCastaAria: "Casta ou outro detalhe (opcional)",
  somCastaPlaceholder: "Ex.: Alvarinho · sem madeira",
  somAPensar: "O sommelier está a pensar...",
  somSugerir: "Sugerir vinhos",
  somOutraVez: "Perguntar outra vez",
  somFechar: "Fechar",
  somErroLimite: "O sommelier já atendeu muita gente hoje. Pergunta ao staff, que sabe tudo.",
  somErroGeral: "O sommelier não conseguiu responder agora. Tenta outra vez ou pergunta ao staff.",
};

const EN: Dict = {
  menu: "Menu",
  pratosDoDia: "Today's dishes",
  soHoje: "today only",
  porEncomenda: "to order",
  porEncomendaNota: "made to order, please book ahead",
  indisponivel: "Not available today",
  precoDoDia: "market price",
  porKg: "per kg",
  paraPessoas: "for {n} people",
  alergenios: "Allergens",
  alergeniosNota: "Information provided by the restaurant. If you have an allergy, please speak to the staff.",
  reservarMesa: "Book a table for another day",
  encomendarLevar: "Order takeaway",
  queVinho: "Which wine goes with this?",
  semItens: "No dishes available right now.",
  erroCarregar: "The menu could not be loaded. Please try again.",
  naoEncontrado: "Restaurant not found. Please check the link.",
  categorias: "Categories",
  queVinhoCom: "Which wine goes with {prato}?",
  assinatura: "bookings and menu by",
  idioma: "Language",
  traduzidoAviso: "Translation reviewed by the restaurant. If in doubt, the Portuguese original prevails.",

  somPedir: "Ask the sommelier",
  somTitulo: "Our house sommelier",
  somDescComPrato: "You picked the dish; we'll take care of the wine.",
  somDescSemPrato: "Suggestions from our list, chosen for you.",
  somParaAcompanhar: "To go with:",
  somRemoverPrato: "Remove dish; suggest for the whole meal",
  somTantoFaz: "No preference",
  somTipoTinto: "Red",
  somTipoBranco: "White",
  somTipoRose: "Rosé",
  somTipoEspumante: "Sparkling",
  somTipoDoce: "Sweet / Port",
  somPerfilLeve: "Light and fresh",
  somPerfilEncorpado: "Full-bodied",
  somPerfilAcidez: "Bright acidity",
  somPerfilFrutado: "Soft and fruity",
  somPerfilSeco: "Dry",
  somPerfilMineral: "Mineral",
  somPerguntaTipo: "Which type of wine?",
  somPerguntaPerfil: "How do you like it? (pick as many as you want)",
  somPerguntaRegiao: "Any region you prefer?",
  somPerguntaPreco: "How much would you like to spend on the bottle?",
  somGrupoTipo: "Wine type",
  somGrupoPerfil: "Taste profile",
  somGrupoRegiao: "Region",
  somGrupoPreco: "Price range",
  somPrecoAte15: "up to €15",
  somPreco15a25: "€15 to €25",
  somPreco25a40: "€25 to €40",
  somPreco40Mais: "€40+",
  somCastaPergunta: "A grape variety or any other detail? (optional)",
  somCastaAria: "Grape variety or other detail (optional)",
  somCastaPlaceholder: "E.g.: Alvarinho · no oak",
  somAPensar: "The sommelier is thinking...",
  somSugerir: "Suggest wines",
  somOutraVez: "Ask again",
  somFechar: "Close",
  somErroLimite: "The sommelier has served a lot of people today. Ask the staff, they know the list by heart.",
  somErroGeral: "The sommelier could not answer right now. Try again or ask the staff.",
};

const ES: Dict = {
  menu: "Carta",
  pratosDoDia: "Platos de hoy",
  soHoje: "solo hoy",
  porEncomenda: "por encargo",
  porEncomendaNota: "por encargo, reserve con antelación",
  indisponivel: "No disponible hoy",
  precoDoDia: "precio del día",
  porKg: "por kg",
  paraPessoas: "para {n} personas",
  alergenios: "Alérgenos",
  alergeniosNota: "Información facilitada por el restaurante. Si tiene alergia, hable con el personal.",
  reservarMesa: "Reservar mesa para otro día",
  encomendarLevar: "Pedir para llevar",
  queVinho: "¿Qué vino combina?",
  semItens: "No hay platos disponibles ahora mismo.",
  erroCarregar: "No se ha podido cargar la carta. Inténtelo de nuevo.",
  naoEncontrado: "Restaurante no encontrado. Compruebe el enlace.",
  categorias: "Categorías",
  queVinhoCom: "¿Qué vino combina con {prato}?",
  assinatura: "reservas y carta por",
  idioma: "Idioma",
  traduzidoAviso: "Traducción revisada por el restaurante. En caso de duda, prevalece el original en portugués.",

  somPedir: "Pedir sugerencia al sumiller",
  somTitulo: "El sumiller de la casa",
  somDescComPrato: "Usted elige el plato; del vino nos ocupamos nosotros.",
  somDescSemPrato: "Sugerencias de nuestra carta, a su medida.",
  somParaAcompanhar: "Para acompañar:",
  somRemoverPrato: "Quitar el plato; sugerir para toda la comida",
  somTantoFaz: "Me da igual",
  somTipoTinto: "Tinto",
  somTipoBranco: "Blanco",
  somTipoRose: "Rosado",
  somTipoEspumante: "Espumoso",
  somTipoDoce: "Dulce / Oporto",
  somPerfilLeve: "Ligero y fresco",
  somPerfilEncorpado: "Con cuerpo",
  somPerfilAcidez: "Acidez viva",
  somPerfilFrutado: "Suave y afrutado",
  somPerfilSeco: "Seco",
  somPerfilMineral: "Mineral",
  somPerguntaTipo: "¿Qué tipo de vino?",
  somPerguntaPerfil: "¿Cómo le gusta? (elija los que quiera)",
  somPerguntaRegiao: "¿Alguna región preferida?",
  somPerguntaPreco: "¿Cuánto quiere gastar en la botella?",
  somGrupoTipo: "Tipo de vino",
  somGrupoPerfil: "Perfil de gusto",
  somGrupoRegiao: "Región",
  somGrupoPreco: "Rango de precio",
  somPrecoAte15: "hasta 15 €",
  somPreco15a25: "de 15 a 25 €",
  somPreco25a40: "de 25 a 40 €",
  somPreco40Mais: "40 €+",
  somCastaPergunta: "¿Alguna uva u otro detalle? (opcional)",
  somCastaAria: "Uva u otro detalle (opcional)",
  somCastaPlaceholder: "Ej.: Alvarinho · sin madera",
  somAPensar: "El sumiller lo está pensando...",
  somSugerir: "Sugerir vinos",
  somOutraVez: "Preguntar otra vez",
  somFechar: "Cerrar",
  somErroLimite: "El sumiller ya ha atendido a mucha gente hoy. Pregunte al personal, que se sabe la carta.",
  somErroGeral: "El sumiller no ha podido responder ahora. Inténtelo de nuevo o pregunte al personal.",
};

const FR: Dict = {
  menu: "Carte",
  pratosDoDia: "Plats du jour",
  soHoje: "aujourd'hui seulement",
  porEncomenda: "sur commande",
  porEncomendaNota: "sur commande, réservez à l'avance",
  indisponivel: "Non disponible aujourd'hui",
  precoDoDia: "prix du jour",
  porKg: "le kg",
  paraPessoas: "pour {n} personnes",
  alergenios: "Allergènes",
  alergeniosNota: "Information fournie par le restaurant. En cas d'allergie, parlez-en à l'équipe.",
  reservarMesa: "Réserver une table pour un autre jour",
  encomendarLevar: "Commander à emporter",
  queVinho: "Quel vin l'accompagne ?",
  semItens: "Aucun plat disponible pour le moment.",
  erroCarregar: "Impossible de charger la carte. Réessayez.",
  naoEncontrado: "Restaurant introuvable. Vérifiez le lien.",
  categorias: "Catégories",
  queVinhoCom: "Quel vin accompagne {prato} ?",
  assinatura: "réservations et carte par",
  idioma: "Langue",
  traduzidoAviso: "Traduction revue par le restaurant. En cas de doute, l'original en portugais fait foi.",

  somPedir: "Demander conseil au sommelier",
  somTitulo: "Le sommelier de la maison",
  somDescComPrato: "Vous avez choisi le plat ; le vin, c'est nous.",
  somDescSemPrato: "Des suggestions de notre carte, à votre goût.",
  somParaAcompanhar: "Pour accompagner :",
  somRemoverPrato: "Retirer le plat ; suggérer pour tout le repas",
  somTantoFaz: "Peu importe",
  somTipoTinto: "Rouge",
  somTipoBranco: "Blanc",
  somTipoRose: "Rosé",
  somTipoEspumante: "Effervescent",
  somTipoDoce: "Doux / Porto",
  somPerfilLeve: "Léger et frais",
  somPerfilEncorpado: "Corsé",
  somPerfilAcidez: "Belle acidité",
  somPerfilFrutado: "Souple et fruité",
  somPerfilSeco: "Sec",
  somPerfilMineral: "Minéral",
  somPerguntaTipo: "Quel type de vin ?",
  somPerguntaPerfil: "Vous l'aimez comment ? (plusieurs choix possibles)",
  somPerguntaRegiao: "Une région en particulier ?",
  somPerguntaPreco: "Quel budget pour la bouteille ?",
  somGrupoTipo: "Type de vin",
  somGrupoPerfil: "Profil de goût",
  somGrupoRegiao: "Région",
  somGrupoPreco: "Fourchette de prix",
  somPrecoAte15: "jusqu'à 15 €",
  somPreco15a25: "de 15 à 25 €",
  somPreco25a40: "de 25 à 40 €",
  somPreco40Mais: "40 €+",
  somCastaPergunta: "Un cépage ou un autre détail ? (facultatif)",
  somCastaAria: "Cépage ou autre détail (facultatif)",
  somCastaPlaceholder: "Ex. : Alvarinho · sans bois",
  somAPensar: "Le sommelier réfléchit...",
  somSugerir: "Proposer des vins",
  somOutraVez: "Poser une autre question",
  somFechar: "Fermer",
  somErroLimite: "Le sommelier a déjà conseillé beaucoup de monde aujourd'hui. Demandez à l'équipe, elle connaît la carte.",
  somErroGeral: "Le sommelier n'a pas pu répondre pour l'instant. Réessayez ou demandez à l'équipe.",
};

const DICTS: Record<Lang, Dict> = { pt: PT, en: EN, es: ES, fr: FR };

// Devolve a string no idioma pedido, com fallback ao português. `vars`
// substitui {chave} no texto.
export function t(lang: Lang, key: keyof typeof PT, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang]?.[key] ?? PT[key] ?? String(key);
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    raw,
  );
}

// ── Alergénios (Reg. UE 1169/2011) ──────────────────────────────────────────
// Os códigos são os que estão gravados em menu_items.allergens e não mudam.

export const ALLERGEN_I18N: Record<string, Record<Lang, string>> = {
  gluten: { pt: "Glúten", en: "Gluten", es: "Gluten", fr: "Gluten" },
  crustaceos: { pt: "Crustáceos", en: "Crustaceans", es: "Crustáceos", fr: "Crustacés" },
  ovos: { pt: "Ovos", en: "Eggs", es: "Huevos", fr: "Œufs" },
  peixe: { pt: "Peixe", en: "Fish", es: "Pescado", fr: "Poisson" },
  amendoins: { pt: "Amendoins", en: "Peanuts", es: "Cacahuetes", fr: "Arachides" },
  soja: { pt: "Soja", en: "Soy", es: "Soja", fr: "Soja" },
  leite: { pt: "Leite", en: "Milk", es: "Leche", fr: "Lait" },
  frutos_casca: {
    pt: "Frutos de casca rija",
    en: "Tree nuts",
    es: "Frutos de cáscara",
    fr: "Fruits à coque",
  },
  aipo: { pt: "Aipo", en: "Celery", es: "Apio", fr: "Céleri" },
  mostarda: { pt: "Mostarda", en: "Mustard", es: "Mostaza", fr: "Moutarde" },
  sesamo: { pt: "Sésamo", en: "Sesame", es: "Sésamo", fr: "Sésame" },
  sulfitos: { pt: "Sulfitos", en: "Sulphites", es: "Sulfitos", fr: "Sulfites" },
  tremoco: { pt: "Tremoço", en: "Lupin", es: "Altramuces", fr: "Lupin" },
  moluscos: { pt: "Moluscos", en: "Molluscs", es: "Moluscos", fr: "Mollusques" },
};

export function allergenLabel(code: string, lang: Lang): string {
  return ALLERGEN_I18N[code]?.[lang] ?? ALLERGEN_I18N[code]?.pt ?? code;
}

// Locale para formatação de números e moeda. O preço é sempre em euros e a
// casa é portuguesa, mas quem lê em inglês espera 12.50 e não 12,50.
export const LANG_LOCALE: Record<Lang, string> = {
  pt: "pt-PT",
  en: "en-GB",
  es: "es-ES",
  fr: "fr-FR",
};

export function formatPriceCentsI18n(cents: number | null, lang: Lang): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(LANG_LOCALE[lang], {
    style: "currency",
    currency: "EUR",
  });
}
