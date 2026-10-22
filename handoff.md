# Handoff - Assistente 2N CATI Remoto

## 1. Visão Geral do Estado Atual
- **Versão Atual**: `3.5.0`
- **Pacotes Prontos**:
  - `assistente-2n-cati-remoto.xpi` (raiz e dentro de `assistente-2n-cati-remoto/`)
  - `codigo-fonte-assistente-2n.zip` (raiz)
- **Suíte de Testes**: 90 testes unitários em `tests/` (`python3 -m unittest discover -s tests -p "test_*.py" -v`), todos passando (100% verde).
- **Repositório GitHub (Público)**: https://github.com/PedroMachado1/extensoes-cati-tjce
- **Projetos Disponíveis**:
  - `assistente-2n-cati-remoto/`: Extensão completa do 2N CATI Remoto (v3.5.0).
  - `backlog-1n/`: Extensão autônoma dedicada ao 1N CATI focada exclusivamente no scanner "Aguardando Info (7+ Dias)" em Modo Turbo (v1.0.1).

---

## 2. O Que Foi Realizado Recentemente
1. **Monitor de Instabilidade e Quedas do Assyst (Downtime Tracker)**:
   - Implementado subsistema completo com detecção automática de sessão expirada (`sessionInvalid=true` / `"Sua sessão expirou."`), esgotamento de licenças (`"Todas as licenças estão em uso"`) e erros HTTP (500/502/503/504).
   - Banner superior escuro com borda âmbar e cronômetro em tempo real (`00:04:32`), resiliente a F5 e recarregamentos via `chrome.storage.local`.
   - Detecção de retorno no `application.do`, finalização do incidente e modal de celebração pós-login com botão `[📋 Copiar Comprovante de SLA]`.
   - Card dedicado no popup da extensão (`popup.html`) exibindo totalizador do dia e botão `[📊 Copiar Relatório]` consolidado para envio à supervisão.
   - Suíte dedicada em `tests/test_assyst_downtime.py` (26 testes) e cobertura de build em `tests/test_build_package.py`.
2. **Criação da Extensão Autônoma Backlog 1N (`backlog-1n`)**:
   - Isolamento exclusivo do scanner "Aguardando Info (7+ Dias)" em Modo Turbo (⚡) e validação estrita da equipe "1N CATI".
   - Documentação técnica e guia de integração gerados em `backlog-1n/DOCUMENTACAO.md`.
2. **Correção de Cancelamento Prematuro da Varredura (1N CATI)**:
   - Identificado que a função `fecharPainel()` setava `cancelScan = true;` incondicionalmente, abortando imediatamente o loop em `iniciarVarredura()`.
   - Removido `cancelScan = true;` de `fecharPainel()` e atribuído apenas aos botões explícitos de fechar/cancelar (`closeBtn.onclick` e `cancelBtn.onclick`).
1. **Correção do Chamado R2476899 (SLA - Ação de Urgência)**:
   - "Solicitação de Urgência" classificada com efeito estritamente `neutral` em `src/content/assyst-sla-engine.js`.
   - Bloqueio para impedir que ações de urgência vindas do portal do usuário despausem o relógio indevidamente.
2. **Correção do Chamado S2477951 (SLA - Histórico Longo & Virtual Scroll)**:
   - Implementado virtual scroll progressivo com `coletarTodasAcoesGridDojo` em `src/content/assyst-sla.js`.
   - Prevenção de loop de clique em `#actionGridHdr0` (expansão controlada única).
   - `safetyTimeout` ampliado para 20 segundos e tratamento de erro no cálculo.
3. **Scanner de Fila e Aguardando Info (7+ Dias)**:
   - Filtro de equipe personalizada via popup (`waitingInfoDept`, padrão `2N CATI Remoto`) validando a coluna "Nome de Departamento de Serviço de acionamento".
   - Detecção do limite do paginador do Assyst (25, 50, 100 ou Todos) com alerta de alto volume.
   - Abertura de chamados em nova guia do navegador.
4. **Auditoria Técnica da Extensão do Supervisor (`Calculadora de SLA v2.18.12`)**:
   - Supervisor creditou expressamente a autoria de Pedro Lucas Costa Machado em `panel/panel.html`.
   - Identificado que a v2.18.12 ainda contém o bug R2476899 (urgência despausando) e armazena senhas em texto puro no `chrome.storage.local`.
   - Relatório completo arquivado em `auditoria_calculadora_sla_v2_18_12.md`.

---

## 3. Backlog de Ideias Futuras (Brainstorming)
Quando a equipe trouxer novos feedbacks, as principais oportunidades levantadas foram:
1. **Botão "Copiar Justificativa de SLA"**: texto técnico pré-formatado no popover para chamados estourados.
2. **Variável Dinâmica `{usuario}`**: extração do primeiro nome do solicitante para uso nos modelos do WhatsApp Web.
3. **Checklist Pré-Encerramento / Trava de Tombo**: exigir Item B (Tombo) quando Item A for hardware e checar se Edifício/Base de Conhecimento estão preenchidos.
4. **Botão de WhatsApp no Chamado**: link direto `web.whatsapp.com/send?phone=...` a partir do telefone do Assyst.
5. **Divergência de Relógio**: alerta visual caso o relógio nativo do Assyst divirja da contagem real do motor.

---

## 4. Referências e Comandos Úteis
- **Rodar testes**: `python3 -m unittest discover -s tests -p "test_*.py" -v`
- **Compilar pacotes**:
  ```bash
  python3 assistente-2n-cati-remoto/build.py
  cp assistente-2n-cati-remoto/assistente-2n-cati-remoto.xpi ./assistente-2n-cati-remoto.xpi
  zip -qr -FS ./codigo-fonte-assistente-2n.zip assistente-2n-cati-remoto/
  ```
