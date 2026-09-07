# Spec: Módulo HACCP no Nostos (vertical Restaurantes)

**Autor:** Sofia (PO)
**Data:** 02-08-2026
**Estado:** Draft para validação do David. **Não aprovado para desenvolvimento.**
**Produto:** Nostos (OMNAI), vertical Restaurantes
**Documento-base:** `HACCP_Restauracao_PT_e_Modulo_Nostos.md` (02-08-2026)
**Coordenação necessária:** Marco (modelo de dados, RLS, storage), Zé (UX de registo em cozinha), Beatriz (RGPD art. 9.º, termos de responsabilidade), Tiago (validação de dor nos pilotos)

---

## 0. Aviso de scope antes de tudo

Esta spec descreve **o que se constrói se e quando se decidir construir**. Não é um pedido de sprint.

O documento-base recomenda expressamente não construir agora, por três razões que continuam válidas à data desta spec: o PR #17 continua a bloquear reservas reais, nenhum dos dois pilotos tem uso real de reservas, e a hipótese comercial central não está testada. Esta spec existe para que, quando o gate abrir, o trabalho arranque em horas e não em semanas, e para que o Gate 0 seja feito com as perguntas certas.

**Sequência obrigatória:** Gate 0 (validação, custo zero) → decisão do David → Gate 1 (MVP) → medição → Gate 2.

---

## 1. Hipótese

> **Acreditamos que** um módulo de registos HACCP integrado no Nostos **vai** aumentar a retenção da vertical Restaurantes e permitir um upsell de 15 a 20 €/mês, **porque** o Nostos já é aberto diariamente na operação e os concorrentes de HACCP têm de conquistar esse hábito do zero, **medido por** taxa de preenchimento diário dos registos ao fim de 60 dias e por taxa de conversão da base existente para o módulo.

**Hipótese subjacente que é a mais frágil e tem de ser testada primeiro:** quem compra software de reservas compra HACCP ao mesmo fornecedor. São compradores e gatilhos diferentes (receita versus medo de inspecção) e a decisão de HACCP está frequentemente já tomada, com um consultor em avença.

**Critério de refutação:** se nos dois pilotos a resposta for "temos um consultor que trata disso e está resolvido", a hipótese cai e o módulo não se faz nesta forma. Passa a fazer sentido, quando muito, como funcionalidade de canal para consultores, que é outro produto.

---

## 2. Gate 0: validação sem escrever código

Executar nas visitas de configuração de mesas e turnos ao Saloio e ao Rochedo, que já estão previstas. Custo: zero dias de dev.

**Perguntas obrigatórias (a fazer ao dono ou ao chefe de cozinha, não por email):**

1. Mostre-me onde estão os registos HACCP. (Observar: papel, Excel, app. Fotografar a pasta.)
2. Quanto pagam por mês a quem trata disso, e a quem? Consultor, empresa de pragas, avença de SST?
3. Já tiveram inspecção da ASAE? Quando? O que foi pedido? O que correu mal?
4. Quem preenche os registos, e quando durante o dia?
5. Se eu vos desse isto no telemóvel, quem é que o usaria de facto?

**Exercício complementar, uma tarde:** correr a Ficha Técnica de Fiscalização da ASAE (Ed. 4, 05/05/2022, pública, 24 páginas) num dos pilotos. Produz ao mesmo tempo o diagnóstico real de um cliente e a spec funcional derivada da realidade em vez de derivada dos concorrentes.

**Critérios de go para o Gate 1 (todos necessários):**

- Pelo menos um dos dois pilotos com reservas em uso real e continuado;
- Pelo menos um dos dois pilotos a demonstrar dor real e não resolvida nos registos (registos em papel incompletos, ou preenchidos em bloco, ou consultor que só aparece de três em três meses);
- David a validar o pricing indicativo de 15 a 20 €/mês de módulo, ou bundle a 59 € que substitui os 39 € actuais.

