# Assyst Downtime & Outage Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o subsistema de rastreamento de instabilidades e quedas do Assyst com cronômetro em tempo real, geração automática de comprovante técnico para SLA e relatório diário para a supervisão.

**Architecture:** Módulo desacoplado de content script (`assyst-downtime.js` e `assyst-downtime.css`) que detecta rotas de logout e erros de licença, persiste o incidente ativo em `chrome.storage.local`, exibe cronômetro ao vivo durante a queda, detecta retorno no `application.do` e integra o histórico no popup da extensão.

**Tech Stack:** Vanilla JavaScript (ES6+), WebExtensions Manifest V3 (`chrome.storage.local`), CSS3, Python unittest (TDD).

**Spec:** `docs/superpowers/specs/2026-10-16-assyst-downtime-tracker-design.md`

## Global Constraints
- Isolamento estrito de domínio sob `https://cati.tjce.jus.br/*`.
- Vanilla JavaScript puro, sem bibliotecas pesadas e sem interferir na thread principal do Assyst.
- Nomes de classes e IDs isolados com prefixo `cati-downtime-` para evitar colisões com widgets Dojo/Dijit.
- Preservação estrita dos 54 testes unitários existentes.

## Review Focus
- A contagem de tempo NÃO pode reiniciar se o usuário atualizar a página (F5) ou clicar em "Voltar" enquanto o Assyst continuar fora do ar.
- Chamados de fechamento de incidente não podem apagar o histórico diário anterior.
- Histórico limitado a 30 registros com rotação automática FIFO para evitar consumo excessivo de storage.
- A detecção de retorno ao ar deve ignorar páginas de erro intermediárias e só disparar quando a aplicação estiver autenticada.
- O texto do comprovante deve suportar caracteres especiais sem falhas de encoding.

---

### Task 1: Núcleo de Lógica, Máquina de Estados e Formatação de Textos

**Files:**
- Create: `tests/test_assyst_downtime.py`
- Create: `assistente-2n-cati-remoto/src/content/assyst-downtime.js`

**Interfaces:**
- Produces:
  - `detectarQuedaAssyst(url: string, domText: string) -> { caiu: boolean, motivo: string }`
  - `detectarRestabelecimento(url: string, dom: object) -> boolean`
  - `formatarDuracao(duracaoMs: number) -> { formatada: string, minutos: number }`
  - `gerarTextoComprovante(incidente: object) -> string`
  - `gerarRelatorioConsolidado(historico: Array, dataRef: Date) -> string`
  - `iniciarIncidenteStorage(motivo: string, agora: Date, storageApi: object) -> Promise<object>`
  - `finalizarIncidenteStorage(agora: Date, storageApi: object) -> Promise<object>`

- [ ] **Step 1: Escrever teste falhando para as funções de detecção e formatação**
  - Casos: URL `logout.do?dispatch=prepare&sessionInvalid=true` -> caiu = true, motivo "Sessão Expirada / Queda de Acesso".
  - Casos: texto "Todas as licenças estão em uso" -> caiu = true, motivo "Falta de Licenças Disponíveis".
  - Casos: URL `application.do` com grade -> restabelecido = true.
  - Casos: formatação de 1103000ms -> "18m 23s", 18 minutos.
  - Casos: texto de comprovante individual contendo cabeçalho, data, início, fim, duração e equipe 2N.
  - Casos: relatório consolidado somando quedas do dia.

- [ ] **Step 2: Executar teste para verificar que falha (Red)**
  - Comando: `python3 -m unittest tests/test_assyst_downtime.py`
  - Esperado: Falha pois `assyst-downtime.js` ainda não existe.

- [ ] **Step 3: Implementar funções lógicas em `src/content/assyst-downtime.js`**
  - Implementar lógica pura e exportar para `window.__catiDowntimeEngine`.

- [ ] **Step 4: Executar teste para verificar que passa (Green)**
  - Comando: `python3 -m unittest tests/test_assyst_downtime.py`
  - Esperado: Passar com sucesso.

- [ ] **Step 5: Verificação de regressão**
  - Comando: `python3 -m unittest discover -s tests -p "test_*.py"`

---

### Task 2: Interface em Tela (Cronômetro na Queda e Modal de Restabelecimento) e CSS

**Files:**
- Create: `assistente-2n-cati-remoto/src/content/assyst-downtime.css`
- Modify: `assistente-2n-cati-remoto/src/content/assyst-downtime.js`
- Test: `tests/test_assyst_downtime.py`

