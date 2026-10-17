# WhatsApp Dynamic Templates & Active Ticket Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar variáveis dinâmicas (`{saudacao}`, `{chamado}`, `{assunto}`) nos modelos rápidos do WhatsApp Web com sincronização automática do chamado ativo no Assyst multi-abas e edição manual no drawer.

**Architecture:** O script `assyst-alertas.js` detecta quando o analista foca ou clica em uma aba de chamado no Assyst (`cati.tjce.jus.br`) e salva os dados (`chamado`, `assunto`) no `chrome.storage.local` (`cati_active_ticket`). Na aba do WhatsApp Web (`web.whatsapp.com`), o script `whatsapp-templates.js` escuta atualizações do storage, exibe um card de contexto no topo do drawer com badge de status (`🟢 Assyst` / `⚪ Manual`), permite edição direta dos campos pelo analista e processa as variáveis dinâmicas ao inserir a mensagem no chat ou copiar para o clipboard. O formulário de edição de modelos ganha chips de atalho rápido para inserção das tags no cursor.

**Tech Stack:** JavaScript (ES6+ / WebExtensions API Manifest V3), CSS3 (com suporte a tema claro e escuro), Python 3 (scripts de build e verificação automatizada).

**Spec:** Alinhado na sessão de brainstorming — Abordagem 1: Sincronização multi-abas com foco na aba ativa, variáveis `{saudacao}`, `{chamado}` e `{assunto}`, sem inclusão do nome do usuário, com edição manual direta no drawer do WhatsApp e chips de atalho no editor de modelos.

## Global Constraints

- Compatibilidade total com Firefox ESR / Chrome (WebExtensions Manifest V3).
- Armazenamento assíncrono via `chrome.storage.local` sem polling agressivo.
- Sem dependências externas de terceiros (código vanilla limpo e mínimo).
- Nenhuma alteração pode quebrar as funcionalidades existentes do Assyst (contorno vermelho em Edifício/Item B, lembrete de base de conhecimento, botão copiar ficha, banner VIP).
- Todas as mensagens e documentações estritamente em Português.

## Review Focus

1. **Fronteira horária de `{saudacao}`**: Às 11:59 deve retornar `"Bom dia"`; a partir das 12:00 (meio-dia) deve retornar `"Boa tarde"`.
2. **Substituição segura contra caracteres especiais de regex**: Caracteres como `$`, `&` e aspas no assunto não podem ser interpretados como padrões de substituição especiais (`$&`, `$'`) do `String.prototype.replace`.
3. **Campos vazios ou ausência de chamado**: Quando o chamado ou o assunto estiver vazio, substituir por fallbacks descritivos (`[Nº CHAMADO]`, `[ASSUNTO]`) sem disparar exceção nem quebrar o layout.
4. **Insensibilidade a maiúsculas/minúsculas e múltiplas ocorrências**: Tags escritas como `{SAUDACAO}`, `{chamado}` ou `{Assunto}` repetidas mais de uma vez no mesmo modelo devem ser todas substituídas uniformemente.
5. **Sincronização não invasiva no Assyst**: Trocar de abas rapidamente ou focar em abas do Assyst sem chamado aberto não deve sobrescrever indevidamente chamados válidos no storage nem degradar performance do navegador.

---

### Task 1: Motor de Substituição de Variáveis Dinâmicas

**Files:**
- Create: `tests/test_variable_engine.py`
- Modify: `assistente-2n-cati-remoto/src/content/whatsapp-templates.js:15-45`

**Interfaces:**
- Consumes: `texto` (string do modelo), `contexto` (`{ chamado: string, assunto: string }`), `dataReferencia` (opcional, para testes de horário)
- Produces: `processarVariaveis(texto, contexto, dataReferencia) -> string`

- [ ] **Step 1: Write the failing test**

Criar script de teste `tests/test_variable_engine.py` validando os 5 casos de teste críticos:
1. Saudação matutina (< 12h: "Bom dia") e vespertina (>= 12h: "Boa tarde").
2. Substituição de `{chamado}` e `{assunto}` com valores preenchidos.
3. Fallbacks quando `chamado` ou `assunto` forem nulos/vazios (`[Nº CHAMADO]` e `[ASSUNTO]`).
4. Tags case-insensitive e múltiplas ocorrências (`{SAUDACAO}`, `{chamado}`, etc).
5. Assunto contendo caracteres especiais de regex (`$` e `&`) sem substituição corrompida.

- [ ] **Step 2: Run test to verify it fails**

Executar: `python3 tests/test_variable_engine.py`
Esperado: FAIL pois a função `processarVariaveis` ainda não foi implementada / exportada.

- [ ] **Step 3: Implement `processarVariaveis` in `whatsapp-templates.js`**

