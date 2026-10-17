(() => {
  // Evitar injeção duplicada ou fora do domínio cati.tjce.jus.br
  if (window.__catiAssystSlaLoaded) return;
  if (!window.location.origin.includes("cati.tjce.jus.br") && !window.location.hostname.includes("cati.tjce.jus.br")) return;
  window.__catiAssystSlaLoaded = true;

  let isCalculating = false;
  let ultimoChamadoId = null;
  let cacheResultados = {};
  let debounceTimer = null;
  let safetyTimeout = null;

  function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Disparar evento de clique completo compatível com Dojo Dijit
  function dispararClique(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      el.click();
    } catch (_) {
      el.click();
    }
  }

  // Verifica se uma ação é uma ação de pausa do chamado
  function isAcaoPausa(nome) {
    if (!nome) return false;
    const t = nome.toLowerCase();
    return t.includes("aguardando info") ||
           t.includes("aguardando usuário") ||
           t.includes("aguardando usuario") ||
           t.includes("atendimento programado") ||
           t.includes("atendimento está sendo programado") ||
           t.includes("pausa") ||
           t.includes("pausado");
  }

  // Verifica se uma ação é a ação padrão de despausa / retomada do chamado
  function isAcaoDespausa(nome) {
    if (!nome) return false;
    const t = nome.toLowerCase();
    return t.includes("info recebidas") ||
           t.includes("informações recebidas") ||
           t.includes("informacoes recebidas") ||
           t.includes("info recebida") ||
           t.includes("informação recebida") ||
           t.includes("informacao recebida") ||
           t.includes("retorno do usuário") ||
           t.includes("retorno do usuario");
  }

  // Verifica se o analista está dentro dos detalhes de um chamado
  function isDentroDeChamado() {
    const hash = decodeURIComponent(window.location.hash || "").toLowerCase();
    const href = decodeURIComponent(window.location.href || "").toLowerCase();

    // 1. URLs características de abertura de chamado
    if (hash.includes("displayevent") ||
        hash.includes("eventdelegating") ||
        href.includes("displayevent") ||
        href.includes("eventdelegating")) {
      return true;
    }

    // 2. Formulário de chamado visível no DOM
    const formChamado = document.querySelector("form#eventForm, form[id*='ManageEventForm'], form[name='ManageEventForm']");
    if (formChamado && formChamado.style.display !== "none" && (formChamado.offsetWidth > 0 || formChamado.offsetHeight > 0)) {
      return true;
    }

    // 3. Campos característicos do chamado
    if (document.querySelector("#ManageEventForm_ES1_affectedUser_textNode, #ManageEventForm_ES1_affectedUserTelephone, input[name='eventForm.event.formattedReference']")) {
      return true;
    }

    // Se estiver explicitamente na tela de pesquisa/fila geral
    if (hash.includes("eventsearch") || href.includes("eventsearch")) {
      return false;
    }

    // 4. Cabeçalho com número do chamado
    const titleEl = document.querySelector("#contentPaneTitle");
    if (titleEl && /\b([A-Za-z]{0,3}\d{5,10})\b/.test(titleEl.innerText || "")) {
      return true;
    }

    return false;
  }

  // Obter o identificador do chamado ativo no momento
  function obterIdChamadoAtivo() {
    const dentro = isDentroDeChamado();

    // Quando dentro do chamado, priorizar os dados do chamado aberto
    if (dentro) {
      const titleEl = document.querySelector("#contentPaneTitle");
      if (titleEl) {
        const txt = (titleEl.innerText || "").trim();
        const matchNum = txt.match(/\b([A-Za-z]{0,3}\d{5,10})\b/);
        if (matchNum) return matchNum[1];
      }

      const inputEventId = document.querySelector('input[name="eventForm.event.id"], input[name="eventForm.event.formattedReference"], input[name="eventId"]');
      if (inputEventId && inputEventId.value) {
        const v = inputEventId.value.trim();
        if (v) return v;
      }

      const decHash = decodeURIComponent(window.location.hash || "");
      const decHref = decodeURIComponent(window.location.href || "");
      const matchUrl = decHref.match(/eventId=([A-Za-z0-9_-]+)/i) ||
                       decHash.match(/eventId=([A-Za-z0-9_-]+)/i) ||
                       decHref.match(/eventReference=([A-Za-z0-9_-]+)/i) ||
                       decHash.match(/eventReference=([A-Za-z0-9_-]+)/i);
      if (matchUrl) return matchUrl[1];
    }

    // 1. Linha selecionada na grid da fila do Assyst
    const selectedRow = document.querySelector(".dojoxGridRowSelected, .dojoxGridRow[aria-selected='true'], tr.selected");
    if (selectedRow) {
      const refCell = selectedRow.querySelector(".eventReferenceCell, td.eventReference, [class*='eventReference'], td:first-child");
      if (refCell && refCell.innerText) {
        const m = refCell.innerText.trim().match(/\b([A-Za-z]{0,3}\d{5,10})\b/);
        if (m) return m[1];
      }
      const cells = selectedRow.querySelectorAll("td, .dojoxGridCell");
      for (const cell of cells) {
        const mCell = (cell.innerText || "").trim().match(/^([A-Za-z]{0,3}\d{5,10})$/);
        if (mCell) return mCell[1];
      }
      const mRow = (selectedRow.innerText || "").match(/\b([A-Za-z]{0,3}\d{5,10})\b/);
      if (mRow) return mRow[1];
    }

    // 2. Título do painel (#contentPaneTitle)
    const titleEl = document.querySelector("#contentPaneTitle");
    if (titleEl) {
      const txt = (titleEl.innerText || "").trim();
      const matchNum = txt.match(/\b([A-Za-z]{0,3}\d{5,10})\b/);
      if (matchNum) return matchNum[1];
    }

    // 3. Parâmetro na URL decodificada (quando dentro do chamado)
    const decHash = decodeURIComponent(window.location.hash || "");
    const decHref = decodeURIComponent(window.location.href || "");
    const matchUrl = decHref.match(/eventId=([A-Za-z0-9_-]+)/i) ||
                     decHash.match(/eventId=([A-Za-z0-9_-]+)/i) ||
                     decHref.match(/eventReference=([A-Za-z0-9_-]+)/i) ||
                     decHash.match(/eventReference=([A-Za-z0-9_-]+)/i);
    if (matchUrl) return matchUrl[1];

    // 4. Campo de entrada no formulário do Assyst
    const inputEventId = document.querySelector('input[name="eventForm.event.id"], input[name="eventForm.event.formattedReference"], input[name="eventId"]');
    if (inputEventId && inputEventId.value) {
      const v = inputEventId.value.trim();
      if (v) return v;
    }

    return null;
  }

  // Obter configurações de SLA salvas na extensão (meta padrão: 1 hora)
  async function obterConfiguracoesSLA() {
    return new Promise(resolve => {
      if (!chrome.storage || !chrome.storage.local) {
        resolve({
          slaTargetHours: 1,
          slaCalculationMode: "business",
          slaWorkStart: "08:00",
          slaWorkEnd: "18:00",
          slaBoxScale: 100
        });
        return;
      }

      chrome.storage.local.get(["agenda_settings"], result => {
        const s = result?.agenda_settings || {};
        resolve({
          slaTargetHours: Number(s.slaTargetHours) || 1,
          slaCalculationMode: s.slaCalculationMode === "calendar" ? "calendar" : "business",
          slaWorkStart: "08:00",
          slaWorkEnd: "18:00",
          slaBoxScale: Math.max(70, Math.min(160, Number(s.slaBoxScale) || 100))
        });
      });
    });
  }

  // Aplicar escala visual na caixa flutuante do SLA via variável CSS
  function aplicarEscalaCaixa(scalePercent) {
    const scale = Math.max(70, Math.min(160, Number(scalePercent) || 100));
    const trigger = document.getElementById("cati-sla-floating-trigger");
    if (trigger) {
      trigger.style.setProperty("--sla-scale", (scale / 100).toFixed(2));
    }
  }

  // Ajustar escala rapidamente a partir do popover da caixa flutuante
  async function ajustarEscalaLocal(delta) {
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(["agenda_settings"], result => {
      const s = result?.agenda_settings || {};
      const atual = Math.max(70, Math.min(160, Number(s.slaBoxScale) || 100));
      const novo = Math.max(70, Math.min(160, Math.round((atual + delta) / 5) * 5));
      s.slaBoxScale = novo;
      chrome.storage.local.set({ agenda_settings: s }, () => {
        aplicarEscalaCaixa(novo);
        const lbl = document.querySelector(".pop-scale-val");
        if (lbl) lbl.textContent = `${novo}%`;
      });
    });
  }

  // Parser para datas no padrão do Assyst (ex.: 02/10/26 18:52 ou 02/10/2026 18:52:00)
  function parseDataAssyst(str) {
    if (!str) return null;
    const match = str.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
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

  function formatarHorasMinutos(totalMinutos) {
    const minutosPositivos = Math.max(0, Math.abs(totalMinutos));
    const h = Math.floor(minutosPositivos / 60);
    const m = minutosPositivos % 60;
    if (h === 0) return `${m}m`;
    return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  }

  function formatarDataHora(date) {
    if (!date) return "-";
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${d}/${m}/${y} às ${h}:${min}`;
  }

  function formatarHoraCurta(date) {
    if (!date) return "-";
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${d}/${m} ${h}:${min}`;
  }

  // Calcular minutos úteis de expediente (seg a sex, entre horaInicio e horaFim)
  function calcularMinutosUteis(inicio, fim, horaInicioStr, horaFimStr) {
    if (fim <= inicio) return 0;

    let [hIni, mIni] = (horaInicioStr || "08:00").split(":").map(Number);
    let [hFim, mFim] = (horaFimStr || "18:00").split(":").map(Number);

    let totalMinutos = 0;
    let cur = new Date(inicio);

    while (cur < fim) {
      let diaSemana = cur.getDay(); // 0 = Domingo, 6 = Sábado
      if (diaSemana !== 0 && diaSemana !== 6) {
        let janelaInicio = new Date(cur);
        janelaInicio.setHours(hIni, mIni, 0, 0);

        let janelaFim = new Date(cur);
        janelaFim.setHours(hFim, mFim, 0, 0);

        let tIni = Math.max(cur.getTime(), janelaInicio.getTime());
        let tFim = Math.min(fim.getTime(), janelaFim.getTime());

        if (tFim > tIni) {
          totalMinutos += Math.floor((tFim - tIni) / 60000);
        }
      }

      cur.setDate(cur.getDate() + 1);
      cur.setHours(0, 0, 0, 0);
    }

    return totalMinutos;
  }

  function calcularMinutosIntervalo(inicio, fim, config) {
    if (fim <= inicio) return 0;
    if (config.slaCalculationMode === "calendar") {
      return Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / 60000));
    }
    return calcularMinutosUteis(inicio, fim, config.slaWorkStart, config.slaWorkEnd);
  }

  // Extrair 'Nome de Departamento de Serviço de acionamento' e 'Nome do Departamento de Serviço atribuído'
  function extrairDepartamentosDeLinha(row, cellEls, texts, dataIdx) {
    let deptoAcionamento = "";
    let deptoAtribuido = "";

    // 1. Acesso direto por índices canônicos da grade de Ações do Assyst (Col 5 = Acionamento, Col 7 = Atribuído)
    if (cellEls && cellEls.length >= 8) {
      const dAcion = (cellEls[5]?.innerText || "").trim();
      const dAtrib = (cellEls[7]?.innerText || "").trim();
      if (dAcion && (/\b(?:1|2|3|#)N\b/i.test(dAcion) || dAcion.includes("CATI"))) {
        deptoAcionamento = dAcion;
      }
      if (dAtrib && (/\b(?:1|2|3|#)N\b/i.test(dAtrib) || dAtrib.includes("CATI"))) {
        deptoAtribuido = dAtrib;
      }
    }

    // 2. Busca por células que representem departamentos da TI (fallback dinâmico)
    if (!deptoAcionamento || !deptoAtribuido) {
      const deptosEncontrados = [];
      for (let i = 0; i < texts.length; i++) {
        if (i === dataIdx) continue;
        const t = texts[i];
        if (/\b(?:1|2|3|#)N\b/i.test(t) || t.includes("CATI")) {
          deptosEncontrados.push(t);
        }
      }

      if (!deptoAcionamento && deptosEncontrados.length >= 1) {
        deptoAcionamento = deptosEncontrados[0];
      }
      if (!deptoAtribuido && deptosEncontrados.length >= 2) {
        deptoAtribuido = deptosEncontrados[1];
      }
    }

    // 3. Fallback por posições canônicas em textos
    if (!deptoAcionamento && texts.length > 3) {
      deptoAcionamento = texts[3];
    }
    if (!deptoAtribuido && texts.length > 4) {
      deptoAtribuido = texts[4];
    }

    return { deptoAcionamento, deptoAtribuido };
  }

  // Verificar o estado do Relógio nativo de ANS (SLA) do Assyst (Jukebox)
  function verificarRelogioAnsNativoAssyst() {
    const clockEl = document.getElementById("jukeboxSlaClock") || document.querySelector(".jukeboxSlaClock");
    if (!clockEl) return null;
    const isStopped = clockEl.querySelector(".jukeboxSlaClockStoppedIcon") !== null ||
                      clockEl.classList.contains("jukeboxSlaClockStoppedIcon") ||
                      /parado/i.test(clockEl.innerText || clockEl.title || "");
    const nameEl = document.getElementById("jukeboxSlaName");
    const slaNome = nameEl ? nameEl.innerText.trim() : "";
    return { isStopped, slaNome };
  }

  // Extrair linhas de ações do DOM do Assyst
  function extrairAcoesDeLinhas(linhas) {
    const acoes = [];
    const dateRegex = /(\d{2}\/\d{2}\/\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)/;

    linhas.forEach(row => {
      const cellEls = [...row.querySelectorAll("td, th, .dojoxGridCell")];
      const texts = (cellEls.length > 0 ? cellEls : [row]).map(c => (c.innerText || "").trim()).filter(Boolean);

      // Descartar rigorosamente linhas da grade da fila geral (que começam com código/número de chamado ou têm classe de referência)
      const primeiraCelula = texts[0] || "";
      const isLinhaFila = /^[RS]?\d{5,10}$/i.test(primeiraCelula) ||
                          row.querySelector(".eventReferenceCell, .itemA_nameCell, .affectedUserNameCell") !== null ||
                          (row.closest && row.closest("table[id*='EventSearch'], [id*='eventSearchGrid']") !== null);
      if (isLinhaFila) return;

      let dataObj = null;
      let dataStr = null;
      let dataIdx = -1;

      for (let idx = 0; idx < texts.length; idx++) {
        const m = texts[idx].match(dateRegex);
        if (m) {
          dataStr = m[1];
          dataObj = parseDataAssyst(dataStr);
          if (dataObj) {
            dataIdx = idx;
            break;
          }
        }
      }

      if (!dataObj) return;

      let tipoAcao = null;
      for (let idx = 0; idx < texts.length; idx++) {
        if (idx === dataIdx) continue;
        const val = texts[idx];
        if (/^\d{1,3}$/.test(val)) continue;
        if (dateRegex.test(val)) continue;
        if (val.length >= 3) {
          tipoAcao = val;
          break;
        }
      }

      // Extrair 'Nome de Departamento de Serviço de acionamento' e 'Nome do Departamento de Serviço atribuído'
      const { deptoAcionamento, deptoAtribuido } = extrairDepartamentosDeLinha(row, cellEls, texts, dataIdx);

      let remarks = "";
      const rb = row.querySelector(".actionremarksbody");
      if (rb) remarks = (rb.textContent || "").replace(/\u00a0/g, " ").trim();

      if (tipoAcao && dataObj) {
        const chave = `${tipoAcao}_${dataStr}_${texts.slice(0, 5).join("_")}`;
        if (!acoes.some(a => a.chave === chave)) {
          acoes.push({
            chave,
            type: tipoAcao,
            tipoAcao,
            dateRaw: dataStr,
            dataStr,
            dataObj,
            deptoAcionamento,
            deptoAtribuido,
            actingDept: deptoAcionamento,
            assignedDept: deptoAtribuido,
            remarks,
            cells: texts,
            linhaTexto: texts.join(" | ")
          });
        }
      }
    });

    return acoes;
  }

  let expandiuHdrUmaVez = false;
  async function garantirExpansaoRemarks(grid) {
    if (expandiuHdrUmaVez) return;
    const isExpandido = grid && /\bexpandedall\b/.test(grid.className);
    if (isExpandido) {
      expandiuHdrUmaVez = true;
      return;
    }
    const hdr = document.getElementById("actionGridHdr0");
    if (hdr) {
      dispararClique(hdr);
      expandiuHdrUmaVez = true; // Nunca alternar de volta
      await esperar(400);
    }
  }

  // Coletar todas as ações da grade Dojo (#actionGrid) suportando virtual scroll e grandes históricos
  async function coletarTodasAcoesGridDojo(grid) {
    if (!grid) return [];

    const boxes = Array.from(grid.querySelectorAll(".dojoxGridScrollbox"));
    const scrollbox = boxes.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || grid;

    const acoesMap = new Map();

    const extrairLinhasAtuais = () => {
      const rows = grid.querySelectorAll(".dojoxGridRow, .dojoxGridRow.actionGridRow");
      rows.forEach(row => {
        const byIdx = {};
        for (const td of row.querySelectorAll("td.dojoxGridCell")) {
          const i = td.getAttribute("idx");
          if (i != null) byIdx[i] = (td.textContent || "").trim();
        }

        const type = byIdx["2"] || "";
        const dateRaw = byIdx["3"] || "";
        const actor = byIdx["4"] || "";
        const actingDept = byIdx["5"] || "";
        const assignedUser = byIdx["6"] || "";
        const assignedDept = byIdx["7"] || "";
        const ansName = byIdx["8"] || "";
        const actionId = byIdx["13"] || "";

        let remarks = "";
        const rb = row.querySelector("td.collapsable .actionremarksbody, .actionremarksbody");
        if (rb) remarks = (rb.textContent || "").replace(/\u00a0/g, " ").trim();

        if (dateRaw && type) {
          const dataObj = parseDataAssyst(dateRaw);
          if (dataObj) {
            const key = actionId ? `aid_${actionId}` : `${type}_${dateRaw}_${actor}_${actingDept}_${acoesMap.size}`;
            if (!acoesMap.has(key)) {
              acoesMap.set(key, {
                chave: key,
                type,
                tipoAcao: type,
                dateRaw,
                dataStr: dateRaw,
                dataObj,
                actor,
                actingDept,
                assignedUser,
                assignedDept,
                ansName,
                actionId,
                remarks,
                deptoAcionamento: actingDept,
                deptoAtribuido: assignedDept,
                linhaTexto: `${type} | ${dateRaw} | ${actingDept} | ${assignedDept} | ${remarks}`
              });
            } else if (remarks && !acoesMap.get(key).remarks) {
              acoesMap.get(key).remarks = remarks;
            }
          }
        }
      });
    };

    // 1. Coleta inicial no topo
    scrollbox.scrollTop = 0;
    try { scrollbox.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
    await esperar(120);
    extrairLinhasAtuais();

    // 2. Se houver barra de rolagem (virtual scroll com mais linhas que a altura do view)
    if (scrollbox.scrollHeight > scrollbox.clientHeight + 10) {
      const step = Math.max(120, Math.round(scrollbox.clientHeight * 0.7));
      let passes = 0;
      let lastScroll = -1;

      while (scrollbox.scrollTop + scrollbox.clientHeight < scrollbox.scrollHeight && passes < 60) {
        if (scrollbox.scrollTop === lastScroll) break;
        lastScroll = scrollbox.scrollTop;

        scrollbox.scrollTop += step;
        try { scrollbox.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
        await esperar(100);
        extrairLinhasAtuais();
        passes++;
      }

      // Leitura na posição final (fundo da grade)
      scrollbox.scrollTop = scrollbox.scrollHeight;
      try { scrollbox.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
      await esperar(120);
      extrairLinhasAtuais();

      // Restaurar scroll para o topo para manter visual limpo
      scrollbox.scrollTop = 0;
      try { scrollbox.dispatchEvent(new Event("scroll", { bubbles: true })); } catch (_) {}
    }

    return Array.from(acoesMap.values());
  }

  // Buscar todas as ações visíveis no DOM com suporte a virtual scroll e expansão Dojo
  function buscarAcoesAtuaisNoDOM() {
    // 1. Extração prioritária via células da grade nativa Dojo (#actionGrid)
    const gridRows = document.querySelectorAll("#actionGrid .dojoxGridRow, .dojoxGridRow.actionGridRow");
    if (gridRows.length > 0) {
      const acoesDojo = [];
      gridRows.forEach(row => {
        const byIdx = {};
        for (const td of row.querySelectorAll("td.dojoxGridCell")) {
          const i = td.getAttribute("idx");
          if (i != null) byIdx[i] = (td.textContent || "").trim();
        }

        const type = byIdx["2"] || "";
        const dateRaw = byIdx["3"] || "";
        const actor = byIdx["4"] || "";
        const actingDept = byIdx["5"] || "";
        const assignedUser = byIdx["6"] || "";
        const assignedDept = byIdx["7"] || "";
        const ansName = byIdx["8"] || "";
        const actionId = byIdx["13"] || "";

        let remarks = "";
        const rb = row.querySelector("td.collapsable .actionremarksbody, .actionremarksbody");
        if (rb) remarks = (rb.textContent || "").replace(/\u00a0/g, " ").trim();

        if (dateRaw && type) {
          const dataObj = parseDataAssyst(dateRaw);
          if (dataObj) {
            acoesDojo.push({
              chave: `${type}_${dateRaw}_${actionId || acoesDojo.length}`,
              type,
              tipoAcao: type,
              dateRaw,
              dataStr: dateRaw,
              dataObj,
              actor,
              actingDept,
              assignedUser,
              assignedDept,
              ansName,
              actionId,
              remarks,
              deptoAcionamento: actingDept,
              deptoAtribuido: assignedDept,
              linhaTexto: `${type} | ${dateRaw} | ${actingDept} | ${assignedDept} | ${remarks}`
            });
          }
        }
      });
      if (acoesDojo.length > 0) return acoesDojo;
    }

    // 2. Procurar no painel de ações se existir
    const paneActions = document.getElementById("event.tabs.actions_pane") ||
                        document.querySelector("[id*='actions_pane'], [id*='actionsTab'], [id*='actionGrid'], [id*='Action']");
    if (paneActions) {
      const rows = paneActions.querySelectorAll("tr, .dojoxGridRow, .actionremarksbody");
      if (rows.length > 0) {
        const achadas = extrairAcoesDeLinhas(rows);
        if (achadas.length > 0) return achadas;
      }
    }

    // 3. Procurar em qualquer tabela ou lista de ações na página (filtrando linhas de fila)
    const rowsGerais = document.querySelectorAll(".actionremarksbody, .actionRow, tr, .dojoxGridRow");
    return extrairAcoesDeLinhas(rowsGerais);
  }
  window.__catiBuscarAcoesAtuaisNoDOM = buscarAcoesAtuaisNoDOM;

  // Extrair ações abrindo abas ou painéis se necessário de forma robusta e resiliente
  async function extrairAcoesDoAssyst() {
    // 1. Verificar se as ações já estão carregadas, visíveis e com grid expandido
    const gridExistente = document.getElementById("actionGrid");
    const estaTotalmenteExpandido = gridExistente && /\bexpandedall\b/.test(gridExistente.className);
    if (gridExistente) {
      const acoesDojo = await coletarTodasAcoesGridDojo(gridExistente);
      if (acoesDojo.length > 0 && estaTotalmenteExpandido) {
        return acoesDojo;
      }
    }

    // Guardar a posição atual de scroll da janela e do contêiner principal
    const posScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const posScrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const scrollEl = document.getElementById("contentPane") || document.scrollingElement || document.documentElement;
    const prevScrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const prevScrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

    function restaurarScroll() {
      try {
        if (scrollEl) {
          scrollEl.scrollTop = prevScrollTop;
          scrollEl.scrollLeft = prevScrollLeft;
        }
        window.scrollTo(posScrollX, posScrollY);
      } catch (_) {}
    }

    try {
      // 2. Se houver painel retrátil (tela cheia do chamado), expandir se estiver fechado
      const paneTitle = document.getElementById("event.tabs.actions_titleDiv");
      if (paneTitle) {
        const paneActions = document.getElementById("event.tabs.actions_pane");
        const isClosed = paneTitle.getAttribute("aria-pressed") === "false" ||
                         (paneActions && (paneActions.offsetHeight === 0 || paneActions.style.display === "none" || paneActions.classList.contains("dijitClosed")));
        if (isClosed) {
          dispararClique(paneTitle);
          await esperar(400);
          restaurarScroll();
        }
      }

      // 3. Aguardar as abas estarem no DOM caso o Assyst ainda esteja montando o painel inferior
      let abas = [];
      let abaAcoes = null;

      for (let tent = 0; tent < 6; tent++) {
        abas = [...document.querySelectorAll(".tabLabel, .dijitTab, div[role='tab']")];
        abaAcoes = abas.find(x => {
          const t = (x.textContent || "").trim().toLowerCase();
          return /^aç[oõ]es/i.test(t) || /^acoes/i.test(t) || t.includes("ações") || t.includes("acoes") || t.includes("histórico");
        });
        if (abaAcoes) break;
        await esperar(200);
      }

      if (abaAcoes) {
        const abaAtivaOriginal = abas.find(x => {
          const isSelected = x.classList.contains("dijitTabChecked") || x.classList.contains("selected") || x.getAttribute("aria-selected") === "true";
          return isSelected;
        });

        const jaEstaNaAbaAcoes = abaAtivaOriginal && (
          /^aç[oõ]es/i.test(abaAtivaOriginal.textContent.trim().toLowerCase()) ||
          /^acoes/i.test(abaAtivaOriginal.textContent.trim().toLowerCase())
        );

        const precisaTrocar = !jaEstaNaAbaAcoes;

        if (precisaTrocar) {
          const elParaClicar = abaAcoes.closest(".dijitTab") || abaAcoes;
          dispararClique(elParaClicar);
          await esperar(350);
          restaurarScroll();
        }

        // Aguardar a grade de ações estar pronta
        let grid = document.getElementById("actionGrid");
        for (let tentGrid = 0; tentGrid < 10 && !grid; tentGrid++) {
          await esperar(150);
          grid = document.getElementById("actionGrid");
        }

        if (grid) {
          await garantirExpansaoRemarks(grid);
          const acoesCompletas = await coletarTodasAcoesGridDojo(grid);

          if (precisaTrocar && abaAtivaOriginal) {
            const elVolta = abaAtivaOriginal.closest(".dijitTab") || abaAtivaOriginal;
            dispararClique(elVolta);
            await esperar(150);
            restaurarScroll();
          }

          if (acoesCompletas.length > 0) return acoesCompletas;
        }

        // Se trocou de aba temporariamente, voltar para a aba original com suavidade
        if (precisaTrocar && abaAtivaOriginal) {
          const elVolta = abaAtivaOriginal.closest(".dijitTab") || abaAtivaOriginal;
          dispararClique(elVolta);
          await esperar(150);
          restaurarScroll();
        }

        return buscarAcoesAtuaisNoDOM();
      }

      return buscarAcoesAtuaisNoDOM();
    } finally {
      restaurarScroll();
    }
  }

  // Obter ou criar a caixa flutuante do SLA na extremidade esquerda (bottom: 24px; left: 24px)
  function obterBotaoFlutuanteSLA() {
    let trigger = document.getElementById("cati-sla-floating-trigger");
    if (!trigger) {
      trigger = document.createElement("div");
      trigger.id = "cati-sla-floating-trigger";
      document.body.appendChild(trigger);
      if (chrome.storage?.local) {
        chrome.storage.local.get(["agenda_settings"], res => {
          const s = res?.agenda_settings || {};
          if (s.slaBoxScale) aplicarEscalaCaixa(s.slaBoxScale);
        });
      }
    }
    return trigger;
  }

  // Identificar a Atribuição Interna que marca a entrada do chamado no N2 / 2N
  function encontrarAcaoInicioN2(acoes) {
    if (!acoes || acoes.length === 0) return { idx: 0, acao: null };

    // 1. Procurar a primeira Atribuição Interna que destinou o chamado para o 2N CATI Remoto
    for (let i = 0; i < acoes.length; i++) {
      const a = acoes[i];
      const t = (a.tipoAcao || "").toLowerCase();
      if (t.includes("atribuição interna") || t.includes("atribuicao interna")) {
        const txt = ((a.deptoAtribuido || "") + " " + (a.linhaTexto || "")).toLowerCase();
        if (txt.includes("2n cati remoto") || txt.includes("atendimento 2n remoto") || (txt.includes("2n") && txt.includes("remoto"))) {
          return { idx: i, acao: a };
        }
      }
    }

    // 2. Fallback: procurar a primeira atribuição para 2N / N2 / Remoto
    for (let i = 0; i < acoes.length; i++) {
      const a = acoes[i];
      const t = (a.tipoAcao || "").toLowerCase();
      if (t.includes("atribuição interna") || t.includes("atribuicao interna")) {
        const txt = (a.linhaTexto || "").toLowerCase();
        if (txt.includes("n2") || txt.includes("2n") || txt.includes("remoto") || txt.includes("segundo nível") || txt.includes("2º nível")) {
          return { idx: i, acao: a };
        }
      }
    }

    return { idx: 0, acao: acoes[0] };
  }

  // Verifica se uma ação de Atribuição Interna representa a devolução do 3N para o 2N CATI Remoto
  function isAtribuicaoDo3NPara2N(acao) {
    if (!acao) return false;
    const tipo = (acao.tipoAcao || "").toLowerCase();
    if (!tipo.includes("atribuição interna") && !tipo.includes("atribuicao interna")) return false;
    if (/3[nN]|#N/i.test(acao.deptoAcionamento || "") && /2[nN]\s*cati\s*remoto/i.test(acao.deptoAtribuido || "")) return true;
    return /(?:3[nN]|#N)[^|]*?(?:2[nN]\s*cati\s*remoto)/i.test(acao.linhaTexto || (acao.cells || []).join(" "));
  }

  // Verifica se o chamado passou pelo 3N e retornou para validação pelo 2N CATI Remoto
  function verificarRetornoDeOutraEquipe(acoes) {
    if (!acoes || acoes.length === 0) return { ehRetorno: false, ultimaDevolucao: null };

    const atribuicoes = [];
    for (let i = 0; i < acoes.length; i++) {
      const a = acoes[i];
      const t = a.tipoAcao.toLowerCase();
      if (t.includes("atribuição interna") || t.includes("atribuicao interna")) {
        atribuicoes.push({ idx: i, acao: a });
      }
    }

    if (atribuicoes.length === 0) {
      return { ehRetorno: false, ultimaDevolucao: null };
    }

    // A devolução do 3N ocorre quando a ação de Atribuição Interna teve
    // na coluna 'Nome de Departamento de Serviço de acionamento' o termo "3N"
    // direcionando o chamado para o termo "2N CATI Remoto" na coluna 'Nome do Departamento de Serviço atribuído'
    let ultimaDevolucao3N = null;

    for (let k = atribuicoes.length - 1; k >= 0; k--) {
      const item = atribuicoes[k];
      if (isAtribuicaoDo3NPara2N(item.acao)) {
        ultimaDevolucao3N = item.acao;
        break;
      }
    }

    return {
      ehRetorno: ultimaDevolucao3N !== null,
      ultimaDevolucao: ultimaDevolucao3N
    };
  }

  // Função que verifica se estamos fora de expediente no modo comercial
  function verificarForaDeExpediente(config) {
    if (config?.slaCalculationMode === "calendar") return false;
    const agora = new Date();
    const dow = agora.getDay();
    if (dow === 0 || dow === 6) return true;
    const engine = (typeof CatiSlaEngine !== "undefined") ? CatiSlaEngine : (typeof window !== "undefined" ? window.CatiSlaEngine : null);
    if (engine) {
      const iso = engine.isoDay(agora);
      const feriados = engine.DEFAULT_HOLIDAYS || [];
      if (feriados.includes(iso)) return true;
      const horaMin = agora.getHours() * 60 + agora.getMinutes();
      const startHM = engine.parseHM(config?.slaWorkStart || "08:00") ?? (8 * 60);
      const endHM = engine.parseHM(config?.slaWorkEnd || "18:00") ?? (18 * 60);
      return horaMin < startHM || horaMin >= endHM;
    }
    const horaMin = agora.getHours() * 60 + agora.getMinutes();
    return horaMin < (8 * 60) || horaMin >= (18 * 60);
  }

  // Algoritmo dinâmico de SLA com suporte ao motor híbrido CatiSlaEngine (Comercial & 24/7)
  function calcularSLAComPausasMultiplas(chamadoId, acoes, config) {
    // 1. Ordenar cronologicamente: ação mais antiga primeiro
    acoes.sort((a, b) => a.dataObj.getTime() - b.dataObj.getTime());

    // 2. Verificar se é um chamado devolvido por outra equipe (ex: 3º Nível) para validação
    const infoRetorno = verificarRetornoDeOutraEquipe(acoes);
    const ehRetornoOutraEquipe = infoRetorno.ehRetorno;
    const dataUltimaDevolucao = infoRetorno.ultimaDevolucao ? infoRetorno.ultimaDevolucao.dataObj : null;
    let minutosDesdeDevolucao = 0;
    if (ehRetornoOutraEquipe && dataUltimaDevolucao) {
      minutosDesdeDevolucao = Math.max(0, Math.round((Date.now() - dataUltimaDevolucao.getTime()) / 60000));
    }

    const agora = new Date();
    const engine = (typeof CatiSlaEngine !== "undefined") ? CatiSlaEngine : (typeof window !== "undefined" ? window.CatiSlaEngine : null);

    if (engine) {
      const events = acoes.map((a, idx) => ({
        type: a.type || a.tipoAcao || "",
        dateRaw: a.dateRaw || a.dataStr || engine.fmtDateTimeBR(a.dataObj),
        dataObj: a.dataObj,
        actingDept: a.actingDept || a.deptoAcionamento || "",
        assignedDept: a.assignedDept || a.deptoAtribuido || "",
        actor: a.actor || "",
        ansName: a.ansName || "",
        actionId: a.actionId || (idx + 1),
        remarks: a.remarks || ""
      }));

      const inputEngine = {
        ref: chamadoId,
        events,
        ansPanel: {
          ansName: (acoes.find(a => a.ansName)?.ansName) || ""
        },
        auditedAt: agora.getTime()
      };

      const audit = engine.computeAudit(inputEngine, config);
      const relogioAnsNativo = verificarRelogioAnsNativoAssyst();

      const metaMinutos = audit.slaMinutes || (config.slaTargetHours * 60);
      const minutosTotaisContados = audit.totalMinutes;
      const minutosRestantes = metaMinutos - minutosTotaisContados;
      const violado = audit.verdict === "ESTOURADO" || minutosRestantes < 0;
      const diferencaMinutos = Math.abs(minutosRestantes);

      let estaAtivo = audit.status === "em_andamento" && audit.progress && audit.progress.clockState === "rodando";
      let pausado = !estaAtivo;
      const foraExpediente = audit.status === "em_andamento" && verificarForaDeExpediente(config);

      if (relogioAnsNativo && relogioAnsNativo.isStopped && estaAtivo) {
        estaAtivo = false;
        pausado = true;
      }

      const primeiraAcao = acoes[0] || {};
      const dataAbertura = primeiraAcao.dataObj || agora;

      return {
        chamadoId,
        pausado,
        estaAtivo,
        foraExpediente,
        relogioAnsNativo,
        violado,
        minutosTotaisContados,
        minutosRestantes,
        diferencaMinutos,
        metaMinutos,
        dataAbertura,
        nomeAcaoAbertura: primeiraAcao.tipoAcao || primeiraAcao.type || "Abertura",
        ehRetornoOutraEquipe,
        dataUltimaDevolucao,
        minutosDesdeDevolucao,
        dayRows: audit.dayRows || [],
        timeline: audit.timeline || [],
        engineResult: audit,
        config
      };
    }

    // Fallback caso CatiSlaEngine não esteja carregado
    let idxInicio = 0;
    let acaoInicio = acoes[0];
    let dataInicioCalculo = acoes[0].dataObj;

    if (!ehRetornoOutraEquipe) {
      const itemInicio = encontrarAcaoInicioN2(acoes);
      idxInicio = itemInicio.idx;
      acaoInicio = itemInicio.acao;
      dataInicioCalculo = acaoInicio.dataObj;
    }

    const intervalosAtivos = [];
    const pausasDetalhes = [];
    let estaAtivo = true;
    let inicioIntervalo = dataInicioCalculo;
    let acaoPausaAtual = null;

    for (let i = idxInicio + 1; i < acoes.length; i++) {
      const acao = acoes[i];
      const tipo = acao.tipoAcao;

      if (estaAtivo) {
        if (isAcaoPausa(tipo)) {
          const fimIntervalo = acao.dataObj;
          if (fimIntervalo > inicioIntervalo) {
            intervalosAtivos.push({ inicio: inicioIntervalo, fim: fimIntervalo });
          }
          estaAtivo = false;
          acaoPausaAtual = acao;
        } else {
          const tLower = tipo.toLowerCase();
          const isEncerramento = tLower.includes("encerramento") ||
                                 tLower.includes("resolvido") ||
                                 tLower.includes("fechado") ||
                                 tLower.includes("solução") ||
                                 tLower.includes("cancelado");
          if (isEncerramento) {
            const fimIntervalo = acao.dataObj;
            if (fimIntervalo > inicioIntervalo) {
              intervalosAtivos.push({ inicio: inicioIntervalo, fim: fimIntervalo });
            }
            estaAtivo = false;
            inicioIntervalo = null;
            break;
          }
        }
      } else {
        if (isAcaoDespausa(tipo)) {
          const duracaoPausa = calcularMinutosIntervalo(acaoPausaAtual.dataObj, acao.dataObj, config);
          pausasDetalhes.push({
            inicioPausa: acaoPausaAtual.dataObj,
            fimPausa: acao.dataObj,
            tipoPausa: acaoPausaAtual.tipoAcao,
            tipoRetomada: acao.tipoAcao,
            duracaoMinutos: duracaoPausa
          });
          acaoPausaAtual = null;
          estaAtivo = true;
          inicioIntervalo = acao.dataObj;
        }
      }
    }

    const relogioAnsNativo = verificarRelogioAnsNativoAssyst();
    if (relogioAnsNativo && relogioAnsNativo.isStopped && estaAtivo) {
      estaAtivo = false;
      if (!acaoPausaAtual && acoes.length > 0) {
        acaoPausaAtual = acoes[acoes.length - 1];
      }
    }

    if (estaAtivo && inicioIntervalo) {
      if (agora > inicioIntervalo) {
        intervalosAtivos.push({ inicio: inicioIntervalo, fim: agora });
      }
    } else if (!estaAtivo && acaoPausaAtual) {
      const duracaoPausaAtual = calcularMinutosIntervalo(acaoPausaAtual.dataObj, agora, config);
      pausasDetalhes.push({
        inicioPausa: acaoPausaAtual.dataObj,
        fimPausa: null,
        tipoPausa: acaoPausaAtual.tipoAcao,
        tipoRetomada: "Pausado no momento",
        duracaoMinutos: duracaoPausaAtual
      });
    }

    let minutosTotaisContados = 0;
    intervalosAtivos.forEach(iv => {
      minutosTotaisContados += calcularMinutosIntervalo(iv.inicio, iv.fim, config);
    });

    const metaMinutos = config.slaTargetHours * 60;
    const minutosRestantes = metaMinutos - minutosTotaisContados;
    const violado = minutosRestantes < 0;
    const diferencaMinutos = Math.abs(minutosRestantes);
    const foraExpediente = estaAtivo && verificarForaDeExpediente(config);

    return {
      chamadoId,
      pausado: !estaAtivo,
      estaAtivo,
      foraExpediente,
      relogioAnsNativo,
      violado,
      minutosTotaisContados,
      minutosRestantes,
      diferencaMinutos,
      metaMinutos,
      dataAbertura: dataInicioCalculo,
      nomeAcaoAbertura: acaoInicio.tipoAcao,
      ehRetornoOutraEquipe,
      dataUltimaDevolucao,
      minutosDesdeDevolucao,
      intervalosAtivos,
      pausasDetalhes,
      totalPausas: pausasDetalhes.length,
      config
    };
  }

  // Renderizar a caixa flutuante na extremidade esquerda
  function renderizarCaixaFlutuante(info) {
    const trigger = obterBotaoFlutuanteSLA();
    if (info?.config?.slaBoxScale) {
      aplicarEscalaCaixa(info.config.slaBoxScale);
    }

    // Estado 1: Nenhum chamado selecionado
    if (!info) {
      trigger.className = "status-idle";
      trigger.innerHTML = `
        <span class="cati-sla-fl-icon">⏱️</span>
        <span class="cati-sla-fl-text">Calcular SLA</span>
      `;
      trigger.title = "Clique para calcular o SLA do chamado selecionado";
      trigger.onclick = () => calcularSLA(true);
      return;
    }

    // Estado Manual: Dentro do chamado aguardando clique do analista
    if (info.manualTrigger) {
      trigger.className = "status-idle";
      trigger.innerHTML = `
        <span class="cati-sla-fl-icon">⏱️</span>
        <span class="cati-sla-fl-text">SLA [${info.chamadoId}]: Calcular</span>
      `;
      trigger.title = `Clique para calcular o SLA do chamado #${info.chamadoId}`;
      trigger.onclick = () => calcularSLA(true);
      return;
    }

    // Estado 2: Carregando
    if (info.loading) {
      trigger.className = "status-loading";
      trigger.innerHTML = `
        <span class="cati-sla-fl-icon">⏳</span>
        <span class="cati-sla-fl-text">SLA: Calculando...</span>
      `;
      trigger.onclick = null;
      return;
    }

    // Estado 3: Ações não carregadas / aviso
    if (info.erro) {
      trigger.className = "status-idle";
      trigger.innerHTML = `
        <span class="cati-sla-fl-icon">⏱️</span>
        <span class="cati-sla-fl-text">SLA [${info.chamadoId}]: Ler Ações</span>
        <button type="button" class="cati-sla-fl-refresh" title="Recalcular">🔄</button>
      `;
      const btnRef = trigger.querySelector(".cati-sla-fl-refresh");
      if (btnRef) {
        btnRef.onclick = (e) => {
          e.stopPropagation();
          calcularSLA(true);
        };
      }
      trigger.onclick = () => calcularSLA(true);
      return;
    }

    // Estado 4: Resultado Dinâmico (Motor CatiSlaEngine)
    const is24_7 = info.config?.slaCalculationMode === "calendar";

    let statusClass = "status-ok";
    let icon = is24_7 ? "⚡" : "🔵";
    let statusBadge = "EM ANDAMENTO";
    let statusTexto = "";

    const tempoFormatado = formatarHorasMinutos(info.minutosTotaisContados);
    const restanteFormatado = formatarHorasMinutos(info.diferencaMinutos);

    if (info.violado) {
      statusClass = "status-violated";
      icon = "🔴";
      statusBadge = info.ehRetornoOutraEquipe ? "RETORNO 3N (ESTOURADO)" : "VIOLADO";
      const tagRetorno = info.ehRetornoOutraEquipe ? " • Retorno 3N" : "";
      statusTexto = `SLA [${info.chamadoId}]: ${tempoFormatado} (+${restanteFormatado})${tagRetorno}`;
    } else if (info.foraExpediente) {
      statusClass = "status-paused";
      icon = "🌙";
      statusBadge = "FORA DE EXPEDIENTE (PAUSADO)";
      const reabertura = info.config?.slaWorkStart || "08:00";
      statusTexto = `SLA [${info.chamadoId}]: ${tempoFormatado} contados (🌙 Fora de Expediente • Inicia ${reabertura})`;
    } else if (info.pausado) {
      statusClass = "status-paused";
      icon = "🟡";
      statusBadge = info.ehRetornoOutraEquipe ? "RETORNO 3N (PAUSADO)" : "PAUSADO";
      const tagRetorno = info.ehRetornoOutraEquipe ? " • Retorno 3N" : "";
      statusTexto = `SLA [${info.chamadoId}]: ${tempoFormatado} contados (Pausado • Resta ${restanteFormatado}${tagRetorno})`;
    } else {
      statusClass = "status-running";
      icon = is24_7 ? "⚡" : "🔵";
      statusBadge = is24_7 ? "EM ANDAMENTO (24/7)" : "EM ANDAMENTO";
      statusTexto = `SLA [${info.chamadoId}]: ${tempoFormatado} contados (Resta ${restanteFormatado})`;
    }

    const metaTexto = `${info.metaMinutos / 60}h (${formatarHorasMinutos(info.metaMinutos)})`;

    // Trechos diários calculados (dayRows)
    let dayRowsHtml = "";
    if (info.dayRows && info.dayRows.length > 0) {
      const linhas = info.dayRows.map((r, i) => `
        <div class="pop-pause-item">
          <span>#${i + 1} 📅 ${r.dateBR} (${r.startHM} às ${r.endHM})</span>
          <span class="pop-pause-min">${r.minutes} min</span>
        </div>
      `).join("");

      dayRowsHtml = `
        <div class="pop-pauses-list">
          <div class="pop-pauses-title">Trechos Computados no SLA (${info.dayRows.length}):</div>
          ${linhas}
        </div>
      `;
    }

    // Histórico de pausas e agendamentos relevantes
    let timelineHtml = "";
    if (info.timeline && info.timeline.length > 0) {
      const eventosDestaque = info.timeline.filter(t => t.text.includes("Atendimento Programado") || t.text.includes("reativado") || t.text.includes("Aguardando"));
      if (eventosDestaque.length > 0) {
        timelineHtml = `
          <div class="pop-pauses-list">
            <div class="pop-pauses-title">Eventos de Pausa / Reativação:</div>
            ${eventosDestaque.map(e => `
              <div class="pop-timeline-item">
                • ${e.text}
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    const wasPinned = trigger.classList.contains("is-pinned");
    trigger.className = statusClass + (wasPinned ? " is-pinned" : "");
    trigger.innerHTML = `
      <span class="cati-sla-fl-icon" title="Clique no emoji para recalcular o SLA">${icon}</span>
      <span class="cati-sla-fl-text">${statusTexto}</span>
      <button type="button" class="cati-sla-fl-refresh" title="Recalcular SLA">🔄</button>
      <div class="cati-sla-fl-popover">
        <div class="pop-title">
          <span>SLA do Chamado ${info.chamadoId}</span>
          <span class="pop-badge ${statusClass}">${statusBadge}</span>
        </div>

        <div class="pop-mode-box">
          <div>
            <div class="pop-mode-lbl">Regime de Trabalho</div>
            <div class="pop-mode-val" style="color: ${is24_7 ? '#facc15' : '#38bdf8'};">
              ${is24_7 ? '⚡ Operação 24/7 (Tempo Corrido)' : `☀️ Horário Comercial (${info.config.slaWorkStart || '08:00'} às ${info.config.slaWorkEnd || '18:00'})`}
            </div>
          </div>
          <button type="button" class="btn-toggle-sla-mode" title="Alternar entre Horário Comercial e Operação 24/7">
            ${is24_7 ? 'Mudar p/ Comercial' : 'Mudar p/ 24/7'}
          </button>
        </div>

        ${info.foraExpediente ? `
        <div class="pop-row pop-row-alert-warning">
          <span class="pop-lbl" style="color: #fbbf24; font-weight: 600;">Expediente:</span>
          <span class="pop-val" style="color: #fef08a; font-weight: 600;">🌙 Contagem congelada até ${info.config.slaWorkStart || '08:00'}</span>
        </div>
        ` : ""}

        ${info.ehRetornoOutraEquipe ? `
        <div class="pop-row pop-row-alert-danger">
          <span class="pop-lbl" style="color: #f87171; font-weight: 600;">Fluxo:</span>
          <span class="pop-val" style="color: #fecaca; font-weight: 600;">Retorno do 3º Nível (Validação)</span>
        </div>
        ` : ""}
        <div class="pop-row">
          <span class="pop-lbl">${info.ehRetornoOutraEquipe ? "Abertura Original (Tempo Real):" : "Início no N2:"}</span>
          <span class="pop-val">${formatarDataHora(info.dataAbertura)}</span>
        </div>
        ${info.ehRetornoOutraEquipe && info.dataUltimaDevolucao ? `
        <div class="pop-row">
          <span class="pop-lbl">Devolvido pelo 3N em:</span>
          <span class="pop-val">${formatarDataHora(info.dataUltimaDevolucao)} (há ${formatarHorasMinutos(info.minutosDesdeDevolucao)})</span>
        </div>
        ` : ""}
        <div class="pop-row">
          <span class="pop-lbl">Tempo Contabilizado:</span>
          <span class="pop-val ${info.violado ? "val-violated" : "val-ok"}">${tempoFormatado}</span>
        </div>
        <div class="pop-row">
          <span class="pop-lbl">${info.violado ? "Estouro de SLA:" : "Prazo Restante:"}</span>
          <span class="pop-val ${info.violado ? "val-violated" : (info.pausado ? "val-paused" : "val-ok")}">${restanteFormatado}</span>
        </div>
        <div class="pop-row">
          <span class="pop-lbl">Meta de SLA:</span>
          <span class="pop-val">${metaTexto}</span>
        </div>
        <div class="pop-row">
          <span class="pop-lbl">Status Atual:</span>
          <span class="pop-val">${info.foraExpediente ? "Fora de Expediente" : (info.pausado ? "Pausado" : "Em andamento")}</span>
        </div>
        ${info.relogioAnsNativo ? `
        <div class="pop-row pop-row-ans">
          <span class="pop-lbl">Relógio ANS Assyst:</span>
          <span class="pop-val" style="color: ${info.relogioAnsNativo.isStopped ? "#facc15" : "#60a5fa"}; font-weight: 600;">
            ${info.relogioAnsNativo.isStopped ? "⏸️ Parado" : "▶️ Correndo"}${info.relogioAnsNativo.slaNome ? " (" + info.relogioAnsNativo.slaNome + ")" : ""}
          </span>
        </div>
        ` : ""}
        ${dayRowsHtml}
        ${timelineHtml}
        <div class="pop-scale-bar">
          <span>Tamanho da Caixa:</span>
          <div class="pop-scale-actions">
            <button type="button" class="pop-scale-btn btn-scale-dec" title="Diminuir tamanho (-10%)">-</button>
            <span class="pop-scale-val">${info.config?.slaBoxScale || 100}%</span>
            <button type="button" class="pop-scale-btn btn-scale-inc" title="Aumentar tamanho (+10%)">+</button>
          </div>
        </div>
      </div>
    `;

    const iconEl = trigger.querySelector(".cati-sla-fl-icon");
    if (iconEl) {
      iconEl.onclick = (e) => {
        e.stopPropagation();
        calcularSLA(true);
      };
    }

    const btnRef = trigger.querySelector(".cati-sla-fl-refresh");
    if (btnRef) {
      btnRef.onclick = (e) => {
        e.stopPropagation();
        calcularSLA(true);
      };
    }

    const btnToggleMode = trigger.querySelector(".btn-toggle-sla-mode");
    if (btnToggleMode) {
      btnToggleMode.onclick = async (e) => {
        e.stopPropagation();
        const novoModo = (info.config?.slaCalculationMode === "calendar") ? "business" : "calendar";
        if (chrome.storage?.local) {
          chrome.storage.local.get(["agenda_settings"], res => {
            const s = res?.agenda_settings || {};
            s.slaCalculationMode = novoModo;
            chrome.storage.local.set({ agenda_settings: s }, () => {
              delete cacheResultados[info.chamadoId];
              calcularSLA(true);
            });
          });
        }
      };
    }

    const btnDec = trigger.querySelector(".btn-scale-dec");
    const btnInc = trigger.querySelector(".btn-scale-inc");
    if (btnDec) {
      btnDec.onclick = async (e) => {
        e.stopPropagation();
        await ajustarEscalaLocal(-10);
      };
    }
    if (btnInc) {
      btnInc.onclick = async (e) => {
        e.stopPropagation();
        await ajustarEscalaLocal(+10);
      };
    }

    trigger.onclick = (e) => {
      if (e.target.closest(".cati-sla-fl-popover")) return;
      e.stopPropagation();
      trigger.classList.toggle("is-pinned");
    };
  }

  // Limpeza de badge no cabeçalho (SLA agora é exclusivo na caixa flutuante inferior para não quebrar layout do Assyst)
  function renderizarBadgeCabecalho(info) {
    const container = document.getElementById("cati-sla-badge-container");
    if (container) container.remove();
  }

  // Executar o cálculo do SLA para o chamado ativo
  async function calcularSLA(forcarRecalculo = false) {
    if (isCalculating) return;

    const chamadoId = obterIdChamadoAtivo();
    if (!chamadoId) {
      renderizarCaixaFlutuante(null);
      return;
    }

    if (forcarRecalculo) {
      delete cacheResultados[chamadoId];
    }

    ultimoChamadoId = chamadoId;
    isCalculating = true;

    if (safetyTimeout) clearTimeout(safetyTimeout);
    safetyTimeout = setTimeout(() => { isCalculating = false; }, 20000);

    renderizarCaixaFlutuante({ chamadoId, loading: true });
    renderizarBadgeCabecalho({ chamadoId, loading: true });

    try {
      const config = await obterConfiguracoesSLA();
      const acoes = await extrairAcoesDoAssyst();

      if (acoes.length === 0) {
        const erroInfo = { chamadoId, erro: true };
        renderizarCaixaFlutuante(erroInfo);
        renderizarBadgeCabecalho(erroInfo);
        return;
      }

      const resultado = calcularSLAComPausasMultiplas(chamadoId, acoes, config);

      cacheResultados[chamadoId] = resultado;

      renderizarCaixaFlutuante(resultado);
      renderizarBadgeCabecalho(resultado);
    } catch (err) {
      console.error("Assistente 2N: Erro ao calcular SLA:", err);
      const erroInfo = { chamadoId, erro: true };
      renderizarCaixaFlutuante(erroInfo);
      renderizarBadgeCabecalho(erroInfo);
    } finally {
      isCalculating = false;
      if (safetyTimeout) clearTimeout(safetyTimeout);
    }
  }

  // Verificar mudanças de seleção de chamado
  function verificarMudancaDeChamado() {
    const chamadoId = obterIdChamadoAtivo();

    if (!chamadoId) {
      renderizarCaixaFlutuante(null);
      renderizarBadgeCabecalho(null);
      return;
    }

    const dentro = isDentroDeChamado();

    if (dentro) {
      // DENTRO DO CHAMADO:
      // O cálculo do SLA NÃO é automático! Deve ser acionado manualmente pelo analista na caixa flutuante.
      ultimoChamadoId = chamadoId;
      if (cacheResultados[chamadoId]) {
        renderizarCaixaFlutuante(cacheResultados[chamadoId]);
        renderizarBadgeCabecalho(cacheResultados[chamadoId]);
      } else {
        const infoManual = { chamadoId, manualTrigger: true };
        renderizarCaixaFlutuante(infoManual);
        renderizarBadgeCabecalho(infoManual);
      }
      return;
    }

    // FORA DO CHAMADO (Fila geral / Seleção na grade):
    if (chamadoId !== ultimoChamadoId || !cacheResultados[chamadoId]) {
      ultimoChamadoId = chamadoId;
      if (cacheResultados[chamadoId]) {
        renderizarCaixaFlutuante(cacheResultados[chamadoId]);
        renderizarBadgeCabecalho(cacheResultados[chamadoId]);
      } else {
        calcularSLA();
      }
    }
  }

  function agendarVerificacao(delay = 250) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(verificarMudancaDeChamado, delay);
  }

  // Interceptar cliques na grade e abas para detectar seleção de chamados instantaneamente
  document.addEventListener("click", (e) => {
    const row = e.target.closest(".dojoxGridRow, tr");
    if (row) {
      agendarVerificacao(250);
      setTimeout(verificarMudancaDeChamado, 700);
      return;
    }

    const tab = e.target.closest(".tabLabel, .dijitTab, div[role='tab']");
    if (tab) {
      agendarVerificacao(200);
      setTimeout(verificarMudancaDeChamado, 600);
    }
  }, true);

  window.addEventListener("hashchange", () => agendarVerificacao(300));
  window.addEventListener("popstate", () => agendarVerificacao(300));

  const observer = new MutationObserver(() => {
    agendarVerificacao(250);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // Ouvir mudanças nas configurações da extensão em tempo real
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.agenda_settings) {
        const s = changes.agenda_settings.newValue;
        if (s) {
          if (typeof s.slaBoxScale !== "undefined") {
            aplicarEscalaCaixa(s.slaBoxScale);
            const lbl = document.querySelector(".pop-scale-val");
            if (lbl) lbl.textContent = `${s.slaBoxScale}%`;
          }
          // Invalida cache de resultados e recalcula o SLA em tempo real
          cacheResultados = {};
          const chamadoId = obterIdChamadoAtivo();
          if (chamadoId) {
            calcularSLA(true);
          }
        }
      }
    });
  }

  // Fechar popover fixado quando o usuário clicar fora ou pressionar ESC
  document.addEventListener("click", (e) => {
    const trigger = document.getElementById("cati-sla-floating-trigger");
    if (trigger && trigger.classList.contains("is-pinned")) {
      if (!trigger.contains(e.target)) {
        trigger.classList.remove("is-pinned");
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const trigger = document.getElementById("cati-sla-floating-trigger");
      if (trigger) trigger.classList.remove("is-pinned");
    }
  });

  // Execução inicial
  agendarVerificacao(500);
  agendarVerificacao(1500);
})();