**Interfaces:**
- Consumes: funções de Task 1.
- Produces:
  - `renderizarBannerQuedaAtiva(incidente: object)`
  - `atualizarCronometroAoVivo(inicioTimestamp: number)`
  - `renderizarModalRestabelecimento(incidenteFinalizado: object)`
  - `removerBannerQueda()`

- [ ] **Step 1: Escrever testes unitários para injeção de DOM e ciclo do cronômetro**
  - Testar presença dos seletores `#cati-downtime-banner`, `#cati-downtime-chrono`, `#cati-downtime-modal-restabelecido`.
  - Testar disparo do botão `Copiar Comprovante de SLA`.

- [ ] **Step 2: Executar teste para confirmar falha (Red)**
  - Comando: `python3 -m unittest tests/test_assyst_downtime.py`

- [ ] **Step 3: Implementar `assyst-downtime.css` e componentes visuais no JS**
  - Banner fixado na tela de erro/logout com fundo âmbar/escuro e cronômetro em tempo real.
  - Modal verde sucesso pós-login com botão `[📋 Copiar Comprovante de SLA]`.

- [ ] **Step 4: Executar testes para verificar que passam (Green)**
  - Comando: `python3 -m unittest tests/test_assyst_downtime.py`

---

### Task 3: Registro no Manifesto e Build da Extensão

**Files:**
- Modify: `assistente-2n-cati-remoto/manifest.json`
- Test: `tests/test_build_package.py`

**Interfaces:**
- Adiciona `src/content/assyst-downtime.js` e `src/content/assyst-downtime.css` em `content_scripts` para `https://cati.tjce.jus.br/*`.

- [ ] **Step 1: Escrever teste de integridade do manifesto para o downtime tracker**
  - Verificar que o manifesto inclui os novos scripts e folhas de estilo.

- [ ] **Step 2: Atualizar `manifest.json`**
  - Registrar os novos arquivos em `content_scripts`.

- [ ] **Step 3: Executar testes de build do pacote**
  - Comando: `python3 -m unittest tests/test_build_package.py`
  - Esperado: Passar e confirmar inclusão dos arquivos.

---

### Task 4: Seção de Quedas do Assyst no Popup da Extensão

**Files:**
- Modify: `assistente-2n-cati-remoto/src/popup/popup.html`
- Modify: `assistente-2n-cati-remoto/src/popup/popup.css`
- Modify: `assistente-2n-cati-remoto/src/popup/popup.js`
- Test: `tests/test_assyst_downtime.py`

**Interfaces:**
- Consumes: `cati_downtime_history` do storage.
- Produces:
  - Card de resumo diário no popup: `Hoje: X quedas • Total: Y min`.
  - Botão `[📊 Copiar Relatório Consolidado para Gestão]`.

- [ ] **Step 1: Escrever teste para renderização da seção de quedas no popup**
  - Verificar que o HTML contém `#cati-downtime-summary` e botão de cópia de relatório.
  - Testar que o popup renderiza eventos do dia filtrados por data atual.

- [ ] **Step 2: Executar teste para verificar falha (Red)**
  - Comando: `python3 -m unittest tests/test_assyst_downtime.py`

- [ ] **Step 3: Implementar HTML, CSS e controlador JS do popup**
  - Adicionar card com contagem e lista sanfonada/recolhível das interrupções do dia.
  - Adicionar botão de copiar relatório diário formatado.

- [ ] **Step 4: Executar teste para verificar sucesso (Green)**
  - Comando: `python3 -m unittest tests/test_assyst_downtime.py`

---

### Task 5: Validação Completa, Compilação e Atualização de Documentação

**Files:**
- Modify: `assistente-2n-cati-remoto/DOCUMENTACAO.md`
- Modify: `resumo-de-utilizacao.md`
- Modify: `handoff.md`
- Output: `assistente-2n-cati-remoto.xpi` e `codigo-fonte-assistente-2n.zip`

- [ ] **Step 1: Executar toda a suíte de testes do repositório**
  - Comando: `python3 -m unittest discover -s tests -p "test_*.py" -v`
  - Esperado: Todos os testes passando (100% verde).

- [ ] **Step 2: Recompilar pacotes de distribuição**
  - Comandos:
    ```bash
    python3 assistente-2n-cati-remoto/build.py
    cp assistente-2n-cati-remoto/assistente-2n-cati-remoto.xpi ./assistente-2n-cati-remoto.xpi
    zip -qr -FS ./codigo-fonte-assistente-2n.zip assistente-2n-cati-remoto/
    ```

- [ ] **Step 3: Atualizar documentações e handoff**
  - Atualizar `assistente-2n-cati-remoto/DOCUMENTACAO.md`, `resumo-de-utilizacao.md` e `handoff.md`.