Implementar a função utilitária com substituição segura via função de callback (`replace(regex, () => valor)` para neutralizar caracteres especiais como `$$` ou `$&`):
```javascript
function resolverSaudacao(data = new Date()) {
  const hora = data.getHours();
  return hora < 12 ? "Bom dia" : "Boa tarde";
}

function processarVariaveis(texto, contexto = {}, dataReferencia = new Date()) {
  if (!texto) return "";
  const saudacao = resolverSaudacao(dataReferencia);
  const chamado = (contexto.chamado || "").trim() || "[Nº CHAMADO]";
  const assunto = (contexto.assunto || "").trim() || "[ASSUNTO]";

  return texto
    .replace(/\{saudacao\}/gi, () => saudacao)
    .replace(/\{chamado\}/gi, () => chamado)
    .replace(/\{assunto\}/gi, () => assunto);
}
```

- [ ] **Step 4: Run test to verify it passes**

Executar: `python3 tests/test_variable_engine.py`
Esperado: PASS (todos os 5 casos de teste validados com sucesso).

---

### Task 2: Captura e Sincronização do Chamado Ativo no Assyst

**Files:**
- Modify: `assistente-2n-cati-remoto/src/content/assyst-alertas.js:255-445`
- Test: `tests/test_assyst_sync.py`

**Interfaces:**
- Consumes: DOM do Assyst (`#contentPaneTitle`, `extrairNumeroChamadoAtivo`, `extrairDadosFichaChamado`)
- Produces: `sincronizarChamadoAtivoStorage() -> Promise<void>` escrevendo em `chrome.storage.local.set({ cati_active_ticket: { chamado, assunto, atualizadoEm } })`

- [ ] **Step 1: Write the failing test**

Criar teste `tests/test_assyst_sync.py` simulando os seletores do DOM do Assyst e testando se a função de extração e o payload de sincronização estão formatados corretamente de acordo com o contrato:
- Extração de chamado limpo (ex: `"245890"`).
- Extração prioritária de `item` e fallback para `resumo`.
- Ignorar valores sentinela como `"-"` ou `"por definir"`.

- [ ] **Step 2: Run test to verify it fails**

Executar: `python3 tests/test_assyst_sync.py`
Esperado: FAIL com funções de extração e sincronização ausentes ou incompletas.

- [ ] **Step 3: Implement `sincronizarChamadoAtivoStorage` in `assyst-alertas.js`**

Implementar em `assyst-alertas.js`:
1. Função `obterDadosChamadoAtivo()` que extrai `chamado` e `assunto` (item de serviço ou resumo).
2. Função `sincronizarChamadoAtivoStorage()` que compara com o último gravado e só atualiza o storage se houver chamado válido diferente ou nova aba focada.
3. Adicionar ouvintes para `window.addEventListener("focus", ...)` e no ciclo de `executarTodasVerificacoes()`.

- [ ] **Step 4: Run test to verify it passes**

Executar: `python3 tests/test_assyst_sync.py`
Esperado: PASS.

---

### Task 3: Card de Contexto do Chamado Ativo no WhatsApp Web

**Files:**
- Modify: `assistente-2n-cati-remoto/src/content/whatsapp-templates.js:120-305`
- Modify: `assistente-2n-cati-remoto/src/content/whatsapp-templates.css:80-260`
- Test: `tests/test_whatsapp_ui.py`

**Interfaces:**
- Consumes: `chrome.storage.local.get("cati_active_ticket")` e `chrome.storage.onChanged`
- Produces: Card de contexto `#cati-wa-active-ticket-card`, inputs `#cati-wa-ticket-num`, `#cati-wa-ticket-subject`, botão `✕ Limpar`, badge de status (`🟢 Assyst` / `⚪ Manual`), integração com botões "Inserir no Chat" e "Copiar" resolvendo variáveis em tempo real.

- [ ] **Step 1: Write the failing test**

Criar `tests/test_whatsapp_ui.py` para validar a renderização da estrutura HTML do card de chamado ativo, a persistência de estado local ao digitar manualmente e o disparo correto de `processarVariaveis` ao acionar cópia ou inserção.

- [ ] **Step 2: Run test to verify it fails**

Executar: `python3 tests/test_whatsapp_ui.py`
Esperado: FAIL.

- [ ] **Step 3: Implement Card de Contexto e Eventos em `whatsapp-templates.js` e CSS**

