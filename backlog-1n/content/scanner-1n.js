/**
 * Backlog 1N CATI — Scanner de Chamados Aguardando Info (7+ Dias)
 * Extensão dedicada para a equipe 1N CATI do TJCE (Assyst).
 * Operação com velocidade Modo Turbo pré-configurada.
 */
(() => {
  if (window.__cati1nScannerLoaded) return;
  if (!window.location.origin.includes("cati.tjce.jus.br") && !window.location.hostname.includes("cati.tjce.jus.br")) return;
  window.__cati1nScannerLoaded = true;

  const EQUIPE_ALVO = "1N CATI";
  let cancelScan = false;

  // Velocidade fixa em Modo Turbo conforme especificado
  const PERFIL_TURBO = {
    pollMs: 50,
    maxWaitPane: 10,
    maxWaitActions: 8,
    waitBetweenTickets: 50,
    nome: "Turbo (⚡)"
  };

  function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

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
  window.__cati1nObterLimiteVarredura = obterLimiteVarreduraGrade;

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

  // Validação estrita do departamento da equipe 1N CATI
  function isDeptoEquipeAlvo(depto) {
    if (!depto) return false;
    const d = String(depto).trim().toLowerCase();

    // Rejeitar expressamente outras equipes
    if (d.includes("2n") || d.includes("3n")) {
      return false;
    }

    // Aceitar variações da equipe 1N CATI
    return d.includes("1n cati") ||
           d.includes("atendimento 1n") ||
           (d.includes("1n") && !d.includes("2n") && !d.includes("3n")) ||
           (d.includes("cati") && !d.includes("remoto") && !d.includes("2n") && !d.includes("3n"));
  }

  // Verifica se o chamado está com 7+ dias de pausa por "Aguardando Info do Usuário" feito pelo 1N
  function verificarElegibilidadeAguardandoInfo(acoes, dataReferencia = new Date()) {
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

    const isPausaUsuario = (acao) => {
      const tipo = String(acao._tipo || acao.type || acao.tipoAcao || "").trim().toLowerCase();
      const ehAguardando = (tipo.includes("aguardando info") ||
                            tipo.includes("aguardando informacao") ||
                            tipo.includes("aguardando informação")) &&
                           !tipo.includes("fornecedor");
      if (!ehAguardando) return false;

      // Validação estrita: pausa realizada pelo departamento 1N CATI
      const depto = acao.actingDept || acao.deptoAcionamento || acao.dept || "";
      return isDeptoEquipeAlvo(depto);
    };

    const isReativacao = (tipo) => {
      return tipo.includes("email recebido") ||
             tipo.includes("info recebida") ||
             tipo.includes("informação recebida") ||
             tipo.includes("informacao recebida") ||
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
  window.__cati1nVerificarElegibilidade = verificarElegibilidadeAguardandoInfo;

  // Verifica se o usuário está na tela de lista geral / fila de chamados do Assyst
  function isListaGeralChamados() {
    if (!window.location.origin.includes("cati.tjce.jus.br") && !window.location.hostname.includes("cati.tjce.jus.br")) {
      return false;
    }

    const hash = decodeURIComponent(window.location.hash || "").toLowerCase();
    const href = decodeURIComponent(window.location.href || "").toLowerCase();

    // Se estiver em detalhes do chamado
    if ((hash.includes("displayevent") || hash.includes("eventdelegating") || href.includes("displayevent")) &&
        !hash.includes("eventsearch") && !href.includes("eventsearch")) {
      return false;
    }

    // Se aba ativa for chamado individual
    const tabAtiva = document.querySelector(".dijitTabChecked .tabLabel, .dijitTab[aria-selected='true'] .tabLabel, .dijitTabChecked, .dijitTab[aria-selected='true']");
    if (tabAtiva) {
      const textoTab = (tabAtiva.innerText || "").trim();
      if (/\b([A-Za-z]{0,3}\d{5,10})\b/.test(textoTab) && !/pesquisa|search|fila/i.test(textoTab)) {
        return false;
      }
    }

    if (hash.includes("eventsearch") || href.includes("eventsearch")) {
      return true;
    }

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
  window.__cati1nIsListaGeralChamados = isListaGeralChamados;

  // Criar e gerenciar botão flutuante na fila
  function criarBotaoFlutuante() {
    const naListaGeral = isListaGeralChamados();
    let btn = document.getElementById("cati-1n-trigger-waiting-info");

    if (!naListaGeral) {
      if (btn) btn.style.display = "none";
      return;
    }

    if (!btn) {
      btn = document.createElement("button");
      btn.id = "cati-1n-trigger-waiting-info";
      btn.type = "button";
      btn.title = "1N CATI: Verificar chamados na fila com 7+ dias de pausa 'Aguardando Info do Usuário' para encerramento";
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/>
        </svg>
        <span>Aguardando Info (7+ Dias)</span>
        <span class="cati-1n-btn-badge">1N</span>
      `;
      btn.onclick = () => iniciarVarredura();
      document.body.appendChild(btn);
    }
    btn.style.display = "inline-flex";
  }

  function fecharPainel() {
    const overlay = document.querySelector(".cati-1n-modal-overlay");
    if (overlay) overlay.remove();
  }

  function mostrarToast(mensagem, duracao = 3000) {
    const antigo = document.querySelector(".cati-1n-toast");
    if (antigo) antigo.remove();

    const toast = document.createElement("div");
    toast.className = "cati-1n-toast";
    toast.textContent = mensagem;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("cati-1n-toast-fadeout");
      setTimeout(() => toast.remove(), 300);
    }, duracao);
  }

  function criarPainelBase(titulo, subtitulo) {
    fecharPainel();

    const overlay = document.createElement("div");
    overlay.className = "cati-1n-modal-overlay";

    const panel = document.createElement("div");
    panel.className = "cati-1n-modal-panel";

    const header = document.createElement("header");
    header.className = "cati-1n-modal-header";

    const info = document.createElement("div");
    info.className = "cati-1n-modal-header-info";

    const h3 = document.createElement("h3");
    h3.className = "cati-1n-modal-title";
    h3.textContent = titulo;

    const sub = document.createElement("div");
    sub.className = "cati-1n-modal-subtitle";
    sub.textContent = subtitulo;

    info.appendChild(h3);
    info.appendChild(sub);

    const closeBtn = document.createElement("button");
    closeBtn.className = "cati-1n-btn-close";
    closeBtn.type = "button";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Fechar";
    closeBtn.onclick = () => {
      cancelScan = true;
      fecharPainel();
    };

    header.appendChild(info);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    return panel;
  }

  // Extração de ações da aba Ações no Assyst
  function extrairAcoesDoDOM() {
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

  // Iniciar processo de varredura
  async function iniciarVarredura() {
    cancelScan = false;

    const grid = document.querySelector(".dojoxGridMasterView");
    if (!grid) {
      alert("Backlog 1N: Não foi possível localizar a fila do Assyst nesta página.");
      return;
    }

    const infoLimite = obterLimiteVarreduraGrade();
    const speed = PERFIL_TURBO;
    const subTexto = `Varrendo fila • ${EQUIPE_ALVO} • Modo ${speed.nome} • Filtro: ${infoLimite.rotulo}`;
    const panel = criarPainelBase("Aguardando Info há 7+ Dias (1N)", subTexto);

    if (infoLimite.isAltoVolume) {
      mostrarToast(`⚠️ Filtro de ${infoLimite.rotulo} chamados ativo. A verificação pode demorar um pouco.`);
    }

    const alertaVolumeHtml = infoLimite.isAltoVolume ? `
      <div class="cati-1n-volume-alert">
        ⚠️ <strong>Filtro de ${infoLimite.rotulo} chamados ativo:</strong> A verificação pode demorar um pouco.
      </div>
    ` : "";

    const body = document.createElement("div");
    body.className = "cati-1n-progress-body";
    body.innerHTML = `
      <div class="cati-1n-spinner"></div>
      <div class="cati-1n-progress-text" id="cati-1n-prog-text">Analisando chamados da fila do 1N CATI...</div>
      <div class="cati-1n-progress-detail" id="cati-1n-prog-detail">Verificando histórico de pausas</div>
      ${alertaVolumeHtml}
      <div class="cati-1n-progress-bar-bg">
        <div class="cati-1n-progress-bar-fill" id="cati-1n-prog-fill"></div>
      </div>
      <button type="button" class="cati-1n-btn-secondary" id="cati-1n-btn-cancel-scan" style="margin-top: 10px;">Cancelar Varredura</button>
    `;
    panel.appendChild(body);

    const cancelBtn = body.querySelector("#cati-1n-btn-cancel-scan");
    cancelBtn.onclick = () => {
      cancelScan = true;
      body.querySelector("#cati-1n-prog-text").textContent = "Cancelando...";
    };

    const progText = body.querySelector("#cati-1n-prog-text");
    const progDetail = body.querySelector("#cati-1n-prog-detail");
    const progFill = body.querySelector("#cati-1n-prog-fill");

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
      progDetail.textContent = `Chamado: ${chamado} • ${EQUIPE_ALVO} • ${speed.nome}`;

      // Abre o chamado no painel de preview
      linha.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));

      for (let t = 0; t < speed.maxWaitPane; t++) {
        if (cancelScan) break;
        const titulo = document.querySelector("#contentPaneTitle")?.innerText || "";
        if (titulo.startsWith(chamado)) break;
        await esperar(speed.pollMs);
      }

      if (cancelScan) break;

      // Abre a aba 'Ações'
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
      let acoes = extrairAcoesDoDOM();

      const res = verificarElegibilidadeAguardandoInfo(acoes, new Date());
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
      exibirNenhumResultado();
      return;
    }

    elegiveis.sort((a, b) => b.diasDecorridos - a.diasDecorridos);
    exibirResultados(elegiveis);
  }
  window.__cati1nIniciarVarredura = iniciarVarredura;

  function exibirResultados(lista) {
    const panel = criarPainelBase(
      `Aguardando Info há 7+ Dias (${lista.length})`,
      `Chamados elegíveis para encerramento por falta de retorno • ${EQUIPE_ALVO}`
    );

    const banner = document.createElement("div");
    banner.className = "cati-1n-banner";
    banner.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 2px;">⚠️ Prazo regulamentar de 7 dias atingido!</div>
      <div style="font-size: 11px; opacity: 0.9;">Estes chamados foram pausados por "Aguardando Info do Usuário" há 7 dias ou mais pela equipe <strong>${EQUIPE_ALVO}</strong> e podem ser encerrados na sua fila.</div>
    `;
    panel.appendChild(banner);

    const toolbar = document.createElement("div");
    toolbar.className = "cati-1n-toolbar";
    const btnCopiar = document.createElement("button");
    btnCopiar.type = "button";
    btnCopiar.className = "cati-1n-btn-secondary";
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
    listContainer.className = "cati-1n-list";

    lista.forEach(item => {
      const card = document.createElement("div");
      card.className = "cati-1n-card";

      const cardContent = document.createElement("div");
      cardContent.className = "cati-1n-card-content";

      const topRow = document.createElement("div");
      topRow.className = "cati-1n-card-top";

      const ticketNum = document.createElement("span");
      ticketNum.className = "cati-1n-ticket-num";
      ticketNum.textContent = item.chamado;

      const badge = document.createElement("span");
      badge.className = "cati-1n-badge-overdue";
      badge.textContent = `⌛ ${item.diasDecorridos} dias sem retorno`;

      topRow.appendChild(ticketNum);
      topRow.appendChild(badge);

      const dateRow = document.createElement("div");
      dateRow.className = "cati-1n-date-time";
      dateRow.innerHTML = `📅 Pausado em: <strong>${item.dataPausaStr}</strong>`;

      cardContent.appendChild(topRow);
      cardContent.appendChild(dateRow);

      const btnAbrir = document.createElement("button");
      btnAbrir.type = "button";
      btnAbrir.className = "cati-1n-btn-abrir";
      btnAbrir.textContent = "Abrir no Assyst";
      btnAbrir.title = `Abrir o chamado #${item.chamado} em uma nova guia do navegador`;
      btnAbrir.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }

        const numChamado = String(item.chamado || "").trim();
        const urlAssyst = `${window.location.origin}/assystweb/application.do#eventsearch/EventSearchDelegatingDispatchAction.do?dispatch=monitorInit&ajaxMonitor=false&eventSearchContext&queryProfileForm.columnProfileId=0&queryProfileForm.queryProfileId=0&event.lookup.eventRefRange=${encodeURIComponent(numChamado)}`;

        window.open(urlAssyst, "_blank");

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
    footer.className = "cati-1n-footer";
    footer.innerHTML = `
      <span style="font-size: 11px; color: #64748b;">Total: <strong>${lista.length}</strong> chamado(s) apto(s)</span>
      <button type="button" class="cati-1n-btn-secondary" id="cati-1n-btn-fechar">Fechar</button>
    `;
    panel.appendChild(footer);

    footer.querySelector("#cati-1n-btn-fechar").onclick = () => fecharPainel();
  }

  function exibirNenhumResultado() {
    const panel = criarPainelBase("Aguardando Info há 7+ Dias (1N)", `Resultado da varredura • ${EQUIPE_ALVO}`);

    const empty = document.createElement("div");
    empty.className = "cati-1n-empty";
    empty.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">Nenhum chamado elegível encontrado</div>
      <div style="font-size: 12px; color: #64748b; max-width: 380px; margin: 0 auto;">
        Nenhum chamado da equipe <strong>${EQUIPE_ALVO}</strong> na visualização atual está pausado por "Aguardando Info do Usuário" há 7 dias ou mais sem resposta.
      </div>
      <button type="button" class="cati-1n-btn-secondary" id="cati-1n-btn-empty-close" style="margin-top: 16px;">Fechar</button>
    `;
    panel.appendChild(empty);
    empty.querySelector("#cati-1n-btn-empty-close").onclick = () => fecharPainel();
  }

  // Observer para monitorar navegação no Assyst
  let timerVerificacao = null;
  function agendarVerificacao(ms = 300) {
    if (timerVerificacao) clearTimeout(timerVerificacao);
    timerVerificacao = setTimeout(criarBotaoFlutuante, ms);
  }

  const observer = new MutationObserver(() => agendarVerificacao(200));
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  window.addEventListener("hashchange", () => agendarVerificacao(150));
  window.addEventListener("popstate", () => agendarVerificacao(150));

  agendarVerificacao(500);
})();
