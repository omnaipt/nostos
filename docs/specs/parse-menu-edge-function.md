# Spec — edge function `parse-menu` (foto/PDF para schema)

Transforma o menu que o dono entrega (foto ou PDF, ou entrada manual) num rascunho estruturado no schema 0010, dentro de um lote `menu_imports`, pronto para o ecrã de revisão. É a peça central do enrollment. Assenta no achado do teste: o parse de texto é bom, o trabalho está em mapear para o modelo de dados e em sinalizar o que precisa de revisão.

## 1. Objectivo

Dada uma imagem/PDF de um menu e um `restaurant_id`, produzir categorias, itens e variantes em rascunho (`active=false`, `source='parsed'`), com `needs_review` e `review_note` onde há incerteza, e um `menu_imports` com contagens e as linhas ilegíveis. Nunca publica, nunca inventa.

## 2. Fora de âmbito

- Não publica o menu (isso é decisão do dono no ecrã de revisão).
- Não calcula food cost nem margem (depende da despensa, passo posterior).
- Não importa vinhos para o menu (rota para o módulo do sommelier, secção 8).
- Não garante leitura perfeita de manuscritos; sinaliza em vez de adivinhar.
- Não infere alergénios como facto; sugere e marca para confirmação.

## 3. Contexto técnico

- Edge function Deno em `supabase/functions/parse-menu`, no padrão das existentes (`generate-tech-sheet`, `sommelier-pairing`).
- Ficheiros em Supabase Storage (bucket privado por tenant), acesso por signed URL.
- Modelo de visão configurável por env (mesmo padrão do `ANTHROPIC_MODEL` já usado).
- **Assíncrono.** Um tri-fold são várias páginas e o parse leva segundos; não cabe bem num pedido síncrono. O cliente cria o import, a função processa em background, e o ecrã de revisão abre quando o estado passa a `review` (poll ao `menu_imports` ou subscrição realtime à row).

## 4. Fluxo

1. Cliente faz upload do(s) ficheiro(s) para o Storage e cria `menu_imports` (`source_kind`, `source_ref`, `status='parsing'`). RLS garante o tenant.
2. A função recebe `import_id`, resolve os ficheiros por signed URL.
3. Pré-processamento: PDF para imagens por página; normalização básica (orientação, tamanho máximo).
4. Chamada ao modelo de visão com **saída JSON estrita** (contrato na secção 5) e as regras da secção 6. Uma chamada por página; junta-se no fim.
5. Pós-processamento e validação: normaliza preços (vírgula/ponto para cêntimos), decide `price_type`, constrói variantes, aplica as regras de `needs_review`/`review_note` (secção 7), recolhe linhas ilegíveis para `unparsed_note`.
6. Sugestão de alergénios, passo separado e explicitamente inferido: preenche `allergens`, deixa `allergens_confirmed=false` e marca `needs_review`.
7. Persiste em rascunho: categorias, itens (`active=false`, `source='parsed'`, `import_id`) e variantes; actualiza `menu_imports` (`items_count`, `flagged_count`, `unparsed_note`, `status='review'` ou `failed`). Guarda a saída bruta do modelo para auditoria.

## 5. Contrato de saída do modelo (JSON estrito)

O modelo devolve só isto, sem prosa. Validar com um schema (a função rejeita e re-tenta se não bater):

```json
{
  "categories": [
    {
      "label": "Peixe",
      "items": [
        {
          "name": "Bacalhau à Sagrados",
          "description": null,
          "external_ref": "05",
          "price_type": "variants",
          "price_cents": null,
          "serves": null,
          "variants": [
            { "label": "½ dose", "price_cents": 1550, "unit": "dose", "serves": null },
            { "label": "dose",   "price_cents": 3100, "unit": "dose", "serves": null }
          ],
          "confidence": "high",
          "review_reason": null
        },
        {
          "name": "Garoupa cozida",
          "price_type": "variants",
          "price_cents": null,
          "variants": [ { "label": "dose", "price_cents": 2400, "unit": "dose" } ],
          "confidence": "low",
          "review_reason": "preço único: confirmar se é ½ dose ou dose"
        }
      ]
    }
  ],
  "wine_section_detected": true,
  "unparsed_lines": ["linha tapada por marcador, ilegível"]
}
```

`price_type` em {fixed, per_kg, market, variants}. `confidence` em {high, medium, low}. `review_reason` alimenta o `review_note`.

## 6. Regras do prompt (as que evitam o desastre)