---

## 3. Goals e Non-goals

### Goals

- G1. Permitir que um restaurante produza, sem papel, os registos que a ASAE verifica nominalmente na sua Ficha Técnica de Fiscalização.
- G2. Tornar impossível, por desenho, o padrão que a ASAE identifica como bandeira vermelha: registos preenchidos retroactivamente, valores sempre iguais, desvios sem acção correctiva.
- G3. Entregar, em menos de 30 segundos e a partir do telemóvel, um PDF apresentável a um inspector.
- G4. Ancorar os registos ao **turno**, reutilizando o modelo de dados que já existe para reservas.

### Non-goals (Gate 1)

- NG1. Gerar o plano ou o manual HACCP. É o que cria exposição de responsabilidade e exige validação técnica humana.
- NG2. Sensores IoT ou qualquer hardware.
- NG3. Portal multi-cliente para consultores.
- NG4. Matriz exaustiva de alergénios por prato, gestão de fichas técnicas ou custeio.
- NG5. Gestão de formação e arquivo de fichas de aptidão médica.
- NG6. Análises laboratoriais e gestão de fornecedores.
- NG7. Qualquer funcionalidade que faça o Nostos afirmar ou sugerir que garante a conformidade do cliente.

**Nota sobre NG3:** embora fora de scope no Gate 1, a decisão de arquitectura tem de ser tomada agora. Ver ponto 7.

---

## 4. Épicos e user stories

Prioridade RICE indicativa. Reach = fracção da base de restaurantes; Impact 0,25 a 3; Confidence em percentagem; Effort em dias-pessoa.

### Épico A. Registos de temperatura ancorados ao turno

**A1. Configurar pontos de controlo de temperatura**
*Como* gerente de restaurante, *quero* declarar os meus equipamentos de frio e de quente, *para que* o sistema saiba o que tem de ser verificado.

Critérios de aceitação:
- Posso criar pontos de controlo com nome livre, tipo (frio positivo, congelação, manutenção a quente, expositor) e limite mínimo e máximo;
- O sistema propõe limites por defeito conforme o tipo, editáveis: frio positivo 0 a 5 °C, congelação ≤ -18 °C, manutenção a quente ≥ 63 °C;
- Cada ponto de controlo pode ser associado a um ou mais turnos existentes, ou a todos;
- Os limites por defeito têm um link para a origem (guia da DGAV ou AHRESP), para o gerente perceber de onde vem o número;
- Um ponto de controlo desactivado deixa de gerar tarefas mas mantém o histórico.

RICE: R 1,0 · I 2 · C 90% · E 2 → **0,90**

**A2. Registar temperatura no turno**
*Como* colaborador de cozinha, *quero* registar a temperatura em dois toques, *para que* não me atrase no serviço.

