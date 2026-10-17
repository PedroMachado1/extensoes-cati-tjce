# 🏛️ Extensões CATI Remoto — TJCE

Repositório privado contendo as ferramentas e extensões para otimização do atendimento e controle operacional dos analistas da CATI Remoto (Tribunal de Justiça do Estado do Ceará - TJCE).

---

## 📦 Extensões Incluídas

### 1. [Assistente 2N CATI Remoto (`assistente-2n-cati-remoto`)](./assistente-2n-cati-remoto/)
Extensão WebExtensions (Manifest V3) desenvolvida para o 2º Nível de Suporte (2N CATI Remoto):
- **⏱️ Calculadora Inteligente de SLA:** Contagem dinâmica e auditada com suporte a Modo Comercial (08:00–18:00 com feriados TJCE) e Modo 24/7.
- **📉 Monitor de Instabilidade e Quedas do Assyst:** Cronômetro em tempo real durante quedas, persistência contra recarregamentos (F5), emissão de comprovante para estouro de SLA e consolidação de relatórios diários para a gestão.
- **📅 Localizador de Chamados Agendados:** Varredura automática e paginação inteligente na fila geral do Assyst.
- **⌛ Scanner Aguardando Info (7+ Dias):** Identificação de chamados aptos para encerramento regulamentar por inércia do solicitante.
- **🚨 Alertas Operacionais sem Bloqueios:** Contorno visual para Edifício e Item B pendentes, alerta de Base de Conhecimento e sinalização de usuários VIP.
- **💬 Modelos Rápidos no WhatsApp Web:** Gaveta retrátil com variáveis dinâmicas (`{saudacao}`, `{chamado}`, `{assunto}`) e inserção com 1 clique no chat.

### 2. [Backlog 1N (`backlog-1n`)](./backlog-1n/)
Extensão autônoma dedicada aos analistas do 1º Nível (1N CATI):
- Scanner focado exclusivamente no saneamento de chamados *"Aguardando Info (7+ Dias)"* em Modo Turbo.

---

## 🚀 Instalação Rápida no Firefox

Os pacotes `.xpi` prontos para instalação estão na raiz deste repositório:
- `assistente-2n-cati-remoto.xpi`
- `codigo-fonte-assistente-2n.zip`
- `codigo-fonte-backlog-1n.zip`

Basta arrastar o arquivo `.xpi` para dentro de qualquer aba aberta do Mozilla Firefox e confirmar a instalação.

Para detalhes completos de uso e configurações, consulte:
- [Guia Rápido de Utilização](resumo-de-utilizacao.md)
- [Documentação Técnica Completa](assistente-2n-cati-remoto/DOCUMENTACAO.md)

---

## 🧪 Suíte de Testes

Para executar toda a suíte de testes unitários automatizados (TDD):
```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```

---

## 🛠️ Compilação dos Pacotes

Para gerar novamente os pacotes de distribuição `.xpi` e `.zip`:
```bash
python3 assistente-2n-cati-remoto/build.py
cp assistente-2n-cati-remoto/assistente-2n-cati-remoto.xpi ./assistente-2n-cati-remoto.xpi
zip -qr -FS ./codigo-fonte-assistente-2n.zip assistente-2n-cati-remoto/
```
