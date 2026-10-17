# 🚀 Guia Rápido de Utilização — Assistente 2N CATI Remoto

O **Assistente 2N CATI Remoto** é uma extensão desenvolvida para otimizar a rotina operacional dos analistas do 2º Nível de Suporte (CATI/TJCE), integrando cálculos de SLA, auditoria de ações no Assyst, localização de agendamentos e modelos inteligentes no WhatsApp Web.

---

## 📥 1. Como Instalar a Extensão

### Opção A: Mozilla Firefox (Recomendado)
A extensão já está compilada no arquivo pronto `assistente-2n-cati-remoto.xpi` na pasta do projeto.

1. **Via Arrastar e Soltar (Instalação Normal):**
   - Abra o Firefox.
   - Pressione `Ctrl + O` (ou abra `about:addons` na barra de endereços).
   - Localize e selecione o arquivo `assistente-2n-cati-remoto.xpi` (ou simplesmente arraste o arquivo `.xpi` para dentro de qualquer aba aberta do Firefox).
   - Clique em **"Adicionar"** quando o Firefox solicitar confirmação de permissões.

2. **Via Depuração Temporária (Para desenvolvimento ou testes rápidos):**
   - No Firefox, digite na barra de endereços: `about:debugging#/runtime/this-firefox`
   - Clique no botão **"Carregar extensão temporária..."** (Load Temporary Add-on).
   - Navegue até a pasta `assistente-2n-cati-remoto/` e selecione o arquivo `manifest.json` (ou o próprio `.xpi`).
   - A extensão será ativada instantaneamente.

---

### Opção B: Google Chrome / Microsoft Edge / Brave
1. Abra o navegador e digite na barra de endereços: `chrome://extensions`
2. No canto superior direito, ative a chave **"Modo do desenvolvedor"** (Developer mode).
3. Clique no botão **"Carregar sem compactação"** (Load unpacked) no canto superior esquerdo.
4. Selecione a pasta `assistente-2n-cati-remoto/` do projeto.
5. A extensão estará instalada e pronta.

---

## 🛠️ 2. Principais Funções e Como Usar

### ⏱️ Calculadora Inteligente de SLA (Dentro do Chamado)
Aparece automaticamente no **canto inferior esquerdo** sempre que você abrir a tela de um chamado no Assyst.

- **Cálculo Automático e Histórico:** Lê todas as ações do chamado, identificando quando o chamado entrou no 2N, pausas por "Atendimento Programado", "Aguardando Info", e retorno de outros níveis (ex: 3N).
- **Regimes de Expediente Exclusivos:**
  - **☀️ Modo Comercial (Fixo 08:00 às 18:00):** Horário padrão regulamentado pelo TJCE. Não permite edição manual de horas e pausa a contagem após 18h, fins de semana e feriados oficiais (São José, Data Magna, Carnaval, etc.).
  - **⚡ Modo 24/7 (Ininterrupto):** Contagem contínua para equipes de plantão sem pausas de calendário.
- **Relatório Fixo ao Clicar:** Ao passar o mouse (*hover*), o relatório do SLA abre para consulta rápida. Ao **clicar na caixa flutuante**, o relatório fica **fixo** aberto na tela (com contorno azul suave de destaque). Para fechar, basta **clicar fora** da caixa ou pressionar `ESC`.
- **Recálculo pelo Emoji:** Para recalcular o SLA, basta clicar no **emoji de status** (`🟢`, `🔴`, `⚡`, `⏸️`, `🌙`) ou no ícone **🔄** posicionado ao lado do texto.
- **Alternância Rápida de Modo:** No relatório, clique no botão **"Alternar Modo"** para trocar entre Comercial e 24/7 instantaneamente.
- **Ajuste de Tamanho (Escala):** Use os botões **`-`** e **`+`** no popover para aumentar ou diminuir a caixa flutuante (70% a 160%) conforme o tamanho do seu monitor.
- **Indicadores Visuais:**
  - 🟢 **DENTRO:** Chamado dentro da meta de SLA.
  - 🔴 **ESTOURADO:** Chamado ultrapassou o tempo limite.
  - ⏸️ **PAUSADO:** Relógio congelado por ação de espera ou agendamento.
  - 🌙 **FORA DE EXPEDIENTE:** Fora do horário de expediente no regime comercial.

---

### 📋 Botão Copiar Ficha do Chamado
Fica posicionado logo **acima da caixa flutuante do SLA** no canto inferior esquerdo.

- Ao clicar, ele copia os dados essenciais do chamado atual formatados para a área de transferência:
  - Número do Chamado
  - Nome do Solicitante e Contato
  - Edifício / Comarca
  - Item / Serviço
  - Resumo / Descrição
- Útil para colar rapidamente em anotações, no Teams ou no WhatsApp.

---

### 📅 Localizador de Chamados Agendados (Scanner de Fila Geral e Pessoal)
Aparece como um botão flutuante azul **"Localizar Agendados (2N)"** no canto inferior direito da tela da Fila de Chamados.

- **Como Usar:**
  1. Na fila do Assyst, clique em **"Localizar Agendados (2N)"**.
  2. A janela do scanner será aberta no centro da tela.
  3. Clique em **"Iniciar Varredura"**. O assistente paginará automaticamente a lista identificando chamados que contenham datas e horários de agendamento no resumo (ex.: `Agendado para 15/10 14h`).
  4. Na tabela de resultados, você pode clicar em **"Abrir"** para ir direto ao chamado ou **"Criar Lembrete"** para agendar um alerta sonoro e visual.

---

