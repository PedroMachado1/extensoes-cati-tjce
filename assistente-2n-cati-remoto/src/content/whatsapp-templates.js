(() => {
  // Evitar injeção duplicada ou fora do domínio web.whatsapp.com
  if (window.__catiWhatsAppTemplatesLoaded) return;
  if (!window.location.origin.includes("whatsapp.com") && !window.location.hostname.includes("whatsapp.com")) return;
  window.__catiWhatsAppTemplatesLoaded = true;

  const STORAGE_KEY = "cati_wa_templates";
  const DEFAULT_TEMPLATES = [
    {
      id: "tpl_primeiro_contato",
      title: "Primeiro Contato Remoto",
      category: "contato",
      text: "{saudacao}! Meu nome é NOME. Sou Técnico(a) da CATI do TJCE e estou entrando em contato referente ao chamado #{chamado} ({assunto}). Podemos verificar remotamente?"
    },
    {
      id: "tpl_acompanhamento",
      title: "Cobrança de Resposta",
      category: "acompanhamento",
      text: "{saudacao}! Sou da CATI do TJCE e gostaria de saber se você ainda precisa de suporte para o chamado #{chamado} ({assunto}). Aguardo seu retorno."
    },
    {
      id: "tpl_encerramento",
      title: "Encerramento de Atendimento",
      category: "encerramento",
      text: "O atendimento referente ao chamado #{chamado} ({assunto}) foi concluído com sucesso. Tenha um excelente dia/tarde!"
    }
  ];

  const CATEGORIAS_MAP = {
    contato: "Primeiro Contato",
    acompanhamento: "Acompanhamento",
    encerramento: "Encerramento",
    geral: "Geral"
  };

  let templatesCache = [];
  let editingId = null;
  let activeCategoryFilter = "todos";

  // =========================================================================
  // 0. MOTOR DE RESOLUÇÃO DE VARIÁVEIS DINÂMICAS E CHAMADO ATIVO
  // =========================================================================
  const STORAGE_KEY_ACTIVE_TICKET = "cati_active_ticket";
  const STORAGE_KEY_RECENT_TICKETS = "cati_recent_tickets";
  let activeTicketContext = { chamado: "", assunto: "", origem: "manual" };
  let recentTicketsCache = [];

  function resolverSaudacao(dataReferencia = new Date()) {
    const hora = dataReferencia.getHours();
    return hora < 12 ? "Bom dia" : "Boa tarde";
  }

  function processarVariaveis(texto, contexto = {}, dataReferencia = new Date()) {
    if (!texto) return "";
    const saudacao = resolverSaudacao(dataReferencia);
    const chamado = (contexto.chamado || "").trim() || "[Nº CHAMADO]";
    const assunto = (contexto.assunto || "").trim() || "[ASSUNTO]";

    return texto
      .replace(/\{saudacao\}/gi, () => saudacao)
      .replace(/\{chamado\}/gi, () => chamado)
      .replace(/\{assunto\}/gi, () => assunto);
  }

  async function carregarChamadoAtivo() {
    try {
      const res = await chrome.storage.local.get([STORAGE_KEY_ACTIVE_TICKET, STORAGE_KEY_RECENT_TICKETS]);
      const ticket = res?.[STORAGE_KEY_ACTIVE_TICKET];
      if (ticket && (ticket.chamado || ticket.assunto)) {
        activeTicketContext = {
          chamado: ticket.chamado || "",
          assunto: ticket.assunto || "",
          origem: "assyst"
        };
      }
      recentTicketsCache = Array.isArray(res?.[STORAGE_KEY_RECENT_TICKETS]) ? res[STORAGE_KEY_RECENT_TICKETS] : [];
    } catch (_) {}
    atualizarCardChamadoAtivoUI();
    renderizarChipsChamadosRecentes();
  }

  function renderizarChipsChamadosRecentes() {
    const container = document.getElementById("cati-wa-recent-tickets-chips");
    if (!container) return;

    if (!Array.isArray(recentTicketsCache) || recentTicketsCache.length === 0) {
      container.style.display = "none";
      container.innerHTML = "";
      return;
    }

    container.innerHTML = "";
    container.style.display = "flex";

    recentTicketsCache.forEach(ticket => {
      if (!ticket || !ticket.chamado) return;
      const chip = document.createElement("button");
      chip.type = "button";
      const isAtivo = ticket.chamado === activeTicketContext.chamado;
      chip.className = `cati-wa-recent-chip${isAtivo ? " active" : ""}`;
      chip.title = `Chamado #${ticket.chamado}: ${ticket.assunto || "Sem assunto"}`;
      chip.innerHTML = `<span>#${ticket.chamado}</span>`;

      chip.onclick = () => {
        activeTicketContext = {
          chamado: ticket.chamado,
          assunto: ticket.assunto || "",
          origem: "assyst"
        };
        atualizarCardChamadoAtivoUI();
        renderizarChipsChamadosRecentes();
      };

      container.appendChild(chip);
    });
  }

  function atualizarCardChamadoAtivoUI() {
    const inputNum = document.getElementById("cati-wa-ticket-num");
    const inputSub = document.getElementById("cati-wa-ticket-subject");
    const badge = document.getElementById("cati-wa-ticket-badge");
    if (!inputNum || !inputSub || !badge) return;

    if (document.activeElement !== inputNum) {
      inputNum.value = activeTicketContext.chamado;
    }
    if (document.activeElement !== inputSub) {
      inputSub.value = activeTicketContext.assunto;
    }

    if (activeTicketContext.origem === "assyst") {
      badge.className = "cati-wa-ticket-badge cati-wa-badge-assyst";
      badge.textContent = "🟢 Assyst";
      badge.title = "Sincronizado automaticamente da sua aba ativa do Assyst";
    } else {
      badge.className = "cati-wa-ticket-badge cati-wa-badge-manual";
      badge.textContent = "⚪ Manual";
      badge.title = "Preenchido ou ajustado manualmente";
    }

    document.querySelectorAll(".cati-wa-recent-chip").forEach(c => {
      const num = c.innerText.replace("#", "").trim();
      c.classList.toggle("active", num === activeTicketContext.chamado);
    });
  }

  function limparChamadoAtivo() {
    activeTicketContext = { chamado: "", assunto: "", origem: "manual" };
    const inputNum = document.getElementById("cati-wa-ticket-num");
    const inputSub = document.getElementById("cati-wa-ticket-subject");
    if (inputNum) inputNum.value = "";
    if (inputSub) inputSub.value = "";
    atualizarCardChamadoAtivoUI();
    document.querySelectorAll(".cati-wa-recent-chip").forEach(c => c.classList.remove("active"));
  }

  // Ouvir mudanças automáticas no storage (troca de aba do Assyst)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes[STORAGE_KEY_ACTIVE_TICKET]) {
        const novo = changes[STORAGE_KEY_ACTIVE_TICKET].newValue;
        if (novo && (novo.chamado || novo.assunto)) {
          activeTicketContext = {
            chamado: novo.chamado || "",
            assunto: novo.assunto || "",
            origem: "assyst"
          };
          atualizarCardChamadoAtivoUI();
        }
      }
      if (changes[STORAGE_KEY_RECENT_TICKETS]) {
        recentTicketsCache = Array.isArray(changes[STORAGE_KEY_RECENT_TICKETS].newValue)
          ? changes[STORAGE_KEY_RECENT_TICKETS].newValue
          : [];
        renderizarChipsChamadosRecentes();
      }
    }
  });

  // =========================================================================
  // 1. CARREGAMENTO E PERSISTÊNCIA DOS MODELOS
  // =========================================================================
  async function carregarModelos() {
    try {
      const res = await chrome.storage.local.get([STORAGE_KEY]);
      const salvos = res?.[STORAGE_KEY];
      if (Array.isArray(salvos) && salvos.length > 0) {
        templatesCache = salvos;
      } else {
        templatesCache = [...DEFAULT_TEMPLATES];
        await chrome.storage.local.set({ [STORAGE_KEY]: templatesCache });
      }
    } catch (_) {
      templatesCache = [...DEFAULT_TEMPLATES];
    }
    return templatesCache;
  }

  async function salvarModelosNoStorage(modelos) {
    templatesCache = modelos;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: modelos });
    } catch (_) {}
  }

  // =========================================================================
  // 2. LOCALIZAR CAIXA DE TEXTO ATIVA DO WHATSAPP WEB E INSERIR MENSAGEM
  // =========================================================================
  function obterCaixaMensagemWhatsApp() {
    const seletores = [
      "#main footer div[contenteditable='true']",
      "footer div[contenteditable='true']",
      "div[contenteditable='true'][data-tab='10']",
      "div[contenteditable='true'][role='textbox']",
      "div[contenteditable='true']"
    ];

    for (const sel of seletores) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        return el;
      }
    }
    return null;
  }

  async function inserirMensagemNoChat(texto) {
    // 1. Copiar sempre para o clipboard por garantia
    try {
      await navigator.clipboard.writeText(texto);
    } catch (_) {}

    // 2. Localizar o campo de digitação da conversa ativa
    const inputEl = obterCaixaMensagemWhatsApp();
    if (!inputEl) {
      exibirToast("📋 Mensagem copiada para a área de transferência!");
      return;
    }

    try {
      inputEl.focus();

      // Inserção compatível com a engine React / Lexical do WhatsApp Web
      const inseriu = document.execCommand("insertText", false, texto);

      if (!inseriu) {
        // Fallback por evento de input
        inputEl.innerText = texto;
        inputEl.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: texto }));
      }

      // Disparar eventos para validar estado do botão de envio nativo
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));

      exibirToast("✓ Inserido no chat do WhatsApp!");
      fecharDrawer();
    } catch (err) {
      console.warn("[Assistente 2N WA] Erro ao colar no chat, mantido no clipboard:", err);
      exibirToast("📋 Mensagem copiada para a área de transferência!");
    }
  }

  // =========================================================================
  // 3. TOAST DE FEEDBACK
  // =========================================================================
  let toastTimer = null;
  function exibirToast(msg) {
    let toast = document.getElementById("cati-wa-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "cati-wa-toast";
      toast.className = "cati-wa-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);
  }

  // =========================================================================
  // 4. CONSTRUÇÃO DA INTERFACE (Botão Flutuante e Barra Lateral)
  // =========================================================================
  function alternarDrawer() {
    const drawer = document.getElementById("cati-wa-drawer");
    const trigger = document.getElementById("cati-wa-trigger-btn");
    if (!drawer) return;

    const estaAberto = drawer.classList.contains("is-open");
    if (estaAberto) {
      fecharDrawer();
    } else {
      abrirDrawer();
    }
  }

  function abrirDrawer() {
    const drawer = document.getElementById("cati-wa-drawer");
    const trigger = document.getElementById("cati-wa-trigger-btn");
    if (drawer) drawer.classList.add("is-open");
    if (trigger) trigger.classList.add("drawer-open");
    carregarChamadoAtivo();
    renderizarLista();
  }

  function fecharDrawer() {
    const drawer = document.getElementById("cati-wa-drawer");
    const trigger = document.getElementById("cati-wa-trigger-btn");
    if (drawer) drawer.classList.remove("is-open");
    if (trigger) trigger.classList.remove("drawer-open");
    fecharFormulario();
  }

  async function aplicarPosicaoSalvaTrigger(btn) {
    try {
      const data = await chrome.storage.local.get(["cati_wa_trigger_top", "cati_wa_trigger_minimized"]);
      if (typeof data.cati_wa_trigger_top === "number") {
        btn.style.top = `${data.cati_wa_trigger_top}%`;
        btn.style.transform = "none";
      }
      if (data.cati_wa_trigger_minimized) {
        btn.classList.add("minimized");
      }
    } catch (_) {}
  }

  async function alternarMinimizarTrigger(e) {
    if (e) e.stopPropagation();
    const btn = document.getElementById("cati-wa-trigger-btn");
    if (!btn) return;
    const isMin = btn.classList.toggle("minimized");
    try {
      await chrome.storage.local.set({ "cati_wa_trigger_minimized": isMin });
    } catch (_) {}
  }

  function configurarArrasteTrigger(btn) {
    let startY = 0;
    let initialTop = 0;
    let isDragging = false;
    let hasMoved = false;

    btn.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".cati-wa-trigger-minimize-btn")) return;
      if (e.button !== 0) return;

      startY = e.clientY;
      const rect = btn.getBoundingClientRect();
      initialTop = rect.top;
      hasMoved = false;
      isDragging = false;

      function onPointerMove(moveEvent) {
        const deltaY = moveEvent.clientY - startY;
        if (!isDragging && Math.abs(deltaY) > 5) {
          isDragging = true;
          hasMoved = true;
          btn.classList.add("is-dragging");
          btn.setPointerCapture?.(moveEvent.pointerId);
        }

        if (isDragging) {
          const btnHeight = btn.offsetHeight || 40;
          const maxTop = window.innerHeight - btnHeight - 16;
          const newTop = Math.max(16, Math.min(maxTop, initialTop + deltaY));
          btn.style.top = `${newTop}px`;
          btn.style.transform = "none";
        }
      }

      function onPointerUp(upEvent) {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);

        if (isDragging) {
          btn.classList.remove("is-dragging");
          btn.releasePointerCapture?.(upEvent.pointerId);
          const currentTop = btn.getBoundingClientRect().top;
          const pct = Math.max(2, Math.min(95, (currentTop / window.innerHeight) * 100));
          chrome.storage.local.set({ "cati_wa_trigger_top": pct }).catch(() => {});
        } else if (!hasMoved) {
          alternarDrawer();
        }
      }

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    });
  }

  function renderizarTrigger() {
    if (document.getElementById("cati-wa-trigger-btn")) return;

    const btn = document.createElement("div");
    btn.id = "cati-wa-trigger-btn";
    btn.title = "Modelos CATI 2N (Arraste para mover, clique para abrir)";
    btn.innerHTML = `
      <span class="cati-wa-trigger-grip" title="Arraste para reposicionar">⋮⋮</span>
      <span class="cati-wa-trigger-icon">💬</span>
      <span class="cati-wa-trigger-label">Modelos CATI</span>
      <button type="button" class="cati-wa-trigger-minimize-btn" title="Minimizar / Expandir aba">›</button>
    `;

    const miniBtn = btn.querySelector(".cati-wa-trigger-minimize-btn");
    if (miniBtn) {
      miniBtn.onclick = alternarMinimizarTrigger;
    }

    configurarArrasteTrigger(btn);
    aplicarPosicaoSalvaTrigger(btn);

    document.body.appendChild(btn);
  }

  function inserirTagNaTextarea(tag) {
    const textarea = document.getElementById("cati-wa-input-text");
    if (!textarea) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;

    if (typeof textarea.setRangeText === "function") {
      textarea.setRangeText(tag, start, end, "end");
    } else {
      textarea.value = textarea.value.substring(0, start) + tag + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    }
    textarea.focus();
  }

  function renderizarDrawer() {
    if (document.getElementById("cati-wa-drawer")) return;

    const drawer = document.createElement("aside");
    drawer.id = "cati-wa-drawer";
    drawer.innerHTML = `
      <header class="cati-wa-header">
        <h3 class="cati-wa-header-title">
          <span>💬</span>
          <span>Modelos de Resposta CATI 2N</span>
        </h3>
        <button type="button" class="cati-wa-close-btn" id="cati-wa-close-btn" title="Fechar">✕</button>
      </header>

      <div id="cati-wa-active-ticket-card" class="cati-wa-active-ticket-card">
        <div class="cati-wa-ticket-header">
          <div class="cati-wa-ticket-title-row">
            <span class="cati-wa-ticket-icon">📌</span>
            <span class="cati-wa-ticket-label">Chamado Ativo</span>
            <span id="cati-wa-ticket-badge" class="cati-wa-ticket-badge cati-wa-badge-manual">⚪ Manual</span>
          </div>
          <button type="button" id="cati-wa-ticket-clear" class="cati-wa-ticket-clear" title="Limpar campos do chamado">✕ Limpar</button>
        </div>
        <div id="cati-wa-recent-tickets-chips" class="cati-wa-recent-tickets-chips" style="display: none;"></div>
        <div class="cati-wa-ticket-inputs">
          <input type="text" id="cati-wa-ticket-num" class="cati-wa-ticket-input-num" placeholder="Nº Chamado (ex: 245890)">
          <input type="text" id="cati-wa-ticket-subject" class="cati-wa-ticket-input-subject" placeholder="Assunto do chamado...">
        </div>
      </div>

      <div class="cati-wa-top-actions">
        <button type="button" class="cati-wa-btn-add" id="cati-wa-btn-open-form">
          <span>➕ Novo Modelo</span>
        </button>
        <input type="text" class="cati-wa-search-input" id="cati-wa-search" placeholder="🔍 Buscar modelo...">
        <div id="cati-wa-category-tabs" class="cati-wa-category-tabs">
          <button type="button" class="cati-wa-category-tab active" data-category="todos">Todos</button>
          <button type="button" class="cati-wa-category-tab" data-category="contato">Contato</button>
          <button type="button" class="cati-wa-category-tab" data-category="acompanhamento">Acompanhamento</button>
          <button type="button" class="cati-wa-category-tab" data-category="encerramento">Encerramento</button>
          <button type="button" class="cati-wa-category-tab" data-category="geral">Geral</button>
        </div>
      </div>

      <div id="cati-wa-form-container" class="cati-wa-form-container" style="display: none;">
        <h4 class="cati-wa-form-title" id="cati-wa-form-title">Novo Modelo de Mensagem</h4>
        <div class="cati-wa-form-row">
          <input type="text" id="cati-wa-input-title" class="cati-wa-form-input" placeholder="Título (ex: Primeiro Contato)">
          <select id="cati-wa-input-category" class="cati-wa-form-select" title="Categoria do modelo">
            <option value="contato">Contato</option>
            <option value="acompanhamento">Acompanhamento</option>
            <option value="encerramento">Encerramento</option>
            <option value="geral">Geral</option>
          </select>
        </div>
        <div class="cati-wa-tag-chips" id="cati-wa-tag-chips">
          <span class="cati-wa-tag-chips-label">Atalhos:</span>
          <button type="button" class="cati-wa-tag-chip" id="cati-wa-chip-saudacao" title="Inserir saudação automática baseada no horário">+ {saudacao}</button>
          <button type="button" class="cati-wa-tag-chip" id="cati-wa-chip-chamado" title="Inserir número do chamado ativo">+ {chamado}</button>
          <button type="button" class="cati-wa-tag-chip" id="cati-wa-chip-assunto" title="Inserir assunto do chamado ativo">+ {assunto}</button>
        </div>
        <textarea id="cati-wa-input-text" class="cati-wa-form-textarea" placeholder="Digite a mensagem do modelo..."></textarea>
        <div class="cati-wa-form-buttons">
          <button type="button" class="cati-wa-btn-cancel" id="cati-wa-btn-cancel-form">Cancelar</button>
          <button type="button" class="cati-wa-btn-save" id="cati-wa-btn-save-form">Salvar Modelo</button>
        </div>
      </div>

      <div class="cati-wa-list" id="cati-wa-list"></div>
    `;

    document.body.appendChild(drawer);

    // Eventos do Drawer
    document.getElementById("cati-wa-close-btn").onclick = fecharDrawer;
    document.getElementById("cati-wa-btn-open-form").onclick = abrirFormularioCriacao;
    document.getElementById("cati-wa-btn-cancel-form").onclick = fecharFormulario;
    document.getElementById("cati-wa-btn-save-form").onclick = salvarFormulario;

    document.getElementById("cati-wa-chip-saudacao").onclick = () => inserirTagNaTextarea("{saudacao}");
    document.getElementById("cati-wa-chip-chamado").onclick = () => inserirTagNaTextarea("{chamado}");
    document.getElementById("cati-wa-chip-assunto").onclick = () => inserirTagNaTextarea("{assunto}");

    document.querySelectorAll(".cati-wa-category-tab").forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll(".cati-wa-category-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        activeCategoryFilter = tab.getAttribute("data-category") || "todos";
        renderizarLista(document.getElementById("cati-wa-search")?.value || "");
      };
    });

    const inputNum = document.getElementById("cati-wa-ticket-num");
    const inputSub = document.getElementById("cati-wa-ticket-subject");
    const btnClear = document.getElementById("cati-wa-ticket-clear");

    if (inputNum) {
      inputNum.oninput = () => {
        activeTicketContext.chamado = inputNum.value.trim();
        activeTicketContext.origem = "manual";
        atualizarCardChamadoAtivoUI();
      };
    }
    if (inputSub) {
      inputSub.oninput = () => {
        activeTicketContext.assunto = inputSub.value.trim();
        activeTicketContext.origem = "manual";
        atualizarCardChamadoAtivoUI();
      };
    }
    if (btnClear) {
      btnClear.onclick = limparChamadoAtivo;
    }

    const searchInput = document.getElementById("cati-wa-search");
    if (searchInput) {
      searchInput.oninput = () => renderizarLista(searchInput.value);
    }
  }

  // =========================================================================
  // 5. RENDERIZAÇÃO DA LISTA DE CARDS
  // =========================================================================
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderizarLista(filtro = "") {
    const listEl = document.getElementById("cati-wa-list");
    if (!listEl) return;

    listEl.innerHTML = "";
    const termo = filtro.trim().toLowerCase();

    const filtrados = templatesCache.filter(t => {
      const cat = t.category || "geral";
      if (activeCategoryFilter !== "todos" && cat !== activeCategoryFilter) {
        return false;
      }
      if (!termo) return true;
      return t.title.toLowerCase().includes(termo) || t.text.toLowerCase().includes(termo);
    });

    if (filtrados.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "cati-wa-empty";
      const catLabel = CATEGORIAS_MAP[activeCategoryFilter] || activeCategoryFilter;
      emptyEl.innerHTML = termo
        ? `Nenhum modelo encontrado para "<strong>${escapeHtml(termo)}</strong>" na categoria <strong>${catLabel}</strong>.`
        : `Nenhum modelo nesta categoria (${catLabel}).<br>Clique em <strong>➕ Novo Modelo</strong> para adicionar.`;
      listEl.appendChild(emptyEl);
      return;
    }

    filtrados.forEach(tpl => {
      const card = document.createElement("div");
      card.className = "cati-wa-card";
      const catNome = CATEGORIAS_MAP[tpl.category] || "Geral";
      const safeTitle = escapeHtml(tpl.title);
      const safeText = escapeHtml(tpl.text);

      card.innerHTML = `
        <div class="cati-wa-card-header">
          <div class="cati-wa-card-title-group">
            <h4 class="cati-wa-card-title" title="${safeTitle}">${safeTitle}</h4>
            <span class="cati-wa-card-category cat-${tpl.category || 'geral'}">${catNome}</span>
          </div>
          <div class="cati-wa-card-tools">
            <button type="button" class="cati-wa-tool-btn btn-edit" title="Editar este modelo">✏️</button>
            <button type="button" class="cati-wa-tool-btn btn-delete" title="Excluir este modelo">🗑️</button>
          </div>
        </div>
        <div class="cati-wa-card-body">${safeText}</div>
        <div class="cati-wa-card-actions">
          <button type="button" class="cati-wa-btn-insert" title="Colar diretamente na conversa ativa">
            <span>💬 Inserir no Chat</span>
          </button>
          <button type="button" class="cati-wa-btn-copy" title="Copiar para a área de transferência">
            <span>📋 Copiar</span>
          </button>
        </div>
      `;

      // Ações dos botões
      const btnInsert = card.querySelector(".cati-wa-btn-insert");
      btnInsert.onclick = async () => {
        btnInsert.classList.add("success");
        btnInsert.innerHTML = "<span>✓ Inserido!</span>";
        await inserirMensagemNoChat(processarVariaveis(tpl.text, activeTicketContext));
        setTimeout(() => {
          btnInsert.classList.remove("success");
          btnInsert.innerHTML = "<span>💬 Inserir no Chat</span>";
        }, 1500);
      };

      const btnCopy = card.querySelector(".cati-wa-btn-copy");
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(processarVariaveis(tpl.text, activeTicketContext));
          btnCopy.classList.add("success");
          btnCopy.innerHTML = "<span>✓ Copiado!</span>";
          exibirToast("📋 Modelo copiado!");
          setTimeout(() => {
            btnCopy.classList.remove("success");
            btnCopy.innerHTML = "<span>📋 Copiar</span>";
          }, 1800);
        } catch (_) {}
      };

      const btnEdit = card.querySelector(".btn-edit");
      btnEdit.onclick = () => abrirFormularioEdicao(tpl);

      const btnDelete = card.querySelector(".btn-delete");
      btnDelete.onclick = () => excluirModelo(tpl.id, tpl.title);

      listEl.appendChild(card);
    });
  }

  // =========================================================================
  // 6. CADASTRO, EDIÇÃO E EXCLUSÃO DE MODELOS
  // =========================================================================
  function abrirFormularioCriacao() {
    editingId = null;
    document.getElementById("cati-wa-form-title").textContent = "Novo Modelo de Mensagem";
    document.getElementById("cati-wa-input-title").value = "";
    document.getElementById("cati-wa-input-text").value = "";
    const inputCat = document.getElementById("cati-wa-input-category");
    if (inputCat) inputCat.value = activeCategoryFilter !== "todos" ? activeCategoryFilter : "contato";
    document.getElementById("cati-wa-form-container").style.display = "flex";
    document.getElementById("cati-wa-input-title").focus();
  }

  function abrirFormularioEdicao(tpl) {
    editingId = tpl.id;
    document.getElementById("cati-wa-form-title").textContent = "Editar Modelo de Mensagem";
    document.getElementById("cati-wa-input-title").value = tpl.title;
    document.getElementById("cati-wa-input-text").value = tpl.text;
    const inputCat = document.getElementById("cati-wa-input-category");
    if (inputCat) inputCat.value = tpl.category || "geral";
    document.getElementById("cati-wa-form-container").style.display = "flex";
    document.getElementById("cati-wa-input-title").focus();
  }

  function fecharFormulario() {
    editingId = null;
    const form = document.getElementById("cati-wa-form-container");
    if (form) form.style.display = "none";
  }

  async function salvarFormulario() {
    const inputTitle = document.getElementById("cati-wa-input-title");
    const inputText = document.getElementById("cati-wa-input-text");
    const inputCat = document.getElementById("cati-wa-input-category");
    const titulo = (inputTitle?.value || "").trim();
    const texto = (inputText?.value || "").trim();
    const categoria = (inputCat?.value || "geral").trim();

    if (!titulo) {
      exibirToast("⚠️ Digite um título para o modelo.");
      inputTitle?.focus();
      return;
    }

    if (!texto) {
      exibirToast("⚠️ Digite o texto da mensagem.");
      inputText?.focus();
      return;
    }

    if (editingId) {
      // Atualizar existente
      templatesCache = templatesCache.map(t => {
        if (t.id === editingId) {
          return { ...t, title: titulo, text: texto, category: categoria };
        }
        return t;
      });
      exibirToast("✓ Modelo atualizado com sucesso!");
    } else {
      // Criar novo
      const novoId = "tpl_" + Date.now();
      templatesCache.unshift({
        id: novoId,
        title: titulo,
        text: texto,
        category: categoria
      });
      exibirToast("✓ Novo modelo adicionado!");
    }

    await salvarModelosNoStorage(templatesCache);
    fecharFormulario();
    const termoBusca = document.getElementById("cati-wa-search")?.value || "";
    renderizarLista(termoBusca);
  }

  async function excluirModelo(id, titulo) {
    const confirmar = window.confirm(`Deseja realmente excluir o modelo "${titulo}"?`);
    if (!confirmar) return;

    templatesCache = templatesCache.filter(t => t.id !== id);
    await salvarModelosNoStorage(templatesCache);
    exibirToast("🗑️ Modelo excluído.");
    const termoBusca = document.getElementById("cati-wa-search")?.value || "";
    renderizarLista(termoBusca);
  }

  // Fechar com tecla ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharDrawer();
    }
  });

  // Fechar ao clicar fora do drawer
  document.addEventListener("click", (e) => {
    const drawer = document.getElementById("cati-wa-drawer");
    const trigger = document.getElementById("cati-wa-trigger-btn");
    if (!drawer || !drawer.classList.contains("is-open")) return;

    if (!drawer.contains(e.target) && !trigger.contains(e.target)) {
      fecharDrawer();
    }
  }, true);

  // =========================================================================
  // 7. INICIALIZAÇÃO RESILIENTE
  // =========================================================================
  async function inicializar() {
    await carregarModelos();
    renderizarTrigger();
    renderizarDrawer();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar, { once: true });
  } else {
    inicializar();
  }
})();
