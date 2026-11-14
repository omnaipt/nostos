# Sprint 06b: Afinações da entrada de faturas (segunda ronda de teste, 14-11)

Projecto: Nostos Rest (repo `omnaipt/nostos`) | Repo: `C:\dev\stoa-fix2` (worktree, branch `feat/rest-entradas-afinacoes` de `origin/main` e234ac1) | Data: 2026-11-14
Estado: planeado

Origem: teste do David em produção ao sprint 06, com a fatura FA 2026/0412 de um fornecedor novo (Distribuidora Atlântico Oeste). O sprint 06 passou no essencial: embalagens preservadas, bloqueio de registo, criar ingrediente, etiquetas, grafia. Faltam três afinações.

## Objectivo

Numa fatura de um fornecedor novo, um produto que já tem artigo na despensa resolve-se escolhendo esse artigo, com o preço da fatura preenchido e sem propostas para criar artigos repetidos, e a marca proposta é a marca e não um termo de qualidade.

## Fora de scope

Tudo o que não seja os três itens. Sem migrações, sem alterações à edge `parse-invoice`, sem tocar em ficheiros do ramo `feat/stock-s2`. Não correr `supabase`, `vercel` nem `git push`.

## Itens

### 1. Preço ao escolher um artigo existente (achado 14)

Caso real: linha "AZEITE GALLO V.EXTRA 5 LT", 2 UN a 19,90; ingrediente "Azeite virgem extra" (l) já tem o artigo "gallo · Garrafão 5L" (5 l). Ao escolher esse artigo no seletor da linha, as embalagens ficaram em 2 (certo) mas o preço por embalagem ficou vazio.

- [ ] Escolher um artigo existente no seletor preenche o preço por embalagem com o preço unitário da fatura quando a unidade lida é `un`, pela mesma função usada quando o artigo é proposto pela aprendizagem ou criado (`packCostCentsFromInvoice`), sem apagar um preço que o utilizador já tenha escrito.
- [ ] Teste unitário da transição com o caso acima (2 embalagens, 19,90, = 10 l, 3,98 €/l).

### 2. Sugerir o artigo existente em vez de propor um novo (achado 12)

No mesmo caso, o ecrã abriu o formulário "Criar artigo" com conteúdo 5 l em vez de usar o artigo existente com o mesmo conteúdo.

- [ ] Quando a linha não tem artigo por aprendizagem, mas o ingrediente escolhido tem exatamente um artigo ativo com o mesmo conteúdo convertido (por exemplo 5 l, ou 120 g contra 0,12 kg), esse artigo fica pré-escolhido, com embalagens e preço preenchidos, e o formulário de criação não abre. A linha mostra uma nota discreta "Artigo existente sugerido; confirme".
- [ ] Com mais de um artigo compatível, o seletor abre com esses artigos primeiro e o formulário de criação não abre.
- [ ] Sem artigo compatível, mantém-se o comportamento do sprint 06.
- [ ] Ao registar, o alias do fornecedor novo fica ligado ao artigo escolhido, para a fatura seguinte desse fornecedor vir resolvida.

### 3. Marca proposta (achado 13)

Caso real: "AZEITE GALLO V.EXTRA 5 LT" propôs a marca "V.extra".

- [ ] A heurística de marca ignora termos de qualidade e de descrição comuns em faturas (virgem, extra, v.extra, v. extra, ve, gourmet, premium, bio, light, natural, posta, lombo, grosso, fino, branco, carolino, agulha, entre outros do mesmo tipo) e abreviaturas com ponto.
- [ ] Testes com: "AZEITE GALLO V.EXTRA 5 LT" dá Gallo; "AZEITE V.EXTRA GALLO GARRAFAO 5L" dá Gallo; "ATUM RAMIREZ POSTA AZEITE 120 GR" dá Ramirez; "MASSA ESPARGUETE MILANEZA 500G" dá Milaneza; "ARROZ CAROLINO CIGALA 1KG" dá Cigala; "SAL MARINHO GROSSO 1KG" dá marca vazia. Os testes do sprint 06 continuam verdes.
- [ ] O formato "5 LT" é reconhecido como 5 l (e "GR" como g), se ainda não for.

### 4. Fecho

- [ ] `pnpm turbo run typecheck test build --force` verde, resumo em Evidência.
- [ ] Secção curta em `TESTING.md` com o teste manual: fatura 0412 de um fornecedor novo com o azeite resolvido pelo artigo existente.
- [ ] Commits com mensagens começadas por `entradas:`.

## Decisões

- 14-11-2026 (David): sprint 06 validado em produção com a fatura 0412; estas três afinações seguem já.

## Blockers

## Evidência