Critérios de aceitação:
- A lista de pontos por verificar aparece automaticamente quando o turno abre, na `service_date` calculada no fuso do restaurante (dependência do PR #17);
- O registo guarda valor, **timestamp de servidor**, utilizador autenticado e turno;
- O timestamp de servidor não é editável pelo utilizador, em nenhuma circunstância;
- Se o valor estiver fora dos limites, o registo não fica completo sem acção correctiva associada (ver C1);
- Funciona offline com sincronização posterior, marcando o registo como "sincronizado em diferido" e preservando o instante local de captura **e** o de sincronização, ambos visíveis;
- Um registo não pode ser criado com data anterior ao turno em curso. Registos em falta ficam explicitamente marcados como em falta e **não são recuperáveis a posteriori**.

RICE: R 1,0 · I 3 · C 85% · E 5 → **0,51**

> **Decisão de produto a validar com o David.** O último critério é a decisão mais consequente de toda a spec. Impedir o preenchimento retroactivo é o que dá valor probatório ao sistema e é o diferenciador face aos concorrentes. Também vai gerar atrito e reclamações ("esqueci-me ontem, deixa-me pôr agora"). Se cedermos aqui, o produto passa a ser papel digitalizado e perde o argumento de venda. Recomendo manter, com um relatório de lacunas visível ao gerente em vez de permitir preenchimento tardio.

**A3. Ver o estado do turno**
*Como* gerente, *quero* ver de relance o que foi e não foi registado, *para que* possa corrigir no próprio dia.

Critérios de aceitação:
- Vista por turno com estado: por verificar, conforme, desvio em aberto, desvio resolvido, em falta;
- Vista mensal por ponto de controlo com os valores, evidenciando variabilidade;
- Alerta ao gerente quando um turno fecha com registos em falta.

RICE: R 1,0 · I 1,5 · C 90% · E 3 → **0,45**

### Épico B. Recepção de matérias-primas

**B1. Registar entrega**
*Como* quem recebe a mercadoria, *quero* registar a entrega em segundos, *para que* fique prova de que a recepção foi controlada.

Critérios de aceitação:
- Campos: fornecedor, data, temperatura à chegada quando aplicável, verificação de validade, verificação de estado da embalagem, conformidade sim ou não;
- Fotografia opcional do rótulo ou da guia, o que satisfaz a rastreabilidade "um passo atrás" do art. 18.º do Reg. 178/2002;
- Fornecedor é uma entidade reutilizável do tenant, não texto livre.

**B2. Registar recusa**
*Como* gerente, *quero* registar quando recuso mercadoria, *para que* tenha prova de que o sistema funciona.

Critérios de aceitação:
- Causa tipificada segundo a Ficha 4 do guia da DGAV: higiene deficiente, requisitos de embalagem, validade ultrapassada, temperatura insuficiente, características organolépticas inadequadas;
- Contagem de reincidência por fornecedor, visível na ficha do fornecedor;
- A recusa aparece com destaque na exportação para inspecção.

> **Racional a não perder de vista:** um dossiê sem uma única recusa em anos é, para um auditor, sinal de que ninguém verifica nada. Esta funcionalidade parece secundária e é das que mais reforça a credibilidade do dossiê.

RICE (B1+B2): R 0,9 · I 2 · C 80% · E 4 → **0,36**

### Épico C. Não conformidades e acções correctivas

**C1. Acção correctiva obrigatória**
*Como* responsável, *quero* que o sistema me obrigue a dizer o que fiz quando algo correu mal, *para que* o desvio não fique registado sem resposta.

Critérios de aceitação:
- Disparada automaticamente por qualquer valor fora de limites ou recusa de matéria-prima, e criável manualmente;
- Campos mínimos: o que aconteceu, valor medido face ao limite, **destino do produto**, acção imediata, acção sobre a causa, quem executou;
- Campo separado de verificação de eficácia, preenchível depois por outro utilizador;
- Uma não conformidade em aberto há mais de 48 horas gera alerta ao gerente;
- O registo de origem fica marcado como "desvio sem resposta" enquanto a acção não existir.

RICE: R 1,0 · I 3 · C 85% · E 4 → **0,64**

### Épico D. Diário de turno, modelo Safer Food Better Business

**D1. Verificações de abertura e fecho**
*Como* chefe de turno, *quero* uma lista curta de verificações, *para que* seja realista preencher todos os dias.

Critérios de aceitação:
- Máximo de 8 itens por verificação, configuráveis por restaurante a partir de um conjunto pré-definido;
- Campo aberto obrigatório "algo fora do normal hoje?", que aceita "nada a assinalar" mas exige acção deliberada;
- Assinatura nominal por utilizador autenticado, sem assinatura manuscrita;
- Revisão de quatro em quatro semanas, com o sistema a apresentar os problemas recorrentes do período.

> Esta é a arquitectura da FSA britânica e é deliberadamente mais leve do que o dossiê português de folhas de temperatura. Um produto que peça vinte campos por dia é preenchido a mentir e não protege ninguém.

RICE: R 1,0 · I 2 · C 75% · E 4 → **0,38**

### Épico E. Exportação para inspecção

**E1. Dossiê em PDF**
*Como* gerente com um inspector à frente, *quero* gerar o dossiê de um período, *para que* possa apresentá-lo imediatamente.

Critérios de aceitação:
- Selecção de intervalo de datas, geração em menos de 30 segundos, partilha por email ou download;
- Inclui: registos de temperatura com timestamps, recepções e recusas, não conformidades com acções correctivas e verificação, diários de turno assinados, e um sumário de conformidade do período;
- Marca visivelmente os registos em falta. **Não os esconde.** Um dossiê que finge estar completo é pior do que um dossiê honesto com lacunas;
- Rodapé com identificação do estabelecimento, período e data de geração;
- Acessível a partir do telemóvel em três toques a partir do ecrã inicial.

RICE: R 1,0 · I 3 · C 90% · E 4 → **0,68**

**Ordem de construção recomendada por RICE e dependências:** A1 → A2 → E1 → C1 → A3 → D1 → B1/B2.

---

## 5. Os três ganchos que justificam o bundle

Sem estes, isto é um clone do iTSEapp a competir por preço num mercado que já tem cinco players portugueses entre 22,50 e 129 €/mês. Com estes, é um produto que os concorrentes não conseguem copiar sem construir um sistema de reservas.

### Gancho 1: turno como unidade de registo (dentro do Gate 1)

Nenhum software de HACCP tem noção de turno. Pedem "registo diário" e o restaurante preenche uma folha por dia, tipicamente ao fim do dia, tipicamente a inventar. O Nostos já tem `turns` configuráveis com `weekdays`, e já resolve a `service_date` no fuso do restaurante. O PCC 7 do guia da DGAV pede aliás verificação de duas em duas horas no banho-maria, o que só faz sentido dentro de um turno.

Custo de implementação: quase nulo, porque a primitiva já existe. Valor de diferenciação: alto. É o gancho com melhor rácio e por isso está no Gate 1.

### Gancho 2: alergénios ligados à reserva (Gate 2, com dependência legal)

É a intersecção genuína, e não existe no mercado: os concorrentes de HACCP têm a matriz alergénios/prato mas não sabem quem vem jantar; os concorrentes de reservas sabem quem vem mas não têm a matriz.

**Bloqueador legal, não técnico.** Uma alergia alimentar é dado relativo à saúde, categoria especial do artigo 9.º do RGPD. Não é um campo de texto acrescentado à tabela `customers`. Requer, no mínimo: base legal identificada (previsivelmente consentimento explícito no acto da reserva), minimização, prazo de conservação curto e distinto do prazo dos registos operacionais, e provavelmente entrada no registo de actividades de tratamento e revisão do DPA B2B. **Esta análise é da Beatriz e tem de estar fechada antes de o Marco tocar no schema**, porque a decisão de armazenamento (campo cifrado, tabela separada, retenção autónoma) depende dela.

Como funcionalidade, o valor legal é duplo e é vendável: cumpre o artigo 44.º do Reg. 1169/2011 (informação de alergénios em não pré-embalados) e apoia o Capítulo IX ponto 9 do Anexo II do Reg. 852/2004 (separação e limpeza de equipamento).

### Gancho 3: rastreabilidade a jusante em incidente (Gate 3, ou nunca)

O artigo 19.º do Reg. 178/2002 obriga a informar os consumidores de forma efectiva quando um alimento não seguro chegou ao consumidor final. Um restaurante normal não consegue cumprir isto: não sabe quem lá esteve. Um restaurante com o Nostos sabe exactamente quem jantou num turno, com telefone.

Combinado com amostra-testemunha guardada, dá capacidade de gestão de incidente que nenhum software de HACCP puro oferece.

**Duas ressalvas honestas.** Primeira: é a funcionalidade mais forte em demonstração comercial e a menos usada na prática, porque o evento é raro. Segunda: implica comunicação em massa a clientes sobre um incidente alimentar, o que é uma decisão com consequências jurídicas e reputacionais graves para o restaurante. O produto deve **preparar** a lista e o rascunho, nunca disparar comunicação automaticamente. Requer também análise da Beatriz quanto à finalidade do tratamento, que não é a finalidade original da reserva.

---

## 6. Métricas de sucesso

### Métricas de activação (60 dias após lançamento a um cliente)

| Métrica | Alvo | Falha |
|---|---|---|
| Taxa de preenchimento diário dos registos obrigatórios | > 70% dos dias | < 40% |
| Clientes com pelo menos um registo em cada um dos últimos 7 dias | > 60% | < 30% |
| Não conformidades registadas com acção correctiva completa | > 80% | < 50% |
| Exportações de dossiê geradas por cliente por mês | ≥ 1 | 0 |

### Métricas de negócio (Gate 2, 90 dias)

| Métrica | Alvo |
|---|---|
| Conversão da base de reservas para o módulo | > 40% |
| Aumento de ARPU na vertical Restaurantes | +25% a +50% |
| Churn da coorte com módulo versus coorte sem módulo | Diferença negativa mensurável |

### Anti-métrica, e é a que interessa mais

**Registos criados em bloco no mesmo minuto.** Se aparecerem, o produto está a ser usado como papel digitalizado e falhou no seu objectivo central, mesmo que a taxa de preenchimento esteja alta. Instrumentar desde o dia um: distribuição temporal dos registos dentro do turno, e alerta interno se mais de X registos de um cliente forem criados na mesma janela de dois minutos.

---

## 7. Decisões de arquitectura que não podem ser adiadas

Estas são para o Marco e têm de ser decididas **antes** da primeira migração, porque são caras de reverter.

1. **Multi-cliente para consultores.** Se o portal de consultores (Gate 3) for uma possibilidade séria, o modelo tem de suportar um utilizador com acesso a N tenants desde já. Acrescentar depois implica refazer RLS e o modelo de sessão. O iTSEapp e o MyTASK já sinalizam consultores como segmento, o que sugere que é o caminho de menor atrito no mercado português. **Recomendo decidir que sim e preparar o modelo, mesmo sem construir o portal.**
2. **Imutabilidade dos registos.** Um registo de temperatura nunca deve ser alterado nem apagado. Correcções fazem-se por registo de rectificação encadeado, com o original preservado e visível. Isto é o que dá valor probatório e não é retrofit.
3. **Timestamps de servidor, sempre.** Nunca confiar no relógio do dispositivo. No modo offline, guardar os dois instantes e apresentar ambos.
4. **Retenção.** O prazo legal é "período adequado", não quantificado. Recomendação do documento-base: dois anos, com a justificação escrita dentro do próprio sistema, o que é precisamente o que torna a escolha defensável. Implica política de retenção configurável e, para os dados de alergénios, retenção autónoma e mais curta.
5. **Storage de fotografias.** Fotos de rótulos e guias crescem depressa. Definir limite por tenant e política de compressão antes do primeiro cliente, não depois.

---

## 8. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Hipótese comercial falsa: quem compra reservas não compra HACCP | **Média-alta** | Crítico | Gate 0 antes de qualquer código. É todo o propósito do gate |
| Dispersão: segundo domínio funcional antes de o primeiro ter uso real | **Alta** | Alto | Gate 1 bloqueado até haver pilotos com reservas em uso continuado |
| Atrito da imutabilidade leva a rejeição pelo utilizador | Média | Alto | Testar com o chefe de cozinha do piloto antes de generalizar. Não ceder sem dados |
| Responsabilidade imputada ao produto após suspensão de um cliente | Média | Alto | Termos claros (Beatriz); nunca afirmar garantia de conformidade; NG7 é inegociável |
| RGPD art. 9.º nos alergénios | Média | Alto | Análise da Beatriz **antes** do schema. Gancho 2 fica bloqueado até lá |
| Compressão de preço face aos 22,50 €/mês do iTSEapp | Alta | Médio | Vender integração e retenção, não preço. O tecto está definido pela concorrência |
| Concorrente de POS integra HACCP primeiro | Baixa-média | Médio | O WinRest 360 já tem, mas só temperaturas. Janela existe, não é infinita |

---

## 9. Estimativa indicativa

Não é compromisso. Depende da confirmação do Marco.

| Fase | Scope | Effort |
|---|---|---|
| Gate 0 | Validação nos pilotos, zero código | 2 tardes do David |
| Gate 1 MVP | Épicos A, C, E (+ B se o effort permitir) | 15 a 20 dias-pessoa backend e frontend |
| Medição | 60 dias de uso real antes de qualquer decisão | 0 |
| Gate 2 | Épico D, gancho 2 (alergénios), pricing definitivo | A estimar após medição |

---

## 10. Coordenação

- **David:** decisão do Gate 0, decisão sobre imutabilidade de registos (ponto A2), pricing.
- **Beatriz:** análise RGPD art. 9.º para alergénios, termos de limitação de responsabilidade, revisão do DPA B2B. **Bloqueia o gancho 2.**
- **Marco:** validar as cinco decisões de arquitectura do ponto 7, estimar o MVP, confirmar que o PR #17 fecha a questão do fuso para efeitos de `service_date` dos registos.
- **Zé:** UX de registo em cozinha com uma mão, luvas e pressa. É o factor que determina se a taxa de preenchimento fica acima ou abaixo dos 40%.
- **Tiago:** conduzir as perguntas do Gate 0 nas visitas ao Saloio e ao Rochedo.

---

## Anexo. Rastreio obrigação legal → funcionalidade

| Fonte | Obrigação | Funcionalidade |
|---|---|---|
| FTF ASAE 7.8.2 | Controlo e registo **diário** da manutenção a quente | A1, A2 |
| FTF ASAE 7.8.6 | Registo "fiável, verificável e adequado" de todos os equipamentos de frio | A1, A2 |
| FTF ASAE 7.8.3 e 7.8.9 | Acções correctivas para desvios e avarias | C1 |
| FTF ASAE 7.12.1 | Controlo na recepção | B1 |
| FTF ASAE 7.13.1 · Reg. 178/2002 art. 18.º | Rastreabilidade "um passo atrás" | B1, fotografia de guia |
| FTF ASAE 7.19.2 · Reg. 852/2004 art. 5.º n.º 4 b) | Documentos actualizados | Data de revisão e alerta (Gate 2) |
| FTF ASAE 7.19.3 · art. 5.º n.º 4 c) | Conservação por período adequado | Política de retenção, ponto 7.4 |
| Reg. 852/2004 art. 5.º n.º 4 a) | Fornecer prova à autoridade | E1 |
| Reg. 852/2004 Anexo II Cap. XI-A | Cultura de segurança dos alimentos | D1 (evidência de briefings e revisão periódica) |
| Reg. 1169/2011 art. 44.º · DL 26/2016 | Alergénios em suporte material | Gancho 2 (Gate 2) |
| Reg. 178/2002 art. 19.º | Informação aos consumidores em incidente | Gancho 3 (Gate 3) |
| Portaria 1135/95 | Óleos: 180 °C e 25% de compostos polares | Ponto de controlo do tipo óleo (Gate 2) |

**Nota:** o módulo cobre registos e prova. **Não cobre** o estudo HACCP, a análise de perigos nem a determinação de PCC, que são o que os artigos 5.º n.º 2 alíneas a) e b) exigem. Um cliente que use só o Nostos continua a precisar do plano. Isto tem de estar explícito no material comercial, sob pena de vendermos conformidade que não entregamos.
