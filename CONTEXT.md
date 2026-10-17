# Contexto de Domínio — Assistente 2N CATI Remoto

## 1. Glossário e Terminologia do Domínio

- **Assyst (Axios Systems)**: Sistema de Helpdesk / Gerenciamento de Serviços de TI legado adotado pelo Tribunal de Justiça do Ceará (TJCE), baseado em Dojo Toolkit e widgets Dijit com navegação SPA e iframes/abas.
- **2N CATI Remoto**: 2º Nível de Atendimento de Suporte Remoto da Central de Atendimento de Tecnologia da Informação (CATI/TJCE). Fila operacional principal dos analistas.
- **3N (3º Nível)**: Equipes especializadas de terceiro nível (ex.: 3N Redes, 3N Infraestrutura, 3N Windows, 3N Office 365, Divisão de Patrimônio).
- **Retorno 3N (Devolução)**: Chamado que passou pelo 3N e retorna ao 2N para validação técnica ou encerramento com o usuário. A contagem do SLA desse chamado tem regra especial: calcula o tempo total real desde a abertura original.
- **SLA (Service Level Agreement)**: Acordo de Nível de Serviço. Meta padrão de 1 hora útil (configurável) para o 2N CATI Remoto.
- **Regime Comercial TJCE**: Janela de expediente útil regulamentar das 08:00 às 18:00, de segunda a sexta-feira. Noites, fins de semana e feriados oficiais da Justiça Estadual (fixos e móveis) congelam o relógio de SLA.
- **Regime 24/7 (Ininterrupto)**: Modalidade de contagem contínua (00:00 às 23:59) sem pausas de calendário, voltada para equipes de plantão.
- **Atendimento Programado**: Ação de pausa agendada com o usuário contendo data e hora no texto de observações. O motor de SLA pausa o chamado e reativa automaticamente na data/hora agendada (`materializeSchedule`).
- **Aguardando Info (7+ Dias)**: Regra operacional onde o analista tenta contato com o solicitante. Se o chamado permanecer pausado com "Aguardando Info do Usuário" por 7 dias corridos ou mais sem resposta do usuário, fica elegível para encerramento por inatividade.
- **Item B (Tombo / Número de Série)**: Campo de patrimônio do equipamento no Assyst. Se for hardware, o preenchimento do tombo é exigido (destacado em contorno vermelho se em branco).
- **Edifício**: Campo obrigatório de localização predial da comarca/fórum no Assyst (destacado em contorno vermelho se em branco).
- **Base de Conhecimento**: Artigo de conhecimento técnico anexado ao atendimento (`#jukeboxKnowledgeContent`). Alerta visual de "Sem Base Atribuída" caso não esteja vinculado.
- **Modelos CATI (WhatsApp Web)**: Gaveta retrátil no WhatsApp Web com substituição de variáveis dinâmicas (`{saudacao}`, `{chamado}`, `{assunto}`) sincronizadas em tempo real com o chamado ativo no Assyst.
- **Menu Toggle (☰ CATI)**: Botão unificado flutuante e atalho `Alt + M` que recolhe os botões flutuantes da tela do Assyst para não obstruir a visão em monitores compactos, mantendo um LED indicador de saúde do SLA.

## 2. Estrutura de Componentes

1. `src/content/assyst-sla-engine.js`: Motor puro e determinístico de cálculo de SLA (comercial, 24/7, feriados, pausas e despausas).
2. `src/content/assyst-sla.js`: Integração com o DOM do Assyst, leitura da grade Dojo com virtual scroll e renderização do popover/caixa flutuante com redimensionamento e fixação por clique.
3. `src/content/assyst-scanner.js`: Scanners da fila do Assyst para identificação de chamados agendados e chamados parados há 7+ dias.
4. `src/content/assyst-alertas.js`: Sinalizações visuais sem bloqueios (Edifício, Item B, VIP, Sem Base, Copiar Ficha e sincronização com storage).
5. `src/content/whatsapp-templates.js`: Interface no WhatsApp Web com modelos, substituição de variáveis e sincronização com o Assyst.
6. `src/popup/`: Interface de configuração e lembretes com alarmes.
7. `src/background/background.js`: Background script para alarmes e notificações locais.
8. `src/storage/taskStore.js`: Camada de persistência em `chrome.storage.local`.
9. `backlog-1n/`: Extensão compacta autônoma para o 1º Nível (1N CATI), isolando a funcionalidade de auditoria "Aguardando Info (7+ Dias)" em Modo Turbo (`scanner-1n.js` e `scanner-1n.css`).
10. `tests/`: Bateria de 52 testes unitários em Python garantindo integridade de todos os módulos.
