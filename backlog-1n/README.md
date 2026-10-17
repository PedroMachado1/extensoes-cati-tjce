# 🚀 Backlog 1N CATI — Aguardando Info (7+ Dias)

Extensão WebExtensions (Manifest V3) dedicada para a equipe **1N CATI** do Tribunal de Justiça do Estado do Ceará (TJCE) no sistema Assyst.

---

## 📌 Funcionalidade Única e Focada

Identifica automaticamente na fila de chamados do Assyst todos os atendimentos que:
1. Foram pausados com a ação **"Aguardando Info do Usuário"** (ou equivalentes).
2. Tiveram a pausa realizada exclusivamente por técnico da equipe **1N CATI** (coluna *Nome de Departamento de Serviço de acionamento*).
3. Não receberam nenhuma resposta ou retomada posterior (ex.: "Email Recebido do Usuário", "Info Recebidas", "Iniciar Relógio").
4. Estão com **7 dias corridos ou mais** decorridos desde a data da pausa.

---

## ⚡ Diferenciais Operacionais

- **Velocidade Turbo (⚡) Pré-Configurada**: Varredura ultra-rápida (polling de 50ms e transição imediata entre chamados), otimizando a checagem em filas com dezenas de chamados.
- **Detecção do Paginador do Assyst**: Lê dinamicamente se o técnico está visualizando 25, 50, 100 ou Todos os registros da grade do Dojo.
- **Alerta de Alto Volume**: Emite aviso visual quando o paginador estiver em 100 ou Todos.
- **Painel de Resultados Inteligente**:
  - Exibe o tempo exato decorrido (ex.: *⌛ 8 dias sem retorno*, *⌛ 12 dias sem retorno*).
  - Botão **"Abrir no Assyst"**: Abre o chamado diretamente em uma nova guia (`_blank`) e seleciona na fila em segundo plano.
  - Botão **"📋 Copiar Lista de Chamados"**: Exporta em um clique a relação de chamados prontos para encerramento regulamentar por falta de retorno.

---

## 📥 Como Instalar

### No Mozilla Firefox
1. Abra `about:debugging#/runtime/this-firefox`
2. Clique em **"Carregar extensão temporária..."** (Load Temporary Add-on)
3. Selecione o arquivo `manifest.json` da pasta `backlog-1n/` ou o arquivo compilado `backlog-1n-cati.xpi`.

### No Google Chrome / Microsoft Edge
1. Abra `chrome://extensions`
2. Ative o **"Modo do desenvolvedor"** no canto superior direito.
3. Clique em **"Carregar sem compactação"** (Load unpacked).
4. Selecione a pasta `backlog-1n/`.

---

## 🛠️ Compilação

Para compilar o pacote `.xpi` autossuficiente:
```bash
cd backlog-1n
python3 build.py
```
O pacote será gerado em `backlog-1n/backlog-1n-cati.xpi`.
