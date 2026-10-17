(() => {
  // Evitar injeção duplicada ou fora do domínio cati.tjce.jus.br
  if (window.__catiAssystAlertasLoaded) return;
  if (!window.location.origin.includes("cati.tjce.jus.br") && !window.location.hostname.includes("cati.tjce.jus.br")) return;
  window.__catiAssystAlertasLoaded = true;

  let timerVerificacao = null;

  function agendarVerificacoes(delay = 300) {
    if (timerVerificacao) clearTimeout(timerVerificacao);
    timerVerificacao = setTimeout(executarTodasVerificacoes, delay);
  }

  // =========================================================================
  // 1. DETECÇÃO DE TELA (Lista Geral vs Detalhes do Chamado)
  // =========================================================================
  function isDentroDeChamado() {
    if (!window.location.origin.includes("cati.tjce.jus.br") && !window.location.hostname.includes("cati.tjce.jus.br")) {
      return false;
    }

    const hash = decodeURIComponent(window.location.hash || "").toLowerCase();
    const href = decodeURIComponent(window.location.href || "").toLowerCase();

    // 1. Se estiver na tela de pesquisa / fila geral
    if (hash.includes("eventsearch") || href.includes("eventsearch")) {
      // Mas verifique se há uma aba ativa de chamado (multi-abas do Dojo)
      const tabAtiva = document.querySelector(".dijitTabChecked .tabLabel, .dijitTab[aria-selected='true'] .tabLabel, .dijitTabChecked, .dijitTab[aria-selected='true']");
      if (tabAtiva) {
        const textoTab = (tabAtiva.innerText || "").trim();
        if (/\b([A-Za-z]{0,3}\d{5,10})\b/.test(textoTab) && !/pesquisa|search|fila/i.test(textoTab)) {
          return true;
        }
      }
      return false;
    }

    // 2. URLs características de abertura de chamado
    if (hash.includes("displayevent") || hash.includes("eventdelegating") || href.includes("displayevent")) {
      return true;
    }

    // 3. Aba ativa no Dojo com número do chamado
    const tabAtiva = document.querySelector(".dijitTabChecked .tabLabel, .dijitTab[aria-selected='true'] .tabLabel, .dijitTabChecked, .dijitTab[aria-selected='true']");
    if (tabAtiva) {
      const textoTab = (tabAtiva.innerText || "").trim();
      if (/\b([A-Za-z]{0,3}\d{5,10})\b/.test(textoTab) && !/pesquisa|search|fila/i.test(textoTab)) {
        return true;
      }
    }

    // 4. Formulário de evento aberto (tela cheia)
    const formChamado = document.querySelector("form#eventForm:not([style*='display: none'])");
    if (formChamado && (formChamado.offsetWidth > 0 || formChamado.offsetHeight > 0)) {
      return true;
    }

    return false;
  }

  function isListaGeralChamados() {
    return !isDentroDeChamado();
  }

  // =========================================================================
  // 2. CONTORNO VERMELHO (Campos Edifício e Item B)
  // Sem bloqueios de salvar ou atalhos! Apenas sinalização visual.
  // =========================================================================
  function aplicarContornoElemento(campo, estaPendente) {
    if (!campo) return;
    // Prioriza o container de typeahead ou fieldContent (um único elemento estilizado)
    const container = campo.closest(".typeAheadContainer") || campo.closest(".fieldContent") || campo;
    container.classList.toggle("cati-campo-pendente", estaPendente);

    // Evita contornos duplicados em elementos internos ou externos
    if (container !== campo) {
      campo.classList.remove("cati-campo-pendente");
    }
    const outer = campo.closest(".fieldContent");
    if (outer && outer !== container) {
      outer.classList.remove("cati-campo-pendente");
    }
  }

  function verificarCamposEdificioEItemB() {
    // 2.1 Campo Edifício
    const seletoresEdificio = [
      'input[id*="_building_textNode"]',
      'input[id*="building_textNode"]',
      'input[name="building.text"]'
    ];
    let camposEdificio = [...document.querySelectorAll(seletoresEdificio.join(", "))];

    if (camposEdificio.length === 0) {
      document.querySelectorAll("label, .fieldLabel").forEach(lbl => {
        if (/edif[ií]cio/i.test(lbl.innerText)) {
          const inp = document.getElementById(lbl.htmlFor) || lbl.closest("td")?.querySelector("input[type='text']");
          if (inp && !camposEdificio.includes(inp)) camposEdificio.push(inp);
        }
      });
    }

    camposEdificio.forEach(campo => {
      const valor = (campo.value || "").trim();
      const pendente = !valor || valor.toLowerCase() === "por definir";
      aplicarContornoElemento(campo, pendente);
    });

    // 2.2 Campo Item B
    const seletoresItemB = [
      'input[id*="_itemB_textNode"]',
      'input[id*="itemB_textNode"]',
      'input[name="itemB.text"]'
    ];
    let camposItemB = [...document.querySelectorAll(seletoresItemB.join(", "))];

    if (camposItemB.length === 0) {
      document.querySelectorAll("label, .fieldLabel").forEach(lbl => {
        if (/\bitem\s*b\b/i.test(lbl.innerText)) {
          const inp = document.getElementById(lbl.htmlFor) || lbl.closest("td")?.querySelector("input[type='text']");
          if (inp && !camposItemB.includes(inp)) camposItemB.push(inp);
        }
      });
    }

    camposItemB.forEach(campo => {
      const valor = (campo.value || "").trim();
      const pendente = !valor || valor.toLowerCase() === "por definir";
      aplicarContornoElemento(campo, pendente);
    });
  }

  // =========================================================================
  // 3. LEMBRETE DE BASE DE CONHECIMENTO (Estilo 1N)
  // Sem bloqueio no botão de fechar/salvar.
  // =========================================================================
  const SELECTOR_BASE = "jukeboxKnowledgeContent";
  const SELECTOR_CONTAINER_NOTIF = "jukeboxsuggestedactionscontent";

  function verificarBaseDeConhecimento() {
    // Só é verificado e exibido estritamente DENTRO do chamado
    if (!isDentroDeChamado()) {
      removerLembreteBase();
      return;
    }

    const containerNotif = document.getElementById(SELECTOR_CONTAINER_NOTIF) || document.getElementById("jukeboxKnowledge");
    // Se o container de sugestões/conselhos do chamado não existir no DOM, não injeta
    if (!containerNotif) {
      removerLembreteBase();
      return;
    }

    const elementoBase = document.getElementById(SELECTOR_BASE);
    const textoBase = (elementoBase ? elementoBase.textContent : "").trim();
    const temBase = textoBase !== "";

    if (temBase) {
      removerLembreteBase();
    } else {
      adicionarLembreteBase(containerNotif);
    }
  }

  function adicionarLembreteBase(container) {
    if (!container) return;
    if (document.getElementById("cati-notificacao-sem-base")) return;

    const notif = document.createElement("div");
    notif.id = "cati-notificacao-sem-base";
    notif.className = "cati-lembrete-sem-base";
    notif.innerHTML = "⚠️ SEM BASE ATRIBUÍDA ⚠️";

    const primeiroFilho = container.querySelector("div");
    if (primeiroFilho) {
      container.insertBefore(notif, primeiroFilho);
    } else {
      container.appendChild(notif);
    }
  }

  function removerLembreteBase() {
    const notif = document.getElementById("cati-notificacao-sem-base");
    if (notif) notif.remove();
  }

  // =========================================================================
  // 4. ALERTA DE USUÁRIO VIP (Apenas na Lista Geral de Chamados)
  // =========================================================================
  function verificarUsuarioVipListaGeral() {
    const vipNumeros = new Set();

    // 4.1 Identificação na grade via marcador vermelho (baseGridImage alert-red)
    const vipIcons = document.querySelectorAll(".baseGridImage.alert-red, .alert-red");
    vipIcons.forEach(icon => {
      const row = icon.closest(".dojoxGridRow");
      if (row) {
        const refCell = row.querySelector(".eventReferenceCell");
        if (refCell) {
          const num = refCell.innerText.trim();
          if (num) vipNumeros.add(num);
        }
      }
    });

    // 4.2 Identificação de linha selecionada com alerttext "USUÁRIO VIP"
    const alertTexts = document.querySelectorAll(".alerttext");
    alertTexts.forEach(el => {
      const txt = (el.innerText || "").toUpperCase();
      if (txt.includes("VIP")) {
        const selectedRow = document.querySelector(".dojoxGridRowSelected.eventGridRow, .dojoxGridRowSelected");
        if (selectedRow) {
          const refCell = selectedRow.querySelector(".eventReferenceCell");
          if (refCell) {
            const num = refCell.innerText.trim();
            if (num) vipNumeros.add(num);
          }
        }
      }
    });

    if (vipNumeros.size > 0) {
      exibirAlertaVip([...vipNumeros]);
    } else {
      removerAlertaVip();
    }
  }

  function exibirAlertaVip(numeros) {
    const textoNums = numeros.length === 1 ? `Chamado ${numeros[0]}` : `Chamados: ${numeros.join(", ")}`;
    const novoTexto = `USUÁRIO VIP IDENTIFICADO: ${textoNums}`;
    let banner = document.getElementById("cati-vip-banner-lista");
    if (banner && banner.getAttribute("data-vip-text") === novoTexto) {
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "cati-vip-banner-lista";
      document.body.appendChild(banner);
    }
    banner.setAttribute("data-vip-text", novoTexto);
    banner.innerHTML = `
      <span class="cati-vip-badge-icon">🚨</span>
      <span class="cati-vip-badge-text">${novoTexto}</span>
    `;
    banner.style.display = "inline-flex";
  }

  function removerAlertaVip() {
    const banner = document.getElementById("cati-vip-banner-lista");
    if (banner) {
      banner.remove();
    }
  }

  function removerDestaquesAgendados() {
    const rows = document.querySelectorAll(".cati-grid-row-agendado");
    rows.forEach(r => r.classList.remove("cati-grid-row-agendado"));
    const badges = document.querySelectorAll(".cati-grid-badge-agendado");
    badges.forEach(b => b.remove());
  }

  function extrairNumeroChamadoAtivo() {
    const titleEl = document.querySelector("#contentPaneTitle");
    if (titleEl) {
      const m = (titleEl.innerText || "").match(/\b([A-Za-z]{0,3}\d{5,10})\b/);
      if (m) return m[1];
    }
    const decHref = decodeURIComponent(window.location.href || "");
    const decHash = decodeURIComponent(window.location.hash || "");
    const mUrl = decHref.match(/eventId=([A-Za-z0-9_-]+)/i) ||
                 decHash.match(/eventId=([A-Za-z0-9_-]+)/i) ||
                 decHref.match(/eventReference=([A-Za-z0-9_-]+)/i) ||
                 decHash.match(/eventReference=([A-Za-z0-9_-]+)/i);
    if (mUrl) return mUrl[1];

    const inputRef = document.querySelector('input[name="eventForm.event.formattedReference"], input[name="eventForm.event.id"], input[name="eventId"]');
    if (inputRef && inputRef.value) return inputRef.value.trim();

    return "Chamado";
  }

  function obterCampoTelefone() {
    const seletores = [
      'input[id*="_affectedUserTelephone"]',
      'input[id*="affectedUserTelephone"]',
      'input[name*="affectedUserTelephone"]',
      'input[id*="Telephone"]'
    ];
    let inputTel = document.querySelector(seletores.join(", "));
    if (inputTel) return inputTel;

    // Fallback por label "Telefone"
    const labels = document.querySelectorAll("label, .fieldLabel");
    for (const lbl of labels) {
      if (/telefone/i.test(lbl.innerText)) {
        const inp = document.getElementById(lbl.htmlFor) || lbl.closest("td")?.querySelector("input[type='text'], input");
        if (inp) return inp;
      }
    }
    return null;
  }

  // =========================================================================
  // 7. BOTÃO "COPIAR FICHA DO CHAMADO" (Cabeçalho do Chamado)
  // =========================================================================
  function extrairDadosFichaChamado() {
    const chamadoId = extrairNumeroChamadoAtivo();

    // Usuário Afetado
    const userInp = document.getElementById("ManageEventForm_ES1_affectedUser_textNode") ||
                    document.querySelector("input[id*='affectedUser_textNode'], input[name='affectedUser.text']");
    let usuario = (userInp ? userInp.value : "").trim();
    // Limpar prefixo de matrícula se existir: 55837(NOME) -> NOME
    const mUser = usuario.match(/\((.*?)\)/);
    if (mUser) usuario = mUser[1];

    // Lotação / Seção
    const secInp = document.getElementById("ManageEventForm_ES1_section_textNode") ||
                   document.querySelector("input[id*='section_textNode'], input[name='section.text']");
    const secao = (secInp ? secInp.value : "").trim() || "-";

    // Telefone
    const telInp = obterCampoTelefone();
    const telefone = (telInp ? telInp.value : "").trim() || "-";

    // Item de Serviço
    const itemInp = document.getElementById("ManageEventForm_ES1_itemA_textNode") ||
                    document.querySelector("input[id*='itemA_textNode'], input[name='itemA.text']");
    const item = (itemInp ? itemInp.value : "").trim() || "-";

    // Resumo / Descrição curta
    const descInp = document.getElementById("ManageEventForm_ES1_shortDescription") ||
                    document.querySelector("input[id*='shortDescription'], input[name='shortDescription']");
    const resumo = (descInp ? descInp.value : "").trim() || "-";

    return { chamadoId, usuario: usuario || "-", secao, telefone, item, resumo };
  }

  function injetarBotaoCopiarFicha() {
    // Só injeta se estiver estritamente dentro de um chamado
    if (!isDentroDeChamado()) {
      removerBotoesChamado();
      return;
    }

    let btn = document.getElementById("cati-btn-copiar-ficha");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "cati-btn-copiar-ficha";
      btn.className = "cati-btn-copiar-ficha";
      btn.title = "Copiar resumo completo deste chamado (para Teams / WhatsApp / Bloco de Notas)";
      btn.innerHTML = "<span>📋 Copiar Ficha</span>";

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const f = extrairDadosFichaChamado();
        const texto = [
          `📌 Chamado: #${f.chamadoId}`,
          `👤 Usuário: ${f.usuario}`,
          `🏢 Lotação: ${f.secao}`,
          `📞 Contato: ${f.telefone}`,
          `💻 Item: ${f.item}`,
          `📝 Resumo: ${f.resumo}`
        ].join("\n");

        navigator.clipboard.writeText(texto).then(() => {
          btn.innerHTML = "<span>✓ Ficha Copiada!</span>";
          btn.classList.add("copiado");
          setTimeout(() => {
            btn.innerHTML = "<span>📋 Copiar Ficha</span>";
            btn.classList.remove("copiado");
          }, 2200);
        }).catch(err => {
          console.warn("Falha ao copiar ficha:", err);
        });
      };

      document.body.appendChild(btn);
    }

    btn.style.display = "inline-flex";
    posicionarBotaoCopiarFicha(btn);
  }

  function posicionarBotaoCopiarFicha(btn) {
    if (!btn) return;
    const triggerSla = document.getElementById("cati-sla-floating-trigger");
    if (triggerSla && triggerSla.style.display !== "none" && typeof triggerSla.getBoundingClientRect === "function") {
      const rect = triggerSla.getBoundingClientRect();
      if (rect.top > 0) {
        const bottomOffset = window.innerHeight - rect.top + 8;
        btn.style.bottom = `${bottomOffset}px`;
        btn.style.left = `${rect.left}px`;
        return;
      }
    }
    btn.style.bottom = "70px";
    btn.style.left = "68px";
  }

  function removerBotoesChamado() {
    const telActions = document.getElementById("cati-tel-actions-container");
    if (telActions) telActions.remove();

    const btnFicha = document.getElementById("cati-btn-copiar-ficha");
    if (btnFicha) btnFicha.remove();
  }

  // =========================================================================
  // 7.1. MENU HAMBÚRGUER / TOGGLE PARA MINIMIZAR BOTÕES DA EXTENSÃO (Pablo)
  // =========================================================================
  const STORAGE_KEY_MINIMIZED = "cati_assyst_buttons_minimized";

  async function alternarMinimizacaoBotoes() {
    const isMin = document.body.classList.toggle("cati-buttons-minimized");
    const toggleBtn = document.getElementById("cati-assyst-menu-toggle");
    if (toggleBtn) {
      toggleBtn.title = isMin
        ? "Menu CATI 2N (Clique para expandir ferramentas - Alt+M)"
        : "Menu CATI 2N (Clique para minimizar ferramentas - Alt+M)";
    }
    try {
      if (chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY_MINIMIZED]: isMin });
      }
    } catch (_) {}
  }

  async function carregarEstadoMinimizado() {
    try {
      if (chrome.storage?.local) {
        const res = await chrome.storage.local.get([STORAGE_KEY_MINIMIZED]);
        if (res && res[STORAGE_KEY_MINIMIZED]) {
          document.body.classList.add("cati-buttons-minimized");
        }
      }
    } catch (_) {}
  }

  function atualizarDotStatusMenuToggle() {
    const dot = document.getElementById("cati-menu-status-dot");
    if (!dot) return;

    const triggerSla = document.getElementById("cati-sla-floating-trigger");
    if (!triggerSla || triggerSla.style.display === "none") {
      dot.className = "cati-menu-dot";
      return;
    }

    if (triggerSla.classList.contains("status-violated")) {
      dot.className = "cati-menu-dot dot-violated";
      dot.title = "SLA Violado!";
    } else if (triggerSla.classList.contains("status-ok")) {
      dot.className = "cati-menu-dot dot-ok";
      dot.title = "SLA Dentro do Prazo";
    } else if (triggerSla.classList.contains("status-paused")) {
      dot.className = "cati-menu-dot dot-paused";
      dot.title = "SLA Pausado";
    } else if (triggerSla.classList.contains("status-running")) {
      dot.className = "cati-menu-dot dot-running";
      dot.title = "SLA Em Andamento";
    } else {
      dot.className = "cati-menu-dot";
    }
  }

  function injetarMenuToggleAssyst() {
    if (document.getElementById("cati-assyst-menu-toggle")) return;

    const btn = document.createElement("button");
    btn.id = "cati-assyst-menu-toggle";
    btn.type = "button";
    btn.className = "cati-assyst-menu-toggle";
    btn.title = "Menu CATI 2N (Alternar botões da extensão - Alt+M)";
    btn.innerHTML = `
      <span class="cati-menu-icon">☰</span>
      <span class="cati-menu-label">CATI</span>
      <span class="cati-menu-dot" id="cati-menu-status-dot"></span>
    `;

    btn.onclick = (e) => {
      e.stopPropagation();
      alternarMinimizacaoBotoes();
    };

    document.body.appendChild(btn);
    carregarEstadoMinimizado();
  }

  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "m" || e.key === "M")) {
      alternarMinimizacaoBotoes();
    }
  });

  // =========================================================================
  // 7.2. SINCRONIZAÇÃO DO CHAMADO ATIVO COM O STORAGE (Multi-abas Assyst)
  // =========================================================================
  const STORAGE_KEY_ACTIVE_TICKET = "cati_active_ticket";
  const STORAGE_KEY_RECENT_TICKETS = "cati_recent_tickets";
  let ultimoChamadoSincronizado = null;

  function obterDadosChamadoAtivo() {
    if (!isDentroDeChamado()) return null;

    const numChamadoBruto = extrairNumeroChamadoAtivo();
    let chamado = "";
    if (numChamadoBruto && numChamadoBruto.toLowerCase() !== "chamado" && numChamadoBruto !== "-") {
      const m = numChamadoBruto.match(/\b([A-Za-z]{0,3}\d{5,10})\b/);
      chamado = m ? m[1] : numChamadoBruto.trim();
    }

    const ficha = extrairDadosFichaChamado();
    const sentinelas = ["", "-", "por definir", "nenhum", "null", "undefined"];

    let assunto = "";
    const itemLimpo = (ficha.item || "").trim();
    const resumoLimpo = (ficha.resumo || "").trim();

    if (itemLimpo && !sentinelas.includes(itemLimpo.toLowerCase())) {
      assunto = itemLimpo;
    } else if (resumoLimpo && !sentinelas.includes(resumoLimpo.toLowerCase())) {
      assunto = resumoLimpo;
    }

    if (!chamado && !assunto) return null;

    return { chamado, assunto };
  }

  async function sincronizarChamadoAtivoStorage() {
    try {
      const dados = obterDadosChamadoAtivo();
      if (!dados || !dados.chamado) return;

      const chaveUnica = `${dados.chamado}|${dados.assunto}`;
      if (ultimoChamadoSincronizado === chaveUnica) return;
      ultimoChamadoSincronizado = chaveUnica;

      const payloadAtivo = {
        chamado: dados.chamado,
        assunto: dados.assunto,
        atualizadoEm: Date.now()
      };

      // 1. Atualizar chamado ativo
      await chrome.storage.local.set({
        [STORAGE_KEY_ACTIVE_TICKET]: payloadAtivo
      });

      // 2. Atualizar histórico dos últimos 5 chamados recentes
      const res = await chrome.storage.local.get([STORAGE_KEY_RECENT_TICKETS]);
      let historico = Array.isArray(res?.[STORAGE_KEY_RECENT_TICKETS]) ? res[STORAGE_KEY_RECENT_TICKETS] : [];
      historico = historico.filter(item => item && item.chamado !== dados.chamado);
      historico.unshift(payloadAtivo);
      if (historico.length > 5) historico = historico.slice(0, 5);

      await chrome.storage.local.set({
        [STORAGE_KEY_RECENT_TICKETS]: historico
      });
    } catch (_) {}
  }

  // =========================================================================
  // 8. CICLO DE EXECUÇÃO OTIMIZADO COM DEBOUNCE
  // =========================================================================
  function executarTodasVerificacoes() {
    try {
      injetarMenuToggleAssyst();
      atualizarDotStatusMenuToggle();

      const dentro = isDentroDeChamado();
      if (dentro) {
        removerAlertaVip();
        removerDestaquesAgendados();
        verificarCamposEdificioEItemB();
        verificarBaseDeConhecimento();
        injetarBotaoCopiarFicha();
        sincronizarChamadoAtivoStorage();
      } else {
        removerLembreteBase();
        removerBotoesChamado();
        verificarUsuarioVipListaGeral();
      }
    } catch (e) {
      console.warn("[Assistente 2N Alertas] Erro nas verificações:", e);
    }
  }

  // Sincronizar ao alternar abas do navegador (foco na aba)
  window.addEventListener("focus", () => {
    ultimoChamadoSincronizado = null;
    sincronizarChamadoAtivoStorage();
    agendarVerificacoes(100);
  });

  window.addEventListener("blur", () => {
    ultimoChamadoSincronizado = null;
  });

  // Interceptar cliques no DOM para atualizar imediatamente após seleção de chamado ou troca de abas
  document.addEventListener("click", () => agendarVerificacoes(150), { passive: true });

  // Escutar eventos de digitação diretamente nos campos (baixa latência e sem sobrecarga)
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id && (e.target.id.includes("building") || e.target.id.includes("itemB"))) {
      agendarVerificacoes(100);
    }
  }, { passive: true });

  document.addEventListener("change", (e) => {
    if (e.target && e.target.id && (e.target.id.includes("building") || e.target.id.includes("itemB"))) {
      agendarVerificacoes(100);
    }
  }, { passive: true });

  // Observador de mutações no DOM
  const observer = new MutationObserver(() => {
    agendarVerificacoes(250);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("hashchange", () => agendarVerificacoes(150));
  window.addEventListener("popstate", () => agendarVerificacoes(150));

  // Intervalo leve de sincronização periódica (backup para carregamentos assíncronos do Dojo)
  setInterval(executarTodasVerificacoes, 3000);

  // Inicialização
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => agendarVerificacoes(200), { once: true });
  } else {
    agendarVerificacoes(200);
  }
})();