1. Em `whatsapp-templates.js`:
   - Estado `activeTicketContext = { chamado: "", assunto: "", origem: "manual" }`.
   - Monitorar `chrome.storage.onChanged` para atualizar `activeTicketContext` e os campos do card quando uma nova aba for selecionada no Assyst.
   - Renderizar no topo do drawer (logo abaixo do header) o card `#cati-wa-active-ticket-card` com:
     - Badge `.cati-wa-badge` exibindo `🟢 Assyst` ou `⚪ Manual`.
     - Inputs `#cati-wa-ticket-num` e `#cati-wa-ticket-subject` com ouvinte de digitação (`input`) que atualiza `activeTicketContext` e muda badge para `⚪ Manual`.
     - Botão `#cati-wa-ticket-clear` (`✕ Limpar`) que limpa os inputs e redefine o estado.
   - Atualizar manipuladores de clique dos cards de modelo:
     - "💬 Inserir no Chat": chama `processarVariaveis(tpl.text, activeTicketContext)` antes de enviar para `inserirMensagemNoChat`.
     - "📋 Copiar": chama `processarVariaveis(tpl.text, activeTicketContext)` antes de `navigator.clipboard.writeText`.
2. Em `whatsapp-templates.css`:
   - Estilos para `#cati-wa-active-ticket-card`, campos de input compactos, badges `🟢 Assyst` e `⚪ Manual`, botão de limpar e adaptação em tema escuro (`body.dark`).

- [ ] **Step 4: Run test to verify it passes**

Executar: `python3 tests/test_whatsapp_ui.py`
Esperado: PASS.

---

### Task 4: Chips de Atalho no Editor de Modelos e Modelos Padrão

**Files:**
- Modify: `assistente-2n-cati-remoto/src/content/whatsapp-templates.js:8-15, 190-230, 310-340`
- Modify: `assistente-2n-cati-remoto/src/content/whatsapp-templates.css:200-260`
- Test: `tests/test_template_editor.py`

**Interfaces:**
- Consumes: Elemento textarea `#cati-wa-input-text`
- Produces: Chips interativos `[+ {saudacao}]`, `[+ {chamado}]`, `[+ {assunto}]` que inserem a respectiva tag na posição atual do cursor; modelos padrão atualizados com as variáveis dinâmicas.

- [ ] **Step 1: Write the failing test**

Criar teste `tests/test_template_editor.py` validando:
1. Inserção de texto na posição do cursor / seleção usando `setRangeText`.
2. Presença dos chips de tags na estrutura do formulário de criação/edição.
3. Modelos padrão `DEFAULT_TEMPLATES` utilizando tags `{saudacao}`, `{chamado}`, `{assunto}`.

- [ ] **Step 2: Run test to verify it fails**

Executar: `python3 tests/test_template_editor.py`
Esperado: FAIL.

- [ ] **Step 3: Implement Chips e Modelos Padrão**

1. Em `whatsapp-templates.js`:
   - Atualizar `DEFAULT_TEMPLATES` para demonstrar o uso das variáveis:
     `"{saudacao}! Meu nome é NOME. Sou Técnico(a) da CATI do TJCE e estou entrando em contato referente ao chamado #{chamado} ({assunto}). Podemos verificar remotamente?"`
   - Adicionar barra de chips `#cati-wa-tag-chips` acima da textarea no formulário com botões:
     - `+ {saudacao}`
     - `+ {chamado}`
     - `+ {assunto}`
   - Função utilitária `inserirTagNaTextarea(tag)` que utiliza `textarea.setRangeText(tag, textarea.selectionStart, textarea.selectionEnd, 'end')` e devolve o foco para a textarea.
2. Em `whatsapp-templates.css`:
   - Estilização moderna dos chips com estilo pílula, transição suave no hover e contraste adequado nos modos claro e escuro.

- [ ] **Step 4: Run test to verify it passes**

Executar: `python3 tests/test_template_editor.py`
Esperado: PASS.

---

### Task 5: Empacotamento, Build e Verificação Final

**Files:**
- Modify: `assistente-2n-cati-remoto/manifest.json` (se version bump necessário)
- Output: `assistente-2n-cati-remoto.xpi`, `codigo-fonte-assistente-2n.zip`
- Test: `tests/test_build_package.py`

**Interfaces:**
- Consumes: Arquivos em `assistente-2n-cati-remoto/`
- Produces: Pacotes `.xpi` e `.zip` íntegros e sincronizados na raiz do workspace.

- [ ] **Step 1: Run comprehensive test suite**

Executar:
```bash
python3 -m unittest discover -s tests -p "test_*.py"
```
Esperado: Todos os testes de unidade e integração aprovados sem erros.

- [ ] **Step 2: Run `build.py` and package artifacts**

Executar:
```bash
cd assistente-2n-cati-remoto && python3 build.py && cd ..
zip -r -q codigo-fonte-assistente-2n.zip assistente-2n-cati-remoto -x "*.xpi" "*.zip" "*__pycache__*"
cp assistente-2n-cati-remoto/assistente-2n-cati-remoto.xpi ./
```

- [ ] **Step 3: Verify package integrity**

Validar conteúdo dos arquivos gerados via script de verificação:
```bash
python3 tests/test_build_package.py
```
Esperado: Arquivos `.xpi` e `.zip` contendo os novos arquivos JS e CSS sem corrupção e com manifest válido.
