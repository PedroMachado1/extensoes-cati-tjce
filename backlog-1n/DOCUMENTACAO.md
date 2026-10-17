# 📖 Documentação Técnica e Guia de Integração — Backlog 1N CATI

> **Extensão:** Backlog 1N CATI — Aguardando Info (7+ Dias)  
> **Versão:** 1.0.1  
> **Público-alvo:** Analistas do 1º Nível de Suporte (1N CATI) e Desenvolvedor/Mantenedor da extensão oficial do 1N  
> **Ambiente Operacional:** `https://cati.tjce.jus.br/assystweb/*` (Sistema Assyst / Axios Systems)  
> **Linguagem:** Vanilla JavaScript (ES6+), CSS3 puro, HTML5 (sem dependências externas)  

---

## 📑 Sumário

1. [Visão Geral e Propósito](#1-visão-geral-e-propósito)
2. [Estrutura de Arquivos](#2-estrutura-de-arquivos)
3. [Regras de Negócio e Lógica de Elegibilidade](#3-regras-de-negócio-e-lógica-de-elegibilidade)
4. [Arquitetura de Extração no Assyst (Dojo Dijit DOM)](#4-arquitetura-de-extração-no-assyst-dojo-dijit-dom)
5. [Configuração do Modo Turbo (⚡)](#5-configuração-do-modo-turbo-)
6. [Detecção Dinâmica do Paginador da Grade](#6-detecção-dinâmica-do-paginador-da-grade)
7. [Interface de Usuário e Isolamento de CSS](#7-interface-de-usuário-e-isolamento-de-css)
8. [Guia de Integração para a Extensão Oficial do 1N](#8-guia-de-integração-para-a-extensão-oficial-do-1n)
   - [Abordagem A: Inclusão Modular (Sem alterar o código existente)](#abordagem-a-inclusão-modular)
   - [Abordagem B: Fusão de Código (Single Content Script)](#abordagem-b-fusão-de-código)
9. [Instalação e Compilação do Pacote (.XPI)](#9-instalação-e-compilação-do-pacote-xpi)

---

## 1. Visão Geral e Propósito

Esta extensão foi criada para resolver um dos principais gargalos de produtividade na fila do **1º Nível de Atendimento (1N CATI)** no Tribunal de Justiça do Estado do Ceará (TJCE):

### O Problema Operacional
- Técnicos do 1N realizam contato inicial ou solicitam informações adicionais ao usuário via chamado, registrando a ação **"Aguardando Info do Usuário"** que congela o relógio de SLA.
- De acordo com as diretrizes do suporte, o chamado deve aguardar retorno por até **7 dias corridos**. Decorrido esse prazo sem que o usuário responda, o chamado torna-se **elegível para encerramento por inatividade/falta de retorno**.
- Como a fila de chamados pode conter dezenas ou centenas de registros, verificar chamado por chamado manualmente (abrindo a aba de ações de cada um) consome horas preciosas de trabalho diário.

### A Solução Automatizada
A extensão insere um botão flutuante discreto na fila de chamados do Assyst. Ao ser acionado, o assistente percorre as linhas visíveis na grade, abre cada chamado em segundo plano no painel de visualização, lê a aba de ações e gera uma lista consolidada com todos os chamados aptos para encerramento, com link direto e botão para copiar a relação formatada.

---

## 2. Estrutura de Arquivos

```
backlog-1n/
├── manifest.json                  # Manifesto Manifest V3 com permissões estritas
├── build.py                       # Script Python para empacotamento .XPI reproduzível
├── README.md                      # Guia de instalação rápida
├── DOCUMENTACAO.md                # Esta documentação completa e guia de integração
├── icons/                         # Ícones da extensão em todas as resoluções padrão
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon64.png
│   ├── icon96.png
│   └── icon128.png
└── content/
    ├── scanner-1n.js              # Script principal com a lógica do scanner e DOM
    └── scanner-1n.css             # Estilos do botão flutuante, modal, lista e toasts
```

---

## 3. Regras de Negócio e Lógica de Elegibilidade

O motor de elegibilidade está concentrado na função pura `verificarElegibilidadeAguardandoInfo(acoes, dataReferencia)`.

### 3.1 Critérios de Elegibilidade (Tudo deve ser satisfeito)

1. **Ação de Pausa Relevante:**
   - O tipo da ação (`type` ou `tipoAcao`) deve conter termos correspondentes a pausa por usuário:
     - `"Aguardando Info do Usuário"`
     - `"Aguardando Informações do Usuário"`
     - `"Aguardando Info"`
   - São explicitamente descartadas pausas de fornecedor (`"Aguardando Info do Fornecedor"`).

2. **Validação Estrita da Equipe Executora (1N CATI):**
   - A coluna **Nome de Departamento de Serviço de acionamento** (`actingDept` ou `deptoAcionamento`) da referida ação de pausa deve pertencer ao 1N:
     - Termos válidos: `"1N CATI"`, `"1N CATI Central"`, `"Atendimento 1N"`, `"1N"`.
     - **Bloqueio de Falsos Positivos:** Pausas executadas pelo `"2N CATI Remoto"`, `"3N Infraestrutura"` ou fornecedores externos são **rejeitadas**, mesmo que o chamado esteja atualmente atribuído ao 1N.

3. **Inexistência de Resposta ou Retomada Posterior:**
   - Se após a data da pausa de usuário houver qualquer ação cronologicamente posterior de retomada, o chamado é considerado **não elegível**:
     - `"Email Recebido do Usuário"`
     - `"Info Recebidas do Usuário"`
     - `"Iniciar Relógio"`
     - `"Atendimento Iniciado"`
     - `"Resolvido"` / `"Fechamento"`
     - `"Atribuição ao Fornecedor"`

4. **Prazo Regulamentar de 7 Dias Corridos:**
   - O tempo decorrido é calculado em milissegundos a partir da data/hora da última pausa válida:
     $$\Delta t = \text{Data Atual} - \text{Data da Pausa}$$
     $$\text{diasDecorridos} = \left\lfloor \frac{\Delta t}{1000 \times 60 \times 60 \times 24} \right\rfloor$$
   - O chamado só é considerado elegível se $\text{diasDecorridos} \ge 7$.

---

## 4. Arquitetura de Extração no Assyst (Dojo Dijit DOM)

O sistema Assyst utiliza o framework **Dojo Toolkit** com renderização assíncrona baseada em tabelas e `divs` com classes Dijit.

### 4.1 Seletores Utilizados na Fila

| Componente | Seletor CSS | Descrição |
|---|---|---|
| Grade de Chamados | `.dojoxGridMasterView` | Container mestre das linhas da fila de chamados |
| Linha Individual | `.dojoxGridRow.rowId${i}` | Linha do chamado no índice `i` |
| Célula do Chamado | `.eventReferenceCell` | Contém o número do chamado (ex: `2154800` ou `R2472018`) |
| Paginador da Grade | `table.dojoxGridPaginator .dojoxGridActivedSwitch` | Opção de paginação ativa (`25`, `50`, `100` ou `Todos`) |

### 4.2 Seletores Utilizados no Painel de Ações

| Componente | Seletor CSS | Descrição |
|---|---|---|
| Título do Painel | `#contentPaneTitle` | Utilizado para validar se o chamado clicado carregou |
| Aba "Ações" | `.tabLabel` (com texto "Ações" / "Acoes") | Aba do Dojo que exibe o histórico de eventos |
| Linhas de Ações | `#actionGrid .dojoxGridRow` | Linhas da grade de ações |
| Célula: Tipo de Ação | `td[idx="2"]` | Nome da ação (ex: "Aguardando Info do Usuário") |
| Célula: Data da Ação | `td[idx="3"]` | Data e hora de registro no formato `DD/MM/AAAA HH:MM` |
| Célula: Ator (Usuário) | `td[idx="4"]` | Técnico ou usuário que executou a ação |
| Célula: Depto Acionador | `td[idx="5"]` | Departamento de serviço executor (onde validamos o "1N CATI") |
| Célula: Depto Destino | `td[idx="7"]` | Departamento de serviço atribuído |

### 4.3 Acionamento Seguro no Dojo (Simulação de Eventos)
O Assyst não responde adequadamente ao método nativo `.click()` em determinadas linhas da grade. Por esse motivo, a seleção utiliza `MouseEvent("mousedown")`:
```javascript
linha.dispatchEvent(new MouseEvent("mousedown", {
  bubbles: true,
  cancelable: true,
  view: window
}));
```

---

## 5. Configuração do Modo Turbo (⚡)

Para garantir máxima velocidade de leitura na rotina do técnico, a extensão opera com perfil otimizado:

```javascript
const PERFIL_TURBO = {
  pollMs: 50,              // Intervalo de verificação de carregamento do DOM (50ms)
  maxWaitPane: 10,         // Espera máxima de até 500ms para o painel do chamado atualizar
  maxWaitActions: 8,       // Espera máxima de até 400ms para a grade de ações renderizar
  waitBetweenTickets: 50,  // Pausa de respiro entre chamados para não engasgar o navegador
  nome: "Turbo (⚡)"
};
```

### Por que esses valores?
- Como o Assyst já mantém os dados da página em memória cache no cliente, o tempo médio de resposta entre cliques varia entre 100ms e 250ms.
- O polling a cada 50ms reduz a latência morta em até 80% em comparação com temporizadores fixos comuns (`setTimeout` de 1s a 2s).

---

## 6. Detecção Dinâmica do Paginador da Grade

O Assyst permite ao analista configurar a quantidade de chamados exibidos por página (25, 50, 100 ou Todos).

A função `obterLimiteVarreduraGrade()` lê dinamicamente o elemento:
```html
<table class="dojoxGridPaginator">
  ...
  <span class="dojoxGridActivedSwitch">50</span>
</table>
```

### Comportamento:
- Se o usuário estiver exibindo **25 chamados**: a varredura analisa exatamente 25 chamados.
- Se o usuário estiver exibindo **50 ou 100 chamados**: ajusta o limite para 50 ou 100.
- Se o usuário estiver em **Todos**: define `limite = Infinity` e itera sobre todas as linhas renderizadas na grade.
- **Alerta de Alto Volume:** Quando a seleção for `100` ou `Todos`, é emitido um alerta visual no modal (`.cati-1n-volume-alert`) e notificação toast avisando que a varredura pode levar alguns segundos adicionais.

---

## 7. Interface de Usuário e Isolamento de CSS

Para garantir que a extensão nunca entre em conflito visual com outros estilos do Assyst ou com outras extensões instaladas simultaneamente, todas as classes e IDs possuem o prefixo de namespace **`cati-1n-`**:

| Elemento | Identificador / Classe | Função |
|---|---|---|
| Botão Flutuante | `#cati-1n-trigger-waiting-info` | Botão laranja fixado no canto inferior direito (`bottom: 24px; right: 24px`) |
| Badge do Botão | `.cati-1n-btn-badge` | Tag visual `1N` destacada |
| Fundo Modal | `.cati-1n-modal-overlay` | Camada de foco com backdrop blur suave (`z-index: 100000`) |
| Janela Central | `.cati-1n-modal-panel` | Caixa de diálogo centralizada e responsiva com cantos arredondados |
| Cartão de Chamado | `.cati-1n-card` | Linha com número do chamado, badge de dias e botão de abertura |
| Tag de Dias | `.cati-1n-badge-overdue` | Destaque `⌛ X dias sem retorno` |
| Botão Abrir | `.cati-1n-btn-abrir` | Aciona `window.open` em nova guia para o chamado |
| Toast de Alerta | `.cati-1n-toast` | Mensagens flutuantes temporárias de confirmação |

---

## 8. Guia de Integração para a Extensão Oficial do 1N

Se o desenvolvedor responsável pela extensão oficial do 1N desejar **incorporar esta funcionalidade diretamente dentro do projeto dele** para que os analistas tenham apenas uma extensão instalada, existem duas formas recomendadas:

### Abordagem A: Inclusão Modular (Recomendada e Mais Simples)

Mantenha o código deste scanner em seus próprios arquivos dentro do projeto do 1N, apenas registrando-os no `manifest.json`:

1. Copie o arquivo `scanner-1n.js` para a pasta de scripts de conteúdo da extensão do 1N (ex: `src/content/scanner-1n.js`).
2. Copie o arquivo `scanner-1n.css` para a pasta de estilos (ex: `src/content/scanner-1n.css`).
3. Adicione ambos os arquivos na lista de `content_scripts` no `manifest.json` da extensão do 1N:
```json
{
  "content_scripts": [
    {
      "matches": ["https://cati.tjce.jus.br/*"],
      "js": [
        "src/content/sua_extensao_existente.js",
        "src/content/scanner-1n.js"
      ],
      "css": [
        "src/content/seu_estilo_existente.css",
        "src/content/scanner-1n.css"
      ],
      "run_at": "document_idle"
    }
  ]
}
```
> **Vantagem:** Zero risco de quebrar a lógica existente da extensão do 1N. Como todos os seletores e variáveis utilizam o prefixo `cati-1n-` e flags em `window.__cati1n*`, a convivência é 100% segura.

---

### Abordagem B: Fusão de Código (Single Content Script)

Se o desenvolvedor preferir unificar as funções dentro de um arquivo JavaScript único existente da extensão do 1N:

1. **Importar a função de verificação de elegibilidade:**
   Copie a função `verificarElegibilidadeAguardandoInfo` e a auxiliar `parseDataAssyst` para o script dele.
   ```javascript
   // Validação estrita da equipe 1N CATI
   function isDeptoEquipeAlvo1N(depto) {
     if (!depto) return false;
     const d = String(depto).trim().toLowerCase();
     if (d.includes("2n") || d.includes("3n")) return false;
     return d.includes("1n cati") || d.includes("atendimento 1n") || d.includes("1n");
   }
   ```

2. **Acionar a partir de um botão no menu/painel existente:**
   Se a extensão dele já possui uma barra lateral ou menu próprio, basta adicionar um botão que invoque `iniciarVarredura()`:
   ```javascript
   document.getElementById("btn-aguardando-info-1n").onclick = () => {
     iniciarVarredura();
   };
   ```

3. **Mesclar os estilos CSS:**
   Anexe o conteúdo de `scanner-1n.css` no arquivo `.css` principal da extensão dele.

---

## 9. Instalação e Compilação do Pacote (.XPI)

### 9.1 Compilar o Pacote Firefox
Para empacotar a extensão em um único arquivo `.xpi`:
```bash
cd /home/ubuntu/projeto-2n/backlog-1n
python3 build.py
```
O arquivo `backlog-1n-cati.xpi` será gerado automaticamente.

### 9.2 Carregar no Mozilla Firefox (Uso Imediato)
1. No Firefox, acesse: `about:debugging#/runtime/this-firefox`
2. Clique no botão **"Carregar extensão temporária..."** (Load Temporary Add-on).
3. Selecione o arquivo `manifest.json` da pasta `backlog-1n/` (ou o próprio `backlog-1n-cati.xpi`).
4. Abra ou recarregue a aba da fila de chamados do Assyst (`https://cati.tjce.jus.br/assystweb/...`).
5. O botão **"Aguardando Info (7+ Dias)"** aparecerá no canto inferior direito.

### 9.3 Carregar no Google Chrome / Microsoft Edge
1. Acesse: `chrome://extensions`
2. Ative a chave **"Modo do desenvolvedor"** no canto superior direito.
3. Clique em **"Carregar sem compactação"** (Load unpacked).
4. Selecione a pasta `backlog-1n/`.
