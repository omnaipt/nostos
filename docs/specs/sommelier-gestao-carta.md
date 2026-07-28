# Spec — Sommelier: gestão da carta de vinhos

Requisito do David (28-07): o sommelier tem de conseguir **ler uma base existente** e depois o dono **adicionar vinhos, retirar e alterar preços**.

## 0. O facto que simplifica tudo (auditado ao código, 28-07)

A edge `sommelier-pairing` em produção lê a carta do próprio menu: categorias com "vinho" no nome + itens `active` e `available`, whitelist pós-geração, rate limit 30/dia. **Os vinhos já são itens de menu.** Portanto:

- Adicionar/retirar vinhos e alterar preços = CRUD de itens na categoria Vinhos, já permitido por RLS `member_all`. É o mesmo editor do menu; não há módulo novo de dados.
- Retirar um vinho temporariamente (esgotou a colheita) = `available=false`, e o sommelier deixa de o sugerir NO PRÓPRIO MOMENTO, porque filtra por `available`. Isto já funciona e é um argumento de venda ("o sommelier nunca sugere o que não tens").
- Preço a copo e jarros 0,5/1 L = variantes do 0010 (PR #40). A carta da Lota do Cais já foi desenhada assim.

O que NÃO existe e esta spec acrescenta: (1) a entrada da base existente (import da carta), (2) a convenção de dados que dá qualidade às justificações, (3) o ecrã do dono focado em vinhos.

## 1. Ler a base existente (import da carta)

Duas portas de entrada, ambas a desaguar no mesmo sítio:

**a) Via parse do menu.** O `parse-menu` (spec já escrita) detecta a secção de vinhos e devolve-a num bloco à parte (`wine_section_detected`). Esse bloco cria a categoria "Vinhos" com os itens em rascunho (`active=false`, `needs_review`), no mesmo fluxo de revisão do resto do menu.

**b) Carta em separado (o caso do David).** Upload próprio de foto/PDF da carta de vinhos (ou escrita manual). Mesmo motor do parse-menu com prompt especializado: extrai nome, produtor, região, castas quando presentes, preços garrafa/copo/jarro. Cria os itens na categoria Vinhos em rascunho, com variantes quando há copo/jarro. Revisão obrigatória igual à do menu.

Regra anti-invenção herdada: o parser nunca completa castas ou regiões que não estão no papel; campos ausentes ficam vazios e marcados, e o passo de enriquecimento (secção 2) é separado e assinalado como sugestão de IA.

## 2. O modelo de dados (decisão recomendada: convenção, não schema novo)

A qualidade da justificação do sommelier depende de saber região, castas e perfil. Três opções:

1. **Convenção na descrição (recomendada para já):** `description` = "Região · castas · perfil", ex.: "Douro · Touriga Franca, Tinta Roriz · encorpado, fruta preta". Funciona com a edge ACTUAL sem mudar uma linha (ela já manda a descrição no prompt), o editor é o de texto normal, e o import escreve neste formato. Custo: é convenção, não é estruturado.
2. Campos estruturados em `menu_items` (region, grapes, style): schema mais limpo, mas polui a tabela do menu com campos que 90% dos itens não usam.
3. Tabela `wine_profiles` 1:1 com o item: o mais correcto a prazo, mas é migração + joins + editor novo, para um ganho que a convenção já dá.

Recomendação: **opção 1 agora**; promover à 3 apenas se surgir necessidade real (filtros por casta, análises de vendas por região). A demo já segue a convenção.

**Enriquecimento assistido (opcional, barato):** botão "completar com IA" no vinho: sugere região/castas/perfil a partir do nome, o dono confirma. Marca `needs_review` até confirmação, como os alergénios. Nunca automático.

## 3. O ecrã do dono ("Carta de vinhos")

Uma vista filtrada do editor de menu, não um módulo novo. Diferenças de UX que justificam a vista própria:

- Lista com colunas certas para vinhos: nome, região/castas (da convenção), garrafa, copo, disponível.
- Acções rápidas: alterar preço inline; toggle esgotado; adicionar vinho (form com os campos da convenção + preços garrafa/copo, que criam as variantes); remover.
- Contador de saúde do sommelier no topo: "18 vinhos activos · 16 com perfil completo · 2 sem perfil (sugestões piores)". Liga a causa (dados) ao efeito (qualidade das sugestões), e empurra o dono a completar.
- Zero impacto na edge: ela continua a ler exactamente do mesmo sítio.

## 4. O que fica explicitamente fora

- Stock de garrafas ligado ao sommelier (o SAF-T abate bebidas como itens de bar; ligação fina vinho-a-vinho fica para quando houver procura).
- Harmonização automática prato-a-prato pré-calculada (o pairing continua on-demand).
- Cave/colheitas/anos: a carta v0 não modela vintages; o ano vai no nome se o dono quiser.

## 5. Sequência de implementação (curta, porque a base existe)

1. Editor: vista "Carta de vinhos" filtrada + acções rápidas (Zé; depende do editor de menu genérico, que por sua vez usa o 0010 para variantes copo/garrafa).
2. Import b): prompt especializado no motor do parse-menu (Marco; reutiliza storage/staging do 0010 `menu_imports` com `source_kind` novo ou o mesmo).
3. Enriquecimento assistido (opcional, 1 tarde: é um prompt + confirmação).
4. Nada a mudar na edge `sommelier-pairing`.

## 6. Decisões em aberto para o David

1. Validas a **convenção na descrição** (opção 1) em vez de schema novo? É a diferença entre "está na demo e funciona hoje" e "mais uma migração".
2. O enriquecimento assistido ("completar com IA") entra no v0 do ecrã ou fica para depois?
3. No import da carta em separado: aceitas que reutilize a tabela `menu_imports` do 0010 (com `source_kind='wine_list'` acrescentado ao check) em vez de tabela própria? Recomendo que sim, é um ALTER de uma linha no PR #40.
