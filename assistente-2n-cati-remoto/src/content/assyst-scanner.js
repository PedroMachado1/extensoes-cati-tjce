(() => {
  // Evitar injeção duplicada ou fora do domínio cati.tjce.jus.br
  if (window.__catiAssystScannerLoaded) return;
  if (!window.location.origin.includes("cati.tjce.jus.br") && !window.location.hostname.includes("cati.tjce.jus.br")) return;
  window.__catiAssystScannerLoaded = true;

  let cancelScan = false;

  // Função auxiliar de espera
  function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Converter data em formato legível para Date JS
  function converterData(texto) {
    let match = texto.match(/(\d{2}\/\d{2})\s+às\s+(\d{1,2})(?::(\d{2})|[hH])?/i);
    if (!match) return new Date(9999, 0, 1);

    let agora = new Date();
    let ano = agora.getFullYear();
    let [dia, mes] = match[1].split("/").map(Number);
    let hora = parseInt(match[2], 10);
    let minuto = parseInt(match[3] || "0", 10);

    // Se o mês for menor que o mês atual com diferença grande, pode ser do próximo ano
    if (mes < agora.getMonth() && (agora.getMonth() - mes > 6)) {
      ano += 1;
    }

    return new Date(ano, mes - 1, dia, hora, minuto);
  }

  // Verificar se o usuário está na tela de lista geral / fila de chamados do Assyst
  function isListaGeralChamados() {
    if (!window.location.origin.includes("cati.tjce.jus.br") && !window.location.hostname.includes("cati.tjce.jus.br")) {
      return false;
    }

    const hash = decodeURIComponent(window.location.hash || "").toLowerCase();
    const href = decodeURIComponent(window.location.href || "").toLowerCase();

    // 1. Se a URL ou hash indicar tela de detalhes do chamado (e não for pesquisa/fila)
    if ((hash.includes("displayevent") || hash.includes("eventdelegating") || href.includes("displayevent")) &&
        !hash.includes("eventsearch") && !href.includes("eventsearch")) {
      return false;
    }

    // 2. Se a aba ativa no Dojo for explicitamente um chamado (multi-abas do Assyst)
    const tabAtiva = document.querySelector(".dijitTabChecked .tabLabel, .dijitTab[aria-selected='true'] .tabLabel, .dijitTabChecked, .dijitTab[aria-selected='true']");
    if (tabAtiva) {
      const textoTab = (tabAtiva.innerText || "").trim();
      if (/\b([A-Za-z]{0,3}\d{5,10})\b/.test(textoTab) && !/pesquisa|search|fila/i.test(textoTab)) {
        return false;
      }
    }

    // 3. Se a URL ou hash indicar explicitamente tela de pesquisa/fila de chamados
    if (hash.includes("eventsearch") || href.includes("eventsearch")) {
      return true;
    }

    // 4. Verificação de grade de chamados no DOM
    const gradeEventSearch = document.querySelector(".dojoxGridMasterView, .eventReferenceCell, table[id*='EventSearch'], [id*='eventSearch']");
    if (gradeEventSearch) {
      const rects = typeof gradeEventSearch.getClientRects === "function" ? gradeEventSearch.getClientRects() : [];
      if (rects.length > 0 || gradeEventSearch.offsetWidth > 0 || gradeEventSearch.offsetHeight > 0) {
        return true;
      }
      if (gradeEventSearch.offsetWidth === undefined && gradeEventSearch.offsetHeight === undefined) {
        return true;
      }
    }

    return false;
  }
  window.__catiIsListaGeralChamados = isListaGeralChamados;

  // Verificar se o usuário está na tela da sua própria fila de chamados (queryProfileId=4) ou no backlog de pausados da equipe (queryProfileId=4989)
  function isFilaPessoalTecnico() {
    if (!isListaGeralChamados()) return false;
    let hash = (window.location.hash || "").toLowerCase();
    let href = (window.location.href || "").toLowerCase();
    try { hash = decodeURIComponent(hash); } catch (_) {}
    try { hash = decodeURIComponent(hash); } catch (_) {}
    try { href = decodeURIComponent(href); } catch (_) {}
    try { href = decodeURIComponent(href); } catch (_) {}

    return /queryprofileid=(?:4|4989)\b/i.test(hash) ||
           /queryprofileid=(?:4|4989)\b/i.test(href) ||
           /queryprofileform\.queryprofileid=(?:4|4989)\b/i.test(hash) ||
           /queryprofileform\.queryprofileid=(?:4|4989)\b/i.test(href);
  }
  window.__catiIsFilaPessoalTecnico = isFilaPessoalTecnico;

  // Identifica a quantidade de chamados configurada no paginador do Assyst (25, 50, 100 ou Todos)
  function obterLimiteVarreduraGrade() {
    const seletor = "table.dojoxGridPaginator > tbody > tr > td > div.sizeSwitchDiv > span.dojoxGridActivedSwitch, .sizeSwitchDiv .dojoxGridActivedSwitch, .dojoxGridActivedSwitch";
    const el = document.querySelector(seletor);
    if (!el) {
      return { limite: 25, rotulo: "25", isAltoVolume: false };
    }

    const texto = (el.innerText || el.textContent || "").trim();
    const textoLower = texto.toLowerCase();

    if (textoLower.includes("todos") || textoLower.includes("all")) {
      return { limite: Infinity, rotulo: "Todos", isAltoVolume: true };
    }

    const num = parseInt(texto, 10);
    if (!Number.isNaN(num) && num > 0) {
      return {
        limite: num,
        rotulo: String(num),
        isAltoVolume: num >= 100
      };
    }

    return { limite: 25, rotulo: "25", isAltoVolume: false };
  }
  window.__catiObterLimiteVarreduraGrade = obterLimiteVarreduraGrade;

  // Parser para datas no padrão do Assyst (ex.: 28/09/26 14:30 ou 28/09/2026 14:30:00)
  function parseDataAssyst(str) {
    if (!str) return null;
    const match = String(str).match(/(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;

    let dia = parseInt(match[1], 10);
    let mes = parseInt(match[2], 10) - 1;
    let ano = parseInt(match[3], 10);
    if (ano < 100) ano = 2000 + ano;

    let hora = parseInt(match[4], 10);
    let minuto = parseInt(match[5], 10);
    let segundo = match[6] ? parseInt(match[6], 10) : 0;

    const d = new Date(ano, mes, dia, hora, minuto, segundo);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  // Verifica se o chamado está com 7+ dias de pausa por "Aguardando Info do Usuário"
  function verificarElegibilidadeAguardandoInfo(acoes, dataReferencia, equipeAlvo = "2N CATI Remoto") {
    if (!Array.isArray(acoes) || acoes.length === 0) {
      return { elegivel: false, motivo: "sem_acoes" };
    }

    // Normalizar e ordenar ações cronologicamente
    const acoesOrdenadas = [...acoes].map(a => {
      const raw = a.dateRaw || a.dataStr || "";
      const dt = a.dataObj instanceof Date ? a.dataObj : parseDataAssyst(raw);
      return {
        ...a,
        _dt: dt,
        _time: dt ? dt.getTime() : 0,
        _tipo: String(a.type || a.tipoAcao || "").trim().toLowerCase()
      };
    }).filter(a => a._dt).sort((a, b) => a._time - b._time);

    if (acoesOrdenadas.length === 0) {
      return { elegivel: false, motivo: "sem_datas_validas" };
    }

    const agora = dataReferencia instanceof Date ? dataReferencia : new Date();

    const isDeptoEquipeAlvo = (depto, alvo) => {
      if (!depto) return false;
      const d = String(depto).trim().toLowerCase();
      const target = String(alvo || "2N CATI Remoto").trim().toLowerCase();

      // Compatibilidade com variantes do 2N Remoto TJCE
      if ((target.includes("2n") && target.includes("remoto")) || target.includes("cati remoto")) {
        return d.includes("2n cati remoto") ||
               d.includes("atendimento 2n remoto") ||
               (d.includes("2n") && d.includes("remoto")) ||
               d.includes("cati remoto");
      }

      // Para outras equipes configuradas pelo usuário
      return d.includes(target);
    };

    const isPausaUsuario = (acao) => {
      const tipo = String(acao._tipo || acao.type || acao.tipoAcao || "").trim().toLowerCase();
      const ehAguardando = (tipo.includes("aguardando info") ||
                            tipo.includes("aguardando informacao") ||
                            tipo.includes("aguardando informação")) &&
                           !tipo.includes("fornecedor");
      if (!ehAguardando) return false;

      // Validação estrita: a pausa deve ter sido feita pelo departamento/equipe configurado
      // na coluna "Nome de Departamento de Serviço de acionamento" (actingDept / deptoAcionamento)
      const depto = acao.actingDept || acao.deptoAcionamento || acao.dept || "";
      return isDeptoEquipeAlvo(depto, equipeAlvo);
    };

    const isReativacao = (tipo) => {
      return tipo.includes("email recebido") ||
             tipo.includes("info recebida") ||
             tipo.includes("iniciar relógio") ||
             tipo.includes("iniciar relogio") ||
             tipo.includes("atendimento iniciado") ||
             tipo.includes("resolvido") ||
             tipo.includes("fechamento") ||
             tipo.includes("atribuição ao fornecedor") ||
             tipo.includes("atribuir ao fornecedor");
    };

    let ultimaPausaUsuario = null;
    let reativadoApos = false;

    for (const acao of acoesOrdenadas) {
      if (isPausaUsuario(acao)) {
        ultimaPausaUsuario = acao;
        reativadoApos = false;
      } else if (isReativacao(acao._tipo) && ultimaPausaUsuario) {
        reativadoApos = true;
      }
    }

    if (!ultimaPausaUsuario || reativadoApos) {
      return { elegivel: false, motivo: reativadoApos ? "reativado" : "nao_pausado_por_info_usuario" };
    }

    const diffMs = agora.getTime() - ultimaPausaUsuario._dt.getTime();
    const diasDecorridos = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return {
      elegivel: diasDecorridos >= 7,
      diasDecorridos,
      dataPausa: ultimaPausaUsuario._dt,
      dataPausaStr: ultimaPausaUsuario.dateRaw || ultimaPausaUsuario.dataStr,
      ultimaAcao: ultimaPausaUsuario
    };
  }
  window.__catiVerificarElegibilidadeAguardandoInfo = verificarElegibilidadeAguardandoInfo;

  // Criar e gerenciar botões flutuantes na fila
  function criarBotoesFlutuantes() {
    const naListaGeral = isListaGeralChamados();

    if (!naListaGeral) {
      const bAgendados = document.getElementById("cati-floating-trigger");
      if (bAgendados) bAgendados.style.display = "none";
      const b7Dias = document.getElementById("cati-floating-trigger-waiting-info");
      if (b7Dias) b7Dias.style.display = "none";
      return;
    }

    // 1. Botão Localizar Agendados (2N)
    let btnAgendados = document.getElementById("cati-floating-trigger");
    if (!btnAgendados) {
      btnAgendados = document.createElement("button");
      btnAgendados.id = "cati-floating-trigger";
      btnAgendados.type = "button";
      btnAgendados.title = "Localizar chamados com Atendimento Programado na fila do Assyst";
      btnAgendados.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span>Localizar Agendados (2N)</span>
      `;
      btnAgendados.addEventListener("click", () => {
        iniciarVarredura();
      });
      document.body.appendChild(btnAgendados);
    }
    btnAgendados.style.display = "inline-flex";

    // 2. Botão Aguardando Info (7+ Dias)
    let btn7Dias = document.getElementById("cati-floating-trigger-waiting-info");
    if (!btn7Dias) {
      btn7Dias = document.createElement("button");
      btn7Dias.id = "cati-floating-trigger-waiting-info";
      btn7Dias.type = "button";
      btn7Dias.title = "Verificar chamados na fila com 7+ dias de pausa 'Aguardando Info do Usuário' para encerramento";
      btn7Dias.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/>
        </svg>
        <span>Aguardando Info (7+ Dias)</span>
      `;
      btn7Dias.addEventListener("click", () => {
        iniciarVarreduraAguardandoInfo();
      });
      document.body.appendChild(btn7Dias);
    }
    btn7Dias.style.display = "inline-flex";
  }
  window.__catiCriarBotoesFlutuantes = criarBotoesFlutuantes;

  // Atualizar visibilidade dos botões flutuantes dinamicamente
  function atualizarVisibilidadeBotaoFlutuante() {
    const deveExibir = isListaGeralChamados();
    if (deveExibir) {
      criarBotoesFlutuantes();
    } else {
      const bAgendados = document.getElementById("cati-floating-trigger");
      if (bAgendados) bAgendados.style.display = "none";
      const b7Dias = document.getElementById("cati-floating-trigger-waiting-info");
      if (b7Dias) b7Dias.style.display = "none";
      fecharPainel();
    }
  }

  // Exibir notificação toast temporária
  function mostrarToast(mensagem, duracao = 3500) {
    const toast = document.createElement("div");
    toast.className = "cati-toast";
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, duracao);
  }

  // Fechar qualquer painel aberto
  function fecharPainel() {
    const painel = document.getElementById("cati-main-panel");
    if (painel) painel.remove();
  }

  // Perfis de velocidade de varredura
  const PERFIS_VELOCIDADE = {
    turbo: { pollMs: 50, maxWaitPane: 10, maxWaitActions: 8, waitBetweenTickets: 50, nome: "Turbo (⚡)" },
    fast: { pollMs: 80, maxWaitPane: 12, maxWaitActions: 10, waitBetweenTickets: 120, nome: "Rápida (🚀)" },
    normal: { pollMs: 100, maxWaitPane: 15, maxWaitActions: 10, waitBetweenTickets: 250, nome: "Normal (⚖️)" },
    careful: { pollMs: 150, maxWaitPane: 18, maxWaitActions: 12, waitBetweenTickets: 450, nome: "Moderada (🐢)" },
    slow: { pollMs: 200, maxWaitPane: 22, maxWaitActions: 15, waitBetweenTickets: 800, nome: "Lenta (🛑)" }
  };

  async function obterConfiguracoesVarredura() {
    return new Promise(resolve => {
      if (!chrome.storage || !chrome.storage.local) {
        resolve({ scanSpeed: "normal", waitingInfoDept: "2N CATI Remoto" });
        return;
      }
      chrome.storage.local.get(["agenda_settings"], result => {
        const s = result?.agenda_settings || {};
        resolve({
          scanSpeed: s.scanSpeed || "normal",
          waitingInfoDept: (typeof s.waitingInfoDept === "string" && s.waitingInfoDept.trim()) ? s.waitingInfoDept.trim() : "2N CATI Remoto"
        });
      });
    });
  }

  async function salvarVelocidadeVarredura(novaVelocidade) {
    if (!chrome.storage || !chrome.storage.local) return;
    return new Promise(resolve => {
      chrome.storage.local.get(["agenda_settings"], result => {
        const s = result?.agenda_settings || {};
        s.scanSpeed = novaVelocidade;
        chrome.storage.local.set({ agenda_settings: s }, resolve);
      });
    });
  }

  // Criar modal básico com cabeçalho (Centralizado)
  function criarPainelBase(titulo, subtitulo, configAtual = {}) {
    fecharPainel();

    const panel = document.createElement("div");
    panel.id = "cati-main-panel";
    panel.className = "cati-overlay-panel";

    const header = document.createElement("header");
    header.className = "cati-header";

    const info = document.createElement("div");
    info.className = "cati-header-info";

    const titleEl = document.createElement("h3");
    titleEl.className = "cati-header-title";
    titleEl.innerHTML = `🔍 ${titulo}`;

    const subEl = document.createElement("span");
    subEl.className = "cati-header-subtitle";
    subEl.textContent = subtitulo || "Assistente - 2N CATI Remoto";

    info.appendChild(titleEl);
    info.appendChild(subEl);

    const actions = document.createElement("div");
    actions.className = "cati-header-actions";

    // Seletor de velocidade embutido no cabeçalho
    const speedSelect = document.createElement("select");
    speedSelect.className = "cati-select-speed";
    speedSelect.title = "Ajustar velocidade da varredura";
    const speeds = [
      { id: "turbo", label: "⚡ Turbo" },
      { id: "fast", label: "🚀 Rápida" },
      { id: "normal", label: "⚖️ Normal" },
      { id: "careful", label: "🐢 Moderada" },
      { id: "slow", label: "🛑 Lenta" }
    ];
    speeds.forEach(sp => {
      const opt = document.createElement("option");
      opt.value = sp.id;
      opt.textContent = sp.label;
      if (sp.id === (configAtual.scanSpeed || "normal")) {
        opt.selected = true;
      }
      speedSelect.appendChild(opt);
    });

    speedSelect.onchange = async () => {
      const novaVel = speedSelect.value;
      await salvarVelocidadeVarredura(novaVel);
      mostrarToast(`Velocidade da varredura ajustada para: ${PERFIS_VELOCIDADE[novaVel]?.nome || novaVel}`);
    };

    actions.appendChild(speedSelect);

    const closeBtn = document.createElement("button");
    closeBtn.className = "cati-btn-close";
    closeBtn.type = "button";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Fechar";
    closeBtn.onclick = () => {
      cancelScan = true;
      panel.remove();
    };

    actions.appendChild(closeBtn);

    header.appendChild(info);
    header.appendChild(actions);
    panel.appendChild(header);

    document.body.appendChild(panel);
    return panel;
  }

  // Iniciar processo de varredura
  async function iniciarVarredura() {
    cancelScan = false;

    const grid = document.querySelector(".dojoxGridMasterView");
    if (!grid) {
      alert("Assistente 2N: Não foi possível localizar a fila do Assyst nesta página.");
      return;
    }

    const infoLimite = obterLimiteVarreduraGrade();
    const config = await obterConfiguracoesVarredura();
    let speedKey = config.scanSpeed || "normal";
    let speed = PERFIS_VELOCIDADE[speedKey] || PERFIS_VELOCIDADE.normal;

    const subTexto = `Velocidade: ${speed.nome} • Filtro: ${infoLimite.rotulo}`;
    const panel = criarPainelBase("Varrendo Fila do Assyst", subTexto, config);

    if (infoLimite.isAltoVolume) {
      mostrarToast(`⚠️ Filtro de ${infoLimite.rotulo} chamados ativo. A verificação pode demorar um pouco.`);
    }

    // Atualizar dinamicamente se o usuário alterar a velocidade no seletor durante a varredura
    const speedSelect = panel.querySelector(".cati-select-speed");
    if (speedSelect) {
      speedSelect.addEventListener("change", () => {
        speedKey = speedSelect.value;
        speed = PERFIS_VELOCIDADE[speedKey] || PERFIS_VELOCIDADE.normal;
        const sub = panel.querySelector(".cati-header-subtitle");
        if (sub) sub.textContent = `Velocidade: ${speed.nome} • Filtro: ${infoLimite.rotulo}`;
      });
    }

    const alertaVolumeHtml = infoLimite.isAltoVolume ? `
      <div class="cati-volume-alert">
        ⚠️ <strong>Filtro de ${infoLimite.rotulo} chamados ativo:</strong> A verificação pode demorar um pouco.
      </div>
    ` : "";

    const body = document.createElement("div");
    body.className = "cati-progress-body";
    body.innerHTML = `
      <div class="cati-spinner"></div>
      <div class="cati-progress-text" id="cati-prog-text">Iniciando análise da fila...</div>
      <div class="cati-progress-detail" id="cati-prog-detail">Verificando chamados na página</div>
      ${alertaVolumeHtml}
      <div class="cati-progress-bar-bg">
        <div class="cati-progress-bar-fill" id="cati-prog-fill"></div>
      </div>
      <button type="button" class="cati-btn-secondary" id="cati-btn-cancel-scan" style="margin-top: 8px;">Cancelar Varredura</button>
    `;
    panel.appendChild(body);

    const cancelBtn = body.querySelector("#cati-btn-cancel-scan");
    cancelBtn.onclick = () => {
      cancelScan = true;
      body.querySelector("#cati-prog-text").textContent = "Cancelando...";
    };

    const progText = body.querySelector("#cati-prog-text");
    const progDetail = body.querySelector("#cati-prog-detail");
    const progFill = body.querySelector("#cati-prog-fill");

    const agendados = [];
    const maxRegistros = infoLimite.limite;
    const totalLinhasDOM = grid.querySelectorAll(".dojoxGridRow").length || 0;
    const totalEstimado = Number.isFinite(maxRegistros) ? maxRegistros : (totalLinhasDOM || 500);

    for (let i = 0; Number.isFinite(maxRegistros) ? (i < maxRegistros) : true; i++) {
      if (cancelScan) break;

      const linha = grid.querySelector(`.rowId${i}`);
      if (!linha) break;

      const chamado = linha.querySelector(".eventReferenceCell")?.innerText?.trim();
      if (!chamado) continue;

      const perc = Math.min(100, Math.round(((i + 1) / totalEstimado) * 100));
      progFill.style.width = `${perc}%`;
      progText.textContent = `Verificando chamado ${i + 1}${Number.isFinite(maxRegistros) ? ` de ${maxRegistros}` : ` (Filtro: Todos)`}...`;
      progDetail.textContent = `Chamado: ${chamado} • ${speed.nome}`;

      // Simula mousedown para abrir o chamado
      linha.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));

      // Aguarda o painel atualizar de acordo com o perfil de velocidade
      for (let t = 0; t < speed.maxWaitPane; t++) {
        if (cancelScan) break;
        const titulo = document.querySelector("#contentPaneTitle")?.innerText || "";
        if (titulo.startsWith(chamado)) break;
        await esperar(speed.pollMs);
      }

      if (cancelScan) break;

      // Abre aba 'Ações' se necessário
      const abaAcoes = [...document.querySelectorAll(".tabLabel")].find(x => x.textContent.trim() === "Ações");
      if (abaAcoes) {
        abaAcoes.click();
        for (let t = 0; t < speed.maxWaitActions; t++) {
          if (cancelScan) break;
          if (document.querySelector(".actionremarksbody")) break;
          await esperar(speed.pollMs);
        }
      }

      if (cancelScan) break;

      // Procura atendimento agendado nas ações
      const observacoes = [...document.querySelectorAll(".actionremarksbody")];
      for (const obs of observacoes) {
        const texto = obs.innerText || "";
        if (!texto.toLowerCase().includes("atendimento está sendo programado")) continue;

        const match = texto.match(/(\d{2}\/\d{2})\s+às\s+(\d{1,2})(?::(\d{2})|[hH])?/i);
        if (!match) continue;

        const hora = match[2].padStart(2, "0");
        const minuto = match[3] || "00";
        const dataHora = `${match[1]} às ${hora}:${minuto}`;
        const dataObj = converterData(dataHora);

        agendados.push({
          chamado,
          dataHora,
          dataObj,
          isoDate: dataObj.toISOString(),
          obs: texto.trim(),
          texto: `${chamado} | ${dataHora}`
        });
        break;
      }

      // Intervalo entre chamados conforme perfil de velocidade
      if (speed.waitBetweenTickets > 0 && !cancelScan) {
        await esperar(speed.waitBetweenTickets);
      }
    }

    if (cancelScan) {
      fecharPainel();
      mostrarToast("Varredura cancelada pelo usuário.");
      return;
    }

    agendados.sort((a, b) => a.dataObj - b.dataObj);

    if (agendados.length === 0) {
      exibirNenhumResultado();
      return;
    }

    // Consultar lembretes existentes na extensão para evitar duplicatas
    chrome.runtime.sendMessage({ action: "GET_TASKS" }, (response) => {
      const tarefasExistentes = (response && response.tasks) || [];
      const titulosExistentes = new Set(
        tarefasExistentes.map(t => String(t.title || "").trim().toLowerCase())
      );

      agendados.forEach(item => {
        item.jaExiste = titulosExistentes.has(item.chamado.toLowerCase());
      });

      exibirPainelResultados(agendados);
    });
  }

  // Exibir tela quando nenhum chamado for encontrado
  async function exibirNenhumResultado() {
    const config = await obterConfiguracoesVarredura();
    const panel = criarPainelBase("Varredura Concluída", "Nenhum agendamento encontrado", config);
    const body = document.createElement("div");
    body.className = "cati-progress-body";
    body.innerHTML = `
      <div style="font-size: 32px;">📋</div>
      <div class="cati-progress-text">Nenhum chamado agendado encontrado</div>
      <div class="cati-progress-detail">Nenhum dos chamados verificados na fila possui "atendimento está sendo programado".</div>
      <button type="button" class="cati-btn-secondary" id="cati-btn-close-empty">Fechar</button>
    `;
    panel.appendChild(body);
    body.querySelector("#cati-btn-close-empty").onclick = fecharPainel;
  }

  // Exibir painel final com resultados, cópia e importação
  async function exibirPainelResultados(lista) {
    const config = await obterConfiguracoesVarredura();
    const panel = criarPainelBase(`Chamados Agendados (${lista.length})`, "Assistente - 2N CATI Remoto", config);

    // Toolbar de ações rápidas
    const toolbar = document.createElement("div");
    toolbar.className = "cati-toolbar";

    const leftActions = document.createElement("div");
    leftActions.className = "cati-toolbar-left";

    const btnCopiar = document.createElement("button");
    btnCopiar.type = "button";
    btnCopiar.className = "cati-btn-text";
    btnCopiar.textContent = "📋 Copiar Lista";
    btnCopiar.onclick = () => {
      const texto = lista.map(x => x.texto).join("\n");
      navigator.clipboard.writeText(texto).then(() => {
        mostrarToast("Lista de agendamentos copiada para a área de transferência!");
        btnCopiar.textContent = "✓ Copiado!";
        setTimeout(() => { btnCopiar.textContent = "📋 Copiar Lista"; }, 2000);
      }).catch(() => {
        mostrarToast("Não foi possível copiar automaticamente.");
      });
    };

    const btnAlternarTexto = document.createElement("button");
    btnAlternarTexto.type = "button";
    btnAlternarTexto.className = "cati-btn-text";
    btnAlternarTexto.textContent = "Alternar Texto Simples";

    const btnSelecionarTodos = document.createElement("button");
    btnSelecionarTodos.type = "button";
    btnSelecionarTodos.className = "cati-btn-text";
    btnSelecionarTodos.textContent = "Marcar Novos";

    leftActions.appendChild(btnCopiar);
    leftActions.appendChild(btnAlternarTexto);
    leftActions.appendChild(btnSelecionarTodos);
    toolbar.appendChild(leftActions);
    panel.appendChild(toolbar);

    // Área de Texto Simples (escondida por padrão)
    const textarea = document.createElement("textarea");
    textarea.className = "cati-textarea-view";
    textarea.style.display = "none";
    textarea.value = lista.map(x => x.texto).join("\n");
    panel.appendChild(textarea);

    btnAlternarTexto.onclick = () => {
      if (textarea.style.display === "none") {
        textarea.style.display = "block";
        btnAlternarTexto.textContent = "Ocultar Texto Simples";
      } else {
        textarea.style.display = "none";
        btnAlternarTexto.textContent = "Alternar Texto Simples";
      }
    };

    // Container da lista com cards e checkboxes
    const listContainer = document.createElement("div");
    listContainer.className = "cati-list";

    lista.forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = `cati-card ${item.jaExiste ? "already-imported" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `cati-check-${idx}`;
      checkbox.dataset.idx = idx;

      if (item.jaExiste) {
        checkbox.checked = false;
        checkbox.disabled = true;
      } else {
        checkbox.checked = true;
      }

      checkbox.onchange = () => atualizarBotaoImportar();

      const cardContent = document.createElement("div");
      cardContent.className = "cati-card-content";

      const topRow = document.createElement("div");
      topRow.className = "cati-card-top";

      const ticketNum = document.createElement("span");
      ticketNum.className = "cati-ticket-num";
      ticketNum.textContent = item.chamado;

      topRow.appendChild(ticketNum);

      if (item.jaExiste) {
        const badge = document.createElement("span");
        badge.className = "cati-badge cati-badge-imported";
        badge.textContent = "✓ Já na Agenda";
        topRow.appendChild(badge);
      }

      const dateTime = document.createElement("div");
      dateTime.className = "cati-date-time";
      dateTime.innerHTML = `🗓️ ${item.dataHora}`;

      const obsSnippet = document.createElement("div");
      obsSnippet.className = "cati-obs";
      obsSnippet.textContent = item.obs;
      obsSnippet.title = item.obs;

      cardContent.appendChild(topRow);
      cardContent.appendChild(dateTime);
      cardContent.appendChild(obsSnippet);

      card.appendChild(checkbox);
      card.appendChild(cardContent);
      listContainer.appendChild(card);
    });

    panel.appendChild(listContainer);

    // Rodapé com botão de Importação
    const footer = document.createElement("footer");
    footer.className = "cati-footer";

    const contadorInfo = document.createElement("span");
    contadorInfo.style.fontSize = "11px";
    contadorInfo.style.color = "#64748b";

    const btnImportar = document.createElement("button");
    btnImportar.type = "button";
    btnImportar.className = "cati-btn-primary";
    btnImportar.id = "cati-btn-importar";

    function atualizarBotaoImportar() {
      const checkboxes = listContainer.querySelectorAll("input[type='checkbox']:not(:disabled)");
      const selecionados = [...checkboxes].filter(cb => cb.checked).length;
      btnImportar.textContent = `Importar Selecionados (${selecionados})`;
      btnImportar.disabled = selecionados === 0;
      contadorInfo.textContent = `${selecionados} de ${lista.length} selecionado(s)`;
    }

    btnSelecionarTodos.onclick = () => {
      const checkboxes = listContainer.querySelectorAll("input[type='checkbox']:not(:disabled)");
      const todosMarcados = [...checkboxes].every(cb => cb.checked);
      checkboxes.forEach(cb => { cb.checked = !todosMarcados; });
      btnSelecionarTodos.textContent = todosMarcados ? "Marcar Novos" : "Desmarcar Todos";
      atualizarBotaoImportar();
    };

    btnImportar.onclick = async () => {
      const checkboxes = listContainer.querySelectorAll("input[type='checkbox']:not(:disabled)");
      const indices = [...checkboxes].filter(cb => cb.checked).map(cb => Number(cb.dataset.idx));

      if (indices.length === 0) return;

      btnImportar.disabled = true;
      btnImportar.textContent = "Importando...";

      const tarefasParaImportar = indices.map(idx => {
        const item = lista[idx];
        return {
          title: item.chamado,
          dueDate: item.isoDate,
          tag: "Assyst",
          description: item.obs,
          priority: "normal"
        };
      });

      chrome.runtime.sendMessage({
        action: "IMPORT_TASKS",
        tasks: tarefasParaImportar
      }, (response) => {
        if (response && response.ok) {
          mostrarToast(`✓ ${response.imported || tarefasParaImportar.length} chamado(s) importado(s) para a Agenda!`);

          // Atualizar o visual dos itens importados
          indices.forEach(idx => {
            lista[idx].jaExiste = true;
            const cb = listContainer.querySelector(`#cati-check-${idx}`);
            if (cb) {
              cb.checked = false;
              cb.disabled = true;
              const card = cb.closest(".cati-card");
              if (card) {
                card.classList.add("already-imported");
                const topRow = card.querySelector(".cati-card-top");
                if (topRow && !topRow.querySelector(".cati-badge-imported")) {
                  const badge = document.createElement("span");
                  badge.className = "cati-badge cati-badge-imported";
                  badge.textContent = "✓ Já na Agenda";
                  topRow.appendChild(badge);
                }
              }
            }
          });

          atualizarBotaoImportar();
        } else {
          mostrarToast("Erro ao importar para a extensão: " + (response?.error || "Desconhecido"));
          atualizarBotaoImportar();
        }
      });
    };

    atualizarBotaoImportar();

    footer.appendChild(contadorInfo);
    footer.appendChild(btnImportar);
    panel.appendChild(footer);
  }

  // Extração local de fallback de ações do chamado
  function extrairAcoesDoDOMLocal() {
    const acoes = [];
    const gridRows = document.querySelectorAll("#actionGrid .dojoxGridRow, .dojoxGridRow.actionGridRow, .actionremarksbody, tr");
    gridRows.forEach(row => {
      let type = "";
      let dateRaw = "";
      let actor = "";
      let actingDept = "";
      let assignedUser = "";
      let assignedDept = "";

      const cells = row.querySelectorAll("td");
      if (cells.length >= 4) {
        cells.forEach(td => {
          const idx = td.getAttribute("idx");
          if (idx === "2") type = (td.textContent || "").trim();
          if (idx === "3") dateRaw = (td.textContent || "").trim();
          if (idx === "4") actor = (td.textContent || "").trim();
          if (idx === "5") actingDept = (td.textContent || "").trim();
          if (idx === "6") assignedUser = (td.textContent || "").trim();
          if (idx === "7") assignedDept = (td.textContent || "").trim();
        });
      }

      if (!type || !dateRaw) {
        const text = (row.textContent || "").trim();
        const mDate = text.match(/(\d{2}\/\d{2}\/\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
        if (mDate) {
          dateRaw = mDate[1];
          if (/aguardando info/i.test(text)) type = "Aguardando Info do Usuário";
          else if (/email recebido/i.test(text)) type = "Email Recebido do Usuário";
          else if (/info recebid/i.test(text)) type = "Info Recebidas do Usuário";
          else if (/resolvido/i.test(text)) type = "Resolvido";
          else if (/iniciar rel[óo]gio/i.test(text)) type = "Iniciar Relógio";
          else if (/atendimento iniciado/i.test(text)) type = "Atendimento Iniciado";
        }
      }

      if (type && dateRaw) {
        acoes.push({
          type,
          tipoAcao: type,
          dateRaw,
          dataStr: dateRaw,
          actor,
          actingDept,
          deptoAcionamento: actingDept,
          assignedUser,
          assignedDept,
          deptoAtribuido: assignedDept
        });
      }
    });
    return acoes;
  }

  // Iniciar processo de varredura de chamados com 7+ dias de pausa Aguardando Info
  async function iniciarVarreduraAguardandoInfo() {
    cancelScan = false;

    const grid = document.querySelector(".dojoxGridMasterView");
    if (!grid) {
      alert("Assistente 2N: Não foi possível localizar a fila do Assyst nesta página.");
      return;
    }

    const infoLimite = obterLimiteVarreduraGrade();
    const config = await obterConfiguracoesVarredura();
    const equipeAlvo = config.waitingInfoDept || "2N CATI Remoto";
    let speedKey = config.scanSpeed || "normal";
    let speed = PERFIS_VELOCIDADE[speedKey] || PERFIS_VELOCIDADE.normal;

    const subTexto = `Varrendo fila • ${speed.nome} • Filtro: ${infoLimite.rotulo}`;
    const panel = criarPainelBase("Aguardando Info há 7+ Dias", subTexto, config);

    if (infoLimite.isAltoVolume) {
      mostrarToast(`⚠️ Filtro de ${infoLimite.rotulo} chamados ativo. A verificação pode demorar um pouco.`);
    }

    const speedSelect = panel.querySelector(".cati-select-speed");
    if (speedSelect) {
      speedSelect.addEventListener("change", () => {
        speedKey = speedSelect.value;
        speed = PERFIS_VELOCIDADE[speedKey] || PERFIS_VELOCIDADE.normal;
        const sub = panel.querySelector(".cati-header-subtitle");
        if (sub) sub.textContent = `Varrendo fila • ${speed.nome} • Filtro: ${infoLimite.rotulo}`;
      });
    }

    const alertaVolumeHtml = infoLimite.isAltoVolume ? `
      <div class="cati-volume-alert">
        ⚠️ <strong>Filtro de ${infoLimite.rotulo} chamados ativo:</strong> A verificação pode demorar um pouco.
      </div>
    ` : "";

    const body = document.createElement("div");
    body.className = "cati-progress-body";
    body.innerHTML = `
      <div class="cati-spinner"></div>
      <div class="cati-progress-text" id="cati-prog-text">Analisando chamados da sua fila...</div>
      <div class="cati-progress-detail" id="cati-prog-detail">Verificando histórico de pausas</div>
      ${alertaVolumeHtml}
      <div class="cati-progress-bar-bg">
        <div class="cati-progress-bar-fill" id="cati-prog-fill"></div>
      </div>
      <button type="button" class="cati-btn-secondary" id="cati-btn-cancel-scan" style="margin-top: 8px;">Cancelar Varredura</button>
    `;
    panel.appendChild(body);

    const cancelBtn = body.querySelector("#cati-btn-cancel-scan");
    cancelBtn.onclick = () => {
      cancelScan = true;
      body.querySelector("#cati-prog-text").textContent = "Cancelando...";
    };

    const progText = body.querySelector("#cati-prog-text");
    const progDetail = body.querySelector("#cati-prog-detail");
    const progFill = body.querySelector("#cati-prog-fill");

    const elegiveis = [];
    const maxRegistros = infoLimite.limite;
    const totalLinhasDOM = grid.querySelectorAll(".dojoxGridRow").length || 0;
    const totalEstimado = Number.isFinite(maxRegistros) ? maxRegistros : (totalLinhasDOM || 500);

    for (let i = 0; Number.isFinite(maxRegistros) ? (i < maxRegistros) : true; i++) {
      if (cancelScan) break;

      const linha = grid.querySelector(`.rowId${i}`);
      if (!linha) break;

      const chamado = linha.querySelector(".eventReferenceCell")?.innerText?.trim();
      if (!chamado) continue;

      const perc = Math.min(100, Math.round(((i + 1) / totalEstimado) * 100));
      progFill.style.width = `${perc}%`;
      progText.textContent = `Verificando chamado ${i + 1}${Number.isFinite(maxRegistros) ? ` de ${maxRegistros}` : ` (Filtro: Todos)`}...`;
      progDetail.textContent = `Chamado: ${chamado} • ${speed.nome}`;

      // Abre o chamado no preview
      linha.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));

      for (let t = 0; t < speed.maxWaitPane; t++) {
        if (cancelScan) break;
        const titulo = document.querySelector("#contentPaneTitle")?.innerText || "";
        if (titulo.startsWith(chamado)) break;
        await esperar(speed.pollMs);
      }

      if (cancelScan) break;

      // Abre aba 'Ações'
      const abaAcoes = [...document.querySelectorAll(".tabLabel")].find(x => {
        const t = (x.textContent || "").trim().toLowerCase();
        return t.includes("ações") || t.includes("acoes") || t === "ações" || t === "acoes";
      });
      if (abaAcoes) {
        abaAcoes.click();
        for (let t = 0; t < speed.maxWaitActions; t++) {
          if (cancelScan) break;
          if (document.querySelector(".actionremarksbody, #actionGrid .dojoxGridRow")) break;
          await esperar(speed.pollMs);
        }
      }

      if (cancelScan) break;

      // Coleta ações do chamado
      let acoes = [];
      if (typeof window.__catiBuscarAcoesAtuaisNoDOM === "function") {
        try { acoes = window.__catiBuscarAcoesAtuaisNoDOM() || []; } catch (_) {}
      }
      if (acoes.length === 0) {
        acoes = extrairAcoesDoDOMLocal();
      }

      const res = verificarElegibilidadeAguardandoInfo(acoes, new Date(), equipeAlvo);
      if (res && res.elegivel) {
        elegiveis.push({
          chamado,
          diasDecorridos: res.diasDecorridos,
          dataPausaStr: res.dataPausaStr,
          dataPausaObj: res.dataPausa,
          linhaIndex: i
        });
      }

      if (speed.waitBetweenTickets > 0 && !cancelScan) {
        await esperar(speed.waitBetweenTickets);
      }
    }

    if (cancelScan) {
      fecharPainel();
      mostrarToast("Varredura cancelada pelo usuário.");
      return;
    }

    if (elegiveis.length === 0) {
      exibirNenhumResultadoAguardandoInfo();
      return;
    }

    elegiveis.sort((a, b) => b.diasDecorridos - a.diasDecorridos);
    exibirResultadosAguardandoInfo(elegiveis);
  }
  window.__catiIniciarVarreduraAguardandoInfo = iniciarVarreduraAguardandoInfo;

  // Exibe o painel de resultados com os chamados elegíveis para encerramento
  function exibirResultadosAguardandoInfo(lista) {
    const config = { scanSpeed: "normal" };
    const panel = criarPainelBase(
      `Aguardando Info há 7+ Dias (${lista.length})`,
      "Chamados elegíveis para encerramento por falta de retorno",
      config
    );

    const banner = document.createElement("div");
    banner.className = "cati-waiting-info-banner";
    banner.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 2px;">⚠️ Prazo regulamentar de 7 dias atingido!</div>
      <div style="font-size: 11px; opacity: 0.9;">Estes chamados foram pausados por "Aguardando Info do Usuário" há 7 dias ou mais sem resposta do solicitante e podem ser encerrados na sua fila.</div>
    `;
    panel.appendChild(banner);

    const toolbar = document.createElement("div");
    toolbar.className = "cati-toolbar";
    const btnCopiar = document.createElement("button");
    btnCopiar.type = "button";
    btnCopiar.className = "cati-btn-secondary";
    btnCopiar.innerHTML = `📋 Copiar Lista de Chamados`;
    btnCopiar.onclick = () => {
      const texto = lista.map(x => `${x.chamado} - Pausado em ${x.dataPausaStr} (${x.diasDecorridos} dias atrás)`).join("\n");
      navigator.clipboard.writeText(texto).then(() => {
        mostrarToast("Lista de chamados copiada com sucesso!");
      }).catch(() => {
        mostrarToast("Não foi possível copiar automaticamente.");
      });
    };
    toolbar.appendChild(btnCopiar);
    panel.appendChild(toolbar);

    const listContainer = document.createElement("div");
    listContainer.className = "cati-list";

    lista.forEach(item => {
      const card = document.createElement("div");
      card.className = "cati-card";

      const cardContent = document.createElement("div");
      cardContent.className = "cati-card-content";

      const topRow = document.createElement("div");
      topRow.className = "cati-card-top";

      const ticketNum = document.createElement("span");
      ticketNum.className = "cati-ticket-num";
      ticketNum.textContent = item.chamado;

      const badge = document.createElement("span");
      badge.className = "cati-badge cati-badge-overdue-days";
      badge.textContent = `⌛ ${item.diasDecorridos} dias sem retorno`;

      topRow.appendChild(ticketNum);
      topRow.appendChild(badge);

      const dateRow = document.createElement("div");
      dateRow.className = "cati-date-time";
      dateRow.innerHTML = `📅 Pausado em: <strong>${item.dataPausaStr}</strong>`;

      cardContent.appendChild(topRow);
      cardContent.appendChild(dateRow);

      const btnAbrir = document.createElement("button");
      btnAbrir.type = "button";
      btnAbrir.className = "cati-btn-abrir-ticket";
      btnAbrir.textContent = "Abrir no Assyst";
      btnAbrir.title = `Abrir o chamado #${item.chamado} em uma nova guia do navegador`;
      btnAbrir.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }

        const numChamado = String(item.chamado || "").trim();
        const urlAssyst = `${window.location.origin}/assystweb/application.do#eventsearch/EventSearchDelegatingDispatchAction.do?dispatch=monitorInit&ajaxMonitor=false&eventSearchContext&queryProfileForm.columnProfileId=0&queryProfileForm.queryProfileId=0&event.lookup.eventRefRange=${encodeURIComponent(numChamado)}`;

        // Abre em uma nova guia do navegador
        window.open(urlAssyst, "_blank");

        // Seleciona na grade em segundo plano caso o analista alterne de volta
        const grid = document.querySelector(".dojoxGridMasterView");
        const linha = grid?.querySelector(`.rowId${item.linhaIndex}`);
        if (linha) {
          linha.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        }

        mostrarToast(`Abrindo chamado ${item.chamado} em nova guia...`);
      };

      card.appendChild(cardContent);
      card.appendChild(btnAbrir);
      listContainer.appendChild(card);
    });

    panel.appendChild(listContainer);

    const footer = document.createElement("footer");
    footer.className = "cati-footer";
    footer.innerHTML = `
      <span style="font-size: 11px; color: #64748b;">Total: <strong>${lista.length}</strong> chamado(s) apto(s)</span>
      <button type="button" class="cati-btn-secondary" id="cati-btn-fechar-7d">Fechar</button>
    `;
    panel.appendChild(footer);

    footer.querySelector("#cati-btn-fechar-7d").onclick = () => fecharPainel();
  }

  function exibirNenhumResultadoAguardandoInfo() {
    const panel = criarPainelBase("Aguardando Info há 7+ Dias", "Resultado da análise da sua fila");
    const empty = document.createElement("div");
    empty.className = "cati-empty-state";
    empty.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
      <h4 style="margin: 0 0 6px 0; color: #1e293b; font-size: 14px;">Nenhum chamado pendente há 7+ dias!</h4>
      <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.4;">
        Todos os chamados com status "Aguardando Info do Usuário" na sua fila foram pausados há menos de 7 dias ou já tiveram retorno.
      </p>
    `;
    panel.appendChild(empty);
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "START_SCAN") {
      iniciarVarredura();
      sendResponse({ ok: true });
      return true;
    }
    if (message.action === "CHECK_ASSYST_STATUS") {
      sendResponse({ isAssyst: isListaGeralChamados() });
      return true;
    }
  });

  let timerVisibilidade = null;
  function agendarAtualizacaoVisibilidade(ms = 300) {
    if (timerVisibilidade) clearTimeout(timerVisibilidade);
    timerVisibilidade = setTimeout(atualizarVisibilidadeBotaoFlutuante, ms);
  }

  // Observador de mutações e navegação para atualizar o botão conforme tela atual (debounced)
  const observer = new MutationObserver(() => {
    agendarAtualizacaoVisibilidade(300);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("hashchange", () => agendarAtualizacaoVisibilidade(150));
  window.addEventListener("popstate", () => agendarAtualizacaoVisibilidade(150));

  // Tentativa inicial imediata
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => agendarAtualizacaoVisibilidade(100), { once: true });
  } else {
    agendarAtualizacaoVisibilidade(100);
  }
})();