- Transcreve à letra. Nunca inventes pratos, preços, ingredientes ou descrições.
- Se um preço estiver desbotado ou ambíguo, marca `confidence: low` e explica em `review_reason`. Não adivinhes um número.
- Duas colunas de preço (½ dose / dose) viram `price_type: variants` com duas variantes. Se só houver um preço, cria uma variante com o teu melhor palpite de coluna e marca `low` com o motivo.
- Preço por kg vira `per_kg`. Preço de mercado ("consultar") vira `market` com `price_cents: null`.
- "2 pessoas", "2 pax" viram `serves`. Códigos do menu ("01", "73") vão para `external_ref`, nunca para o preço.
- Não inventes alergénios. Deixa a lista vazia; a sugestão é um passo à parte.
- Secção de vinhos: não a metas nos itens. Marca `wine_section_detected: true` e devolve os vinhos num bloco à parte (para o módulo do sommelier).
- Linhas que não consegues ler vão para `unparsed_lines`, não para itens.

## 7. Regras de `needs_review` e `review_note`

Marca `needs_review=true` e escreve o `review_note` quando:

- `confidence` medium ou low (motivo do modelo).
- preço único numa grelha de duas colunas ("confirmar se é ½ dose ou dose").
- `price_type='market'` ("sem preço no menu, confirmar").
- alergénios sugeridos por IA ("confirmar alergénios").
- variante ou preço normalizado que não fecha (ex.: dose menor que ½ dose).

Itens `high` sem nenhum destes ficam `needs_review=false`, mas continuam em rascunho até o dono publicar. A revisão nunca é saltada, só fica mais curta.

## 8. Vinhos (liga ao módulo do sommelier, a seguir)

O parse deteta e separa a carta de vinhos, mas não a mete no menu. Guarda-a no lote (payload do import) para o módulo do sommelier a consumir. Isto encaixa no requisito de o sommelier ler uma base existente: a primeira base pode vir daqui, e depois o dono adiciona, remove e altera preços na gestão da carta. O schema da carta de vinhos desenha-se no spec seguinte.

## 9. Requisitos novos do menu (capturados)

Dois pedidos teus que não são do parse mas condicionam o produto à volta dele:

**Edição total.** O dono tem de poder alterar, remover e adicionar qualquer componente (categoria, prato, variante, preço, descrição, alergénio). O schema 0010 já permite tudo isto via RLS `member_all`; é trabalho de editor (frontend), não de base de dados. O parse só produz o rascunho; o editor é o CRUD por cima.

**Pratos do dia.** Conceito novo. Há restaurantes que adicionam pratos todos os dias e os tiram no fim. O schema actual não distingue um prato permanente de um do dia. Proposta mínima (migração futura 0011):

- `menu_items.kind text not null default 'standard' check (kind in ('standard','daily'))`.
- `menu_items.service_date date` (só para os `daily`: o dia a que se aplica).
- RPC pública mostra os `standard` sempre e os `daily` só quando `service_date = data de hoje` no fuso do restaurante.
- No editor: uma zona "pratos de hoje" com adicionar rápido, "duplicar os de ontem" e "limpar", para o ritmo diário não dar trabalho.
- O parse ignora secções de pratos do dia em branco (o "Outras Sugestões" vazio do tri-fold); se houver especiais impressos, entram como itens normais e o dono decide.

Decisão tua: chega `kind` + `service_date` (um prato do dia é de um dia), ou queres intervalos (um especial que dura uma semana) com `available_from`/`available_to`? E os do dia devem esconder-se sozinhos quando o dia passa, ou ficam até o dono limpar?

## 10. Erros, segurança, custo, limites

- Tamanho máximo por ficheiro e número de páginas com tecto; rejeitar acima.
- Signed URLs de curta duração; bucket privado; RLS no `menu_imports` já isola o tenant.
- Falha do modelo ou JSON inválido: re-tenta uma vez, depois `status='failed'` com motivo, e o cliente mostra "não consegui ler, tenta outra foto ou escreve à mão".
- Custo por parse: uma chamada de visão por página; registar no import para medir o custo real por menu ao longo do tempo.
- Idempotência: reprocessar um import limpa o rascunho anterior desse `import_id` antes de reescrever, para não duplicar.

## 11. Decisões em aberto

1. Modelo de visão a usar e se é o mesmo do resto do stack.
2. Sync vs async confirmado como async; validar o mecanismo (poll simples vs realtime na row do import).
3. Pratos do dia: `kind` + `service_date` vs intervalos, e auto-esconder vs limpar à mão (secção 9).
4. Onde guardar a carta de vinhos detetada até o módulo do sommelier existir (payload do import vs tabela de staging).