### ⌛ Scanner de Chamados Aguardando Info há 7+ Dias (Exclusivo da Fila do Técnico)
Aparece como um botão flutuante laranja **"Aguardando Info (7+ Dias)"** empilhado acima do botão de agendados, **visível exclusivamente quando o técnico estiver acessando sua própria fila de chamados atribuídos a ele** (`queryProfileId=4`).

- **Finalidade:** O regulamento prevê que o analista tente contato com o solicitante durante 7 dias. Se o usuário não responder, no 7º dia o chamado pode ser concluído como resolvido.
- **Como Usar:**
  1. Acesse sua fila pessoal no Assyst.
  2. Clique no botão laranja **"Aguardando Info (7+ Dias)"**.
  3. O assistente analisará cada chamado da sua fila, acessando a aba de ações e conferindo a data da pausa *"Aguardando Info do Usuário"*.
  4. Se o chamado estiver pausado há 7 dias corridos ou mais sem resposta do usuário, ele é listado no painel.
  5. No painel de resultados, você verá os chamados aptos para encerramento com a quantidade exata de dias decorridos (ex.: *8 dias*, *11 dias*), botão para abrir o chamado diretamente no Assyst e botão para copiar a relação de chamados.

---

### 🚨 Alertas Visuais e Produtividade (Sem Bloqueios)
Projetados para alertar sem nunca impedir de salvar (Ctrl+S) ou fechar telas:

- **Contorno Vermelho em Campos Vazios:** Destaca os campos de **Edifício** e **Item B** quando deixados em branco, evitando devoluções de chamados.
- **Alerta de Base de Conhecimento:** Exibe um aviso chamativo caso você esteja prestes a concluir um chamado sem ter vinculado uma base de conhecimento.
- **Chamados VIP:** Destaca visualmente na lista chamados abertos por desembargadores, juízes ou gabinetes prioritários.
- **Menu Hambúrguer (Toggle):** Um pequeno botão flutuante permite ocultar/exibir os botões extras da tela a qualquer momento caso precise desobstruir a visão.

---

### 💬 Modelos Rápidos no WhatsApp Web
Ao abrir o [WhatsApp Web](https://web.whatsapp.com/), uma aba lateral retrátil **"💬 Modelos CATI"** aparece no canto direito da tela.

- **Aba Arrastável (Drag & Drop):** Clique e arraste a aba verticalmente para cima ou para baixo para que ela nunca fique por cima de mensagens ou horários. A posição escolhida é salva na memória.
- **Botão Minimizar (`›`):** Recolhe a barra em um ícone compacto quando não estiver em uso.
- **Card de Chamado Ativo:**
  - Puxa automaticamente o número e assunto do chamado que você está atendendo no Assyst (`🟢 Assyst`).
  - Permite alternar rapidamente entre os últimos chamados recentes por meio de chips clicáveis.
- **Variáveis Dinâmicas Inteligentes:**
  - `{saudacao}`: Vira *"Bom dia"* antes das 12h ou *"Boa tarde"* após 12h.
  - `{chamado}`: Vira o número do chamado atual (ex.: `2148000`).
  - `{assunto}`: Vira o título/serviço do chamado.
- **Inserir com 1 Clique:**
  - Clique em **"Inserir no Chat"** para colar a mensagem pronta diretamente no campo de texto da conversa ativa.
  - Ou clique em **"Copiar"** para copiar com as variáveis já preenchidas.
- **Categorias e Editor:** Filtre modelos por abas (*Primeiro Contato, Acompanhamento, Encerramento*) ou crie novos modelos no botão **"+ Novo Modelo"**.

---

### 📉 Monitor de Instabilidade e Quedas do Assyst (Downtime Tracker)
O Assyst sofre quedas recorrentes durante o expediente (sessões expiradas repentinamente, esgotamento de licenças disponíveis ou falhas de servidor). O assistente monitora e documenta tudo em segundo plano:

- **Cronômetro Imediato na Queda:** Assim que o Assyst cai ou bloqueia o login, surge um banner superior escuro com borda âmbar mostrando o motivo (ex.: `[Sessão Expirada]` ou `[Falta de Licenças]`) e um cronômetro ao vivo contando os minutos e segundos fora do ar.
- **Resiliência a F5:** A contagem **não reinicia** se você atualizar a página (F5) ou clicar em *"Voltar à página principal"*.
- **Comprovante de SLA Pós-Login:** Assim que você conseguir logar e a tela do Assyst carregar, surge um modal verde informando a duração total e o período da queda, com o botão **`[📋 Copiar Comprovante de SLA]`**. O texto copiado vem formatado com data, horários, diagnóstico e equipe do 2N, pronto para colar na justificativa do chamado caso o SLA tenha estourado.
- **Relatório para a Gestão:** No pop-up da extensão, o card **"📉 Quedas do Assyst"** exibe o total de quedas e tempo acumulado de indisponibilidade do dia, com o botão **`[📊 Copiar Relatório]`** para enviar à supervisão.

---

### 🔔 Central de Lembretes e Configurações (Ícone da Extensão)
Clique no ícone da extensão no topo do navegador para abrir o painel pop-up:

- **Quedas do Assyst:** Consulte as quedas registradas no dia e exporte o relatório consolidado para a gestão.
- **Adicionar Lembretes:** Crie lembretes rápidos de chamados que você precisa acompanhar com data e hora. A extensão emitirá um aviso sonoro e notificação no computador.
- **Configurações Gerais (Engrenagem):**
  - Ajuste a meta de SLA (1h, 2h, 4h).
  - Defina o regime padrão (Comercial TJCE ou 24/7).
  - Altere o horário de início e fim do expediente padrão.
