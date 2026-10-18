/**
 * Núcleo de Lógica, Máquina de Estados e Formatação de Textos
 * Subsistema de Downtime & Outage Tracker do Assyst — 2N CATI Remoto (TJCE)
 */
'use strict';

const CatiDowntimeEngine = (() => {
  const ENGINE_VERSION = '1.0.0';

  /**
   * Formata objeto Date para data BR (DD/MM/AAAA)
   */
  function formatarDataBR(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  /**
   * Formata objeto Date para hora BR (HH:MM:SS)
   */
  function formatarHoraBR(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /**
   * Detecta se o Assyst está fora do ar com base na URL e conteúdo do DOM/texto.
   * @param {string} url - URL atual
   * @param {string|object} domOrText - Objeto DOM com querySelector ou string com texto/HTML
   * @returns {{ caiu: boolean, motivo: string | null }}
   */
  function detectarQuedaAssyst(url, domOrText) {
    const u = String(url || '');
    let t = '';
    let dom = null;

    if (typeof domOrText === 'string') {
      t = domOrText;
    } else if (domOrText && typeof domOrText === 'object') {
      dom = domOrText;
      if (dom.body && typeof dom.body.innerText === 'string') {
        t = dom.body.innerText;
      } else if (typeof dom.innerText === 'string') {
        t = dom.innerText;
      } else if (typeof dom.textContent === 'string') {
        t = dom.textContent;
      }
    }

    const tLower = t.toLowerCase();

    // 1. Elementos estruturais e seletores específicos do Assyst para erro e logout
    let hasErrorBox = false;
    let hasErrorList = false;
    let hasLogoutMessage = false;
    let validationErrorText = '';

    if (dom && typeof dom.querySelector === 'function') {
      const errBox = (typeof dom.getElementById === 'function' ? dom.getElementById('errorbox') : null) || dom.querySelector('#errorbox');
      const errList = (typeof dom.getElementById === 'function' ? dom.getElementById('errorlist') : null) || dom.querySelector('#errorlist') || dom.querySelector('.axios-logout-error');
      const logoutLink = (typeof dom.getElementById === 'function' ? dom.getElementById('logoutMessage') : null) || dom.querySelector('#logoutMessage');
      const validationErr = dom.querySelector('a[name="validationerror"]') || dom.querySelector('[name="validationerror"]') || dom.querySelector('#errorlist li');

      hasErrorBox = Boolean(errBox);
      hasErrorList = Boolean(errList);
      hasLogoutMessage = Boolean(logoutLink);
      if (validationErr) {
        validationErrorText = String(validationErr.innerText || validationErr.textContent || '').trim();
      }
    } else {
      if (t.includes('id="errorbox"') || t.includes("id='errorbox'")) hasErrorBox = true;
      if (t.includes('id="errorlist"') || t.includes("id='errorlist'") || t.includes('axios-logout-error')) hasErrorList = true;
      if (t.includes('id="logoutMessage"') || t.includes("id='logoutMessage'")) hasLogoutMessage = true;
    }

    // 2. Falta de licenças (prioridade máxima caso apareça no texto ou no box de erro)
    const valLower = validationErrorText.toLowerCase();
    const hasLicencaText = tLower.includes('licença') || tLower.includes('licenca') || valLower.includes('licen');
    if (hasLicencaText && (hasErrorBox || hasErrorList || hasLogoutMessage || tLower.includes('uso') || tLower.includes('esgotad') || tLower.includes('limite') || tLower.includes('tente novamente') || valLower.includes('uso'))) {
      return { caiu: true, motivo: 'Falta de Licenças Disponíveis' };
    }

    // 3. Sessão expirada
    const hasSessaoExpiradaText = tLower.includes('sessão expirou') || tLower.includes('sessao expirou') || valLower.includes('expir');
    if (hasSessaoExpiradaText) {
      return { caiu: true, motivo: 'Sessão Expirada' };
    }

    // 4. Se encontrou elementos específicos de erro ou logout do Assyst
    if (hasErrorBox || hasErrorList || hasLogoutMessage) {
      if (validationErrorText) {
        if (/licen/i.test(validationErrorText)) return { caiu: true, motivo: 'Falta de Licenças Disponíveis' };
        if (/expir/i.test(validationErrorText)) return { caiu: true, motivo: 'Sessão Expirada' };
        return { caiu: true, motivo: `Instabilidade do Sistema (${validationErrorText})` };
      }
      if (hasLogoutMessage || tLower.includes('você saiu do aplicativo') || tLower.includes('voce saiu do aplicativo')) {
        return { caiu: true, motivo: 'Sessão Expirada / Queda de Acesso' };
      }
      return { caiu: true, motivo: 'Instabilidade do Sistema' };
    }

    // 5. Frases literais tradicionais
    if (t.includes('Todas as licenças estão em uso') || t.includes('Todas as licencas estao em uso')) {
      return { caiu: true, motivo: 'Falta de Licenças Disponíveis' };
    }

    if (t.includes('Sua sessão expirou') || t.includes('Sua sessao expirou')) {
      return { caiu: true, motivo: 'Sessão Expirada' };
    }

    // 6. Rota de logout com sessionInvalid=true ou logoutMessage
    if (u.includes('/logout/logout.do') && (u.includes('sessionInvalid=true') || u.includes('logoutMessage'))) {
      return { caiu: true, motivo: 'Sessão Expirada / Queda de Acesso' };
    }

    // 7. Status HTTP 500, 502, 503 ou 504
    if (/\b(500|502|503|504)\b/.test(t)) {
      const hasErrorKeywords = /error|erro|gateway|service|server|servidor|unavailable|indispon|timeout|tempo/i.test(t);
      const isShortErrorPage = t.trim().length < 250;
      const isHttpHeader = /\bHTTP\b/i.test(t);
      if (hasErrorKeywords || isShortErrorPage || isHttpHeader) {
        return { caiu: true, motivo: 'Instabilidade de Servidor / Rede' };
      }
    }

    return { caiu: false, motivo: null };
  }

  /**
   * Detecta se a aplicação retornou ao ar normalmente.
   * @param {string} url - URL atual
   * @param {object|string} dom - Objeto DOM com querySelector ou string
   * @returns {boolean}
   */
  function detectarRestabelecimento(url, dom) {
    const u = String(url || '');
    if (!u.includes('application.do')) return false;
    if (u.includes('logout.do') || u.includes('sessionInvalid=true')) return false;

    // Se o DOM contiver QUALQUER elemento de erro ou logout do Assyst, NUNCA está restabelecido!
    if (dom && typeof dom.querySelector === 'function') {
      const errBox = (typeof dom.getElementById === 'function' ? dom.getElementById('errorbox') : null) || dom.querySelector('#errorbox');
      const errList = (typeof dom.getElementById === 'function' ? dom.getElementById('errorlist') : null) || dom.querySelector('#errorlist') || dom.querySelector('.axios-logout-error');
      const logoutLink = (typeof dom.getElementById === 'function' ? dom.getElementById('logoutMessage') : null) || dom.querySelector('#logoutMessage');
      const validationErr = dom.querySelector('a[name="validationerror"]') || dom.querySelector('[name="validationerror"]');

      if (errBox || errList || logoutLink || validationErr) {
        return false;
      }
    }

    // Extrair texto do DOM para verificar mensagens residuais de erro
    let text = '';
    if (typeof dom === 'string') {
      text = dom;
    } else if (dom && typeof dom === 'object') {
      if (dom.body && typeof dom.body.innerText === 'string') {
        text = dom.body.innerText;
      } else if (typeof dom.innerText === 'string') {
        text = dom.innerText;
      } else if (typeof dom.textContent === 'string') {
        text = dom.textContent;
      }
    }

    const textLower = text.toLowerCase();
    if (textLower.includes('sua sessão expirou') || textLower.includes('sua sessao expirou') ||
        textLower.includes('licenças estão em uso') || textLower.includes('licencas estao em uso') ||
        textLower.includes('você saiu do aplicativo') || textLower.includes('voce saiu do aplicativo') ||
        textLower.includes('voltar à página principal do assyst') || textLower.includes('voltar a pagina principal do assyst')) {
      return false;
    }

    if (/\b(500|502|503|504)\b/.test(text) && /error|erro|gateway|service|unavailable/i.test(text)) {
      return false;
    }

    // Verificar presença de elementos autenticados do Assyst
    if (dom && typeof dom.querySelector === 'function') {
      const authEl = dom.querySelector('#contentPaneTitle') ||
                     dom.querySelector('.dojoxGridMasterView') ||
                     dom.querySelector('.dijitTab') ||
                     dom.querySelector('#banner_user_info') ||
                     dom.querySelector('.assyst-main-view');
      return Boolean(authEl);
    }

    if (typeof dom === 'string') {
      return dom.includes('contentPaneTitle') ||
             dom.includes('dojoxGridMasterView') ||
             dom.includes('dijitTab') ||
             dom.includes('banner_user_info');
    }

    return false;
  }

  /**
   * Formata duração em milissegundos para objeto legível e texto por extenso.
   * Ex: 1103000 ms -> { formatada: "18m 23s", minutos: 18, segundos: 23, textoExtenso: "18 minutos e 23 segundos" }
   * @param {number} duracaoMs
   * @returns {{ formatada: string, minutos: number, segundos: number, textoExtenso: string }}
   */
  function formatarDuracao(duracaoMs) {
    const totalSegundos = Math.max(0, Math.floor((Number(duracaoMs) || 0) / 1000));
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;
    const totalMinutos = Math.floor(totalSegundos / 60);

    let formatada = '';
    if (horas > 0) {
      formatada = `${horas}h ${minutos}m ${segundos}s`;
    } else {
      formatada = `${minutos}m ${segundos}s`;
    }

    const partes = [];
    if (horas > 0) {
      partes.push(`${horas} ${horas === 1 ? 'hora' : 'horas'}`);
    }
    if (minutos > 0) {
      partes.push(`${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`);
    }
    if (segundos > 0 || partes.length === 0) {
      partes.push(`${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}`);
    }

    let textoExtenso = '';
    if (partes.length === 1) {
      textoExtenso = partes[0];
    } else if (partes.length === 2) {
      textoExtenso = `${partes[0]} e ${partes[1]}`;
    } else if (partes.length === 3) {
      textoExtenso = `${partes[0]}, ${partes[1]} e ${partes[2]}`;
    }

    return {
      formatada,
      minutos,
      segundos,
      textoExtenso,
      horas,
      totalMinutos,
      duracaoFormatada: formatada,
      duracaoMinutos: totalMinutos
    };
  }

  /**
   * Gera o texto formal de comprovante individual de queda para SLA.
   * @param {object} inc - Dados do incidente
   * @returns {string}
   */
  function gerarTextoComprovante(inc) {
    if (!inc) return '';
    const dataStr = inc.dataStr || (inc.inicio ? formatarDataBR(new Date(inc.inicio)) : '');
    const horaInicio = inc.horaInicio || (inc.inicio ? formatarHoraBR(new Date(inc.inicio)) : '');
    const horaFim = inc.horaFim || (inc.fim ? formatarHoraBR(new Date(inc.fim)) : '');
    const motivo = inc.motivo || 'Instabilidade do Sistema';

    let duracaoTexto = inc.duracaoTexto;
    if (!duracaoTexto) {
      if (inc.duracaoMs != null) {
        duracaoTexto = formatarDuracao(inc.duracaoMs).textoExtenso;
      } else if (inc.duracao) {
        duracaoTexto = inc.duracao;
      } else {
        duracaoTexto = 'Indeterminada';
      }
    }

    return [
      '⚠️ COMPROVANTE DE INSTABILIDADE DO SISTEMA (ASSYST)',
      `📅 Data: ${dataStr}`,
      `⏱️ Início da Queda: ${horaInicio}`,
      `🔄 Restabelecimento: ${horaFim}`,
      `⏳ Duração da Indisponibilidade: ${duracaoTexto}`,
      `📌 Diagnóstico: ${motivo}`,
      '🏢 Equipe: 2N CATI Remoto — TJCE',
      'ℹ️ Registro autenticado pelo Assistente 2N CATI Remoto'
    ].join('\n');
  }

  /**
   * Gera relatório consolidado diário para a supervisão e gestão.
   * @param {Array<object>} historico - Array de incidentes
   * @param {string|Date} dataRef - Data de referência (DD/MM/AAAA ou Date)
   * @returns {string}
   */
  function gerarRelatorioConsolidado(historico, dataRef) {
    let targetData = '';
    if (dataRef instanceof Date) {
      targetData = formatarDataBR(dataRef);
    } else if (typeof dataRef === 'string') {
      targetData = dataRef.trim();
    } else if (!dataRef) {
      targetData = formatarDataBR(new Date());
    } else {
      targetData = String(dataRef);
    }

    const list = Array.isArray(historico) ? historico : [];
    const quedasDoDia = list.filter((item) => {
      if (!item) return false;
      if (item.dataStr) return item.dataStr === targetData;
      if (item.inicio) {
        return formatarDataBR(new Date(item.inicio)) === targetData;
      }
      return false;
    });

    // Ordenação cronológica por início crescente
    quedasDoDia.sort((a, b) => (Number(a.inicio) || 0) - (Number(b.inicio) || 0));

    const linhas = [
      '📊 RELATÓRIO DE INSTABILIDADE DO ASSYST — TJCE',
      `📅 Data: ${targetData}`,
      '🏢 Equipe: 2N CATI Remoto',
      '--------------------------------------------------'
    ];

    let totalMs = 0;
    if (quedasDoDia.length === 0) {
      linhas.push('(Nenhuma indisponibilidade registrada nesta data)');
    } else {
      quedasDoDia.forEach((q, idx) => {
        const horaIni = q.horaInicio || (q.inicio ? formatarHoraBR(new Date(q.inicio)) : '--:--:--');
        const horaFim = q.horaFim || (q.fim ? formatarHoraBR(new Date(q.fim)) : '--:--:--');
        const dMs = q.duracaoMs != null ? Number(q.duracaoMs) : ((q.fim && q.inicio) ? (q.fim - q.inicio) : 0);
        totalMs += Math.max(0, dMs);
        const durStr = q.duracao || q.duracaoFormatada || formatarDuracao(dMs).formatada;
        const motivo = q.motivo || 'Instabilidade do Sistema';
        linhas.push(`• Queda ${idx + 1}: ${horaIni} às ${horaFim} (${durStr}) — ${motivo}`);
      });
    }

    linhas.push('--------------------------------------------------');
    const durTotal = formatarDuracao(totalMs);
    const totalTexto = totalMs > 0 ? durTotal.textoExtenso : '0 segundos';
    linhas.push(`⏱️ Tempo Total de Indisponibilidade: ${totalTexto}`);
    linhas.push(`🔢 Total de Ocorrências: ${quedasDoDia.length} ${quedasDoDia.length === 1 ? 'queda' : 'quedas'}`);
    linhas.push('ℹ️ Dados catalogados automaticamente pelo Assistente 2N CATI Remoto');

    return linhas.join('\n');
  }

  /**
   * Helper assíncrono para ler do chrome.storage ou mock.
   */
  function storageGet(api, keys) {
    return new Promise((resolve, reject) => {
      const storage = api || (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
      if (!storage) return resolve({});
      try {
        const res = storage.get(keys, (data) => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          resolve(data || {});
        });
        if (res && typeof res.then === 'function') {
          res.then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Helper assíncrono para gravar no chrome.storage ou mock.
   */
  function storageSet(api, items) {
    return new Promise((resolve, reject) => {
      const storage = api || (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
      if (!storage) return resolve();
      try {
        const res = storage.set(items, () => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          resolve();
        });
        if (res && typeof res.then === 'function') {
          res.then(resolve).catch(reject);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Helper assíncrono para remover chaves do storage.
   */
  function storageRemove(api, keys) {
    return new Promise((resolve, reject) => {
      const storage = api || (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
      if (!storage) return resolve();
      if (typeof storage.remove === 'function') {
        try {
          const res = storage.remove(keys, () => {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
              return reject(chrome.runtime.lastError);
            }
            resolve();
          });
          if (res && typeof res.then === 'function') {
            res.then(resolve).catch(reject);
          }
        } catch (err) {
          reject(err);
        }
      } else {
        // Fallback: seta chave como undefined/null
        const clearObj = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(k => { clearObj[k] = null; });
        storageSet(api, clearObj).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Inicia o incidente ativo no storage se não houver um em andamento.
   * Se já houver um incidente com status 'ativo', retorna-o sem alterar o timestamp inicial.
   * @param {string} motivo
   * @param {Date|number} agora
   * @param {object} storageApi
   * @returns {Promise<object>}
   */
  async function iniciarIncidenteStorage(motivo, agora, storageApi) {
    const data = await storageGet(storageApi, ['cati_downtime_active']);
    if (data && data.cati_downtime_active && data.cati_downtime_active.status === 'ativo') {
      const ativo = data.cati_downtime_active;
      if (motivo && motivo !== ativo.motivo && motivo !== 'Instabilidade do Sistema') {
        ativo.motivo = motivo;
        await storageSet(storageApi, { cati_downtime_active: ativo });
      }
      return ativo;
    }

    const dateObj = agora instanceof Date ? agora : (agora ? new Date(agora) : new Date());
    const id = 'down_' + dateObj.getTime();
    const novo = {
      id: id,
      inicio: dateObj.getTime(),
      dataStr: formatarDataBR(dateObj),
      horaInicio: formatarHoraBR(dateObj),
      motivo: motivo || 'Instabilidade do Sistema',
      status: 'ativo'
    };

    await storageSet(storageApi, { cati_downtime_active: novo });
    return novo;
  }

  /**
   * Finaliza o incidente ativo no storage, calcula durações, atualiza o histórico (FIFO max 30)
   * e limpa o incidente ativo.
   * @param {Date|number} agora
   * @param {object} storageApi
   * @returns {Promise<object|null>}
   */
  async function finalizarIncidenteStorage(agora, storageApi) {
    const data = await storageGet(storageApi, ['cati_downtime_active', 'cati_downtime_history']);
    const ativo = data ? data.cati_downtime_active : null;
    if (!ativo || ativo.status !== 'ativo') {
      return null;
    }

    const dateObj = agora instanceof Date ? agora : (agora ? new Date(agora) : new Date());
    const fim = dateObj.getTime();
    const horaFim = formatarHoraBR(dateObj);
    const duracaoMs = Math.max(0, fim - (ativo.inicio || fim));
    const durFmt = formatarDuracao(duracaoMs);

    const finalizado = {
      ...ativo,
      fim: fim,
      horaFim: horaFim,
      duracaoMs: duracaoMs,
      duracao: durFmt.formatada,
      duracaoFormatada: durFmt.formatada,
      duracaoMinutos: durFmt.minutos,
      duracaoTexto: durFmt.textoExtenso,
      status: 'finalizado'
    };

    const currentHistory = Array.isArray(data.cati_downtime_history) ? data.cati_downtime_history : [];
    const updatedHistory = [finalizado, ...currentHistory].slice(0, 30);

    await storageRemove(storageApi, 'cati_downtime_active');
    await storageSet(storageApi, {
      cati_downtime_active: null,
      cati_downtime_history: updatedHistory
    });

    return finalizado;
  }

  /**
   * Calcula o cronômetro ao vivo no formato HH:MM:SS.
   * @param {number|Date} inicioTimestamp
   * @param {number|Date} [agoraTimestamp]
   * @returns {string} Formato HH:MM:SS (ex: "00:04:32")
   */
  function atualizarCronometroAoVivo(inicioTimestamp, agoraTimestamp) {
    const inicio = Number(inicioTimestamp) || 0;
    const agora = agoraTimestamp != null ? Number(agoraTimestamp) : Date.now();
    const deltaSeg = Math.max(0, Math.floor((agora - inicio) / 1000));
    const h = String(Math.floor(deltaSeg / 3600)).padStart(2, '0');
    const m = String(Math.floor((deltaSeg % 3600) / 60)).padStart(2, '0');
    const s = String(deltaSeg % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  let activeChronoInterval = null;

  /**
   * Renderiza o banner fixo no topo indicando que o Assyst está fora do ar.
   * Se o banner já existir, apenas atualiza seus valores para evitar duplicatas.
   * @param {object} incidente
   * @param {Document} [doc]
   * @returns {HTMLElement|null}
   */
  function renderizarBannerQuedaAtiva(incidente, doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.body) return null;

    const inc = incidente || {};
    const motivo = inc.motivo || 'Instabilidade do Sistema';
    const horaInicio = inc.horaInicio || (inc.inicio ? formatarHoraBR(new Date(inc.inicio)) : '--:--:--');

    let banner = d.getElementById('cati-downtime-banner');
    if (!banner) {
      banner = d.createElement('div');
      banner.id = 'cati-downtime-banner';
      banner.className = 'cati-downtime-banner';

      const header = d.createElement('div');
      header.className = 'cati-downtime-header';

      const titulo = d.createElement('span');
      titulo.className = 'cati-downtime-titulo';
      titulo.innerText = '⚠️ Assyst Fora do Ar • Queda de Acesso';

      const tag = d.createElement('span');
      tag.className = 'cati-downtime-motivo-tag';
      tag.innerText = motivo;

      header.appendChild(titulo);
      header.appendChild(tag);
      banner.appendChild(header);

      const timerBox = d.createElement('div');
      timerBox.className = 'cati-downtime-timer-box';
      timerBox.innerText = '⏳ Fora do ar há: ';

      const chrono = d.createElement('span');
      chrono.id = 'cati-downtime-chrono';
      chrono.className = 'cati-downtime-chrono';
      chrono.innerText = atualizarCronometroAoVivo(inc.inicio, Date.now());

      timerBox.appendChild(chrono);
      banner.appendChild(timerBox);

      const aviso = d.createElement('div');
      aviso.className = 'cati-downtime-aviso';
      aviso.innerText = `Início registrado às ${horaInicio}. O assistente está cronometrando. Atualize (F5) ou tente logar periodicamente.`;
      banner.appendChild(aviso);

      d.body.appendChild(banner);
    } else {
      const tag = banner.querySelector('.cati-downtime-motivo-tag');
      if (tag) tag.innerText = motivo;

      const chrono = banner.querySelector('#cati-downtime-chrono');
      if (chrono) chrono.innerText = atualizarCronometroAoVivo(inc.inicio, Date.now());

      const aviso = banner.querySelector('.cati-downtime-aviso');
      if (aviso) {
        aviso.innerText = `Início registrado às ${horaInicio}. O assistente está cronometrando. Atualize (F5) ou tente logar periodicamente.`;
      }
    }

    if (typeof setInterval === 'function' && !activeChronoInterval) {
      activeChronoInterval = setInterval(() => {
        const chrono = d.getElementById('cati-downtime-chrono');
        if (chrono && inc.inicio) {
          chrono.innerText = atualizarCronometroAoVivo(inc.inicio, Date.now());
        } else if (!chrono && activeChronoInterval) {
          clearInterval(activeChronoInterval);
          activeChronoInterval = null;
        }
      }, 1000);
      if (activeChronoInterval && typeof activeChronoInterval.unref === 'function') {
        activeChronoInterval.unref();
      }
    }

    return banner;
  }

  /**
   * Remove o banner de queda do DOM e limpa o temporizador se ativo.
   * @param {Document} [doc]
   * @returns {boolean} Retorna true se removeu, false se não existia
   */
  function removerBannerQueda(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return false;

    if (activeChronoInterval) {
      clearInterval(activeChronoInterval);
      activeChronoInterval = null;
    }

    const banner = d.getElementById('cati-downtime-banner');
    if (banner) {
      if (typeof banner.remove === 'function') {
        banner.remove();
      } else if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
      return true;
    }
    return false;
  }

  /**
   * Renderiza a janela/modal de restabelecimento pós-login com botão de 1 clique para SLA.
   * @param {object} incidenteFinalizado
   * @param {Document} [doc]
   * @param {Function} [onCopiar] Callback para testes ou interceptação de cópia
   * @returns {HTMLElement|null}
   */
  function renderizarModalRestabelecimento(incidenteFinalizado, doc, onCopiar) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.body) return null;

    const inc = incidenteFinalizado || {};
    const duracaoTexto = inc.duracaoTexto || (inc.duracaoMs ? formatarDuracao(inc.duracaoMs).textoExtenso : (inc.duracao || ''));
    const horaInicio = inc.horaInicio || (inc.inicio ? formatarHoraBR(new Date(inc.inicio)) : '--:--:--');
    const horaFim = inc.horaFim || (inc.fim ? formatarHoraBR(new Date(inc.fim)) : '--:--:--');

    const existente = d.getElementById('cati-downtime-modal-restabelecido');
    if (existente) {
      if (typeof existente.remove === 'function') existente.remove();
      else if (existente.parentNode) existente.parentNode.removeChild(existente);
    }

    const modal = d.createElement('div');
    modal.id = 'cati-downtime-modal-restabelecido';
    modal.className = 'cati-downtime-modal-restabelecido';

    const content = d.createElement('div');
    content.className = 'cati-downtime-modal-content';

    const title = d.createElement('div');
    title.className = 'cati-downtime-modal-title';
    title.innerText = '✅ Assyst Restabelecido!';
    content.appendChild(title);

    const duracao = d.createElement('div');
    duracao.className = 'cati-downtime-modal-duracao';
    duracao.innerText = `⏳ Duração total: ${duracaoTexto}`;
    content.appendChild(duracao);

    const detalhes = d.createElement('div');
    detalhes.className = 'cati-downtime-modal-detalhes';
    detalhes.innerText = `Período: ${horaInicio} às ${horaFim} • Diagnóstico: ${inc.motivo || 'Instabilidade do Sistema'}`;
    content.appendChild(detalhes);

    const actions = d.createElement('div');
    actions.className = 'cati-downtime-modal-actions';

    const btnCopiar = d.createElement('button');
    btnCopiar.id = 'cati-downtime-btn-copiar';
    btnCopiar.className = 'cati-downtime-btn-copiar';
    btnCopiar.innerText = '📋 Copiar Comprovante de SLA';

    btnCopiar.addEventListener('click', () => {
      const texto = gerarTextoComprovante(inc);
      if (typeof onCopiar === 'function') {
        onCopiar(texto);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(texto).catch(() => {});
      }
      btnCopiar.innerText = '✅ Comprovante Copiado!';
      if (typeof setTimeout === 'function') {
        setTimeout(() => {
          if (btnCopiar && btnCopiar.parentNode) {
            btnCopiar.innerText = '📋 Copiar Comprovante de SLA';
          }
        }, 3000);
      }
    });

    const btnFechar = d.createElement('button');
    btnFechar.id = 'cati-downtime-btn-fechar';
    btnFechar.className = 'cati-downtime-btn-fechar';
    btnFechar.innerText = 'Fechar';

    btnFechar.addEventListener('click', () => {
      if (typeof modal.remove === 'function') {
        modal.remove();
      } else if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    });

    actions.appendChild(btnCopiar);
    actions.appendChild(btnFechar);
    content.appendChild(actions);

    modal.appendChild(content);
    d.body.appendChild(modal);

    return modal;
  }

  /**
   * Ciclo principal de detecção e gerenciamento de interface no DOM e storage.
   * @param {Document} [doc]
   * @param {Window} [win]
   * @param {object} [storageApi]
   * @returns {Promise<{ status: string, inc?: object }>}
   */
  async function iniciarCicloDowntime(doc, win, storageApi) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const w = win || (typeof window !== 'undefined' ? window : null);
    if (!d || !w) return { status: 'indeterminado' };

    const url = (w.location && w.location.href) ? w.location.href : '';

    const queda = detectarQuedaAssyst(url, d);
    if (queda.caiu) {
      const inc = await iniciarIncidenteStorage(queda.motivo, new Date(), storageApi);
      renderizarBannerQuedaAtiva(inc, d);

      const logoutLink = (typeof d.getElementById === 'function' ? d.getElementById('logoutMessage') : null) || (d.querySelector ? d.querySelector('#logoutMessage') : null);
      if (logoutLink && !logoutLink.dataset?.catiObserved) {
        if (logoutLink.dataset) logoutLink.dataset.catiObserved = 'true';
        logoutLink.addEventListener('click', () => {
          [300, 1000, 2500, 5000].forEach(delay => {
            setTimeout(() => {
              iniciarCicloDowntime(d, w, storageApi);
            }, delay);
          });
        });
      }

      return { status: 'queda_ativa', inc };
    }

    const restabelecido = detectarRestabelecimento(url, d);
    if (restabelecido) {
      const incFinalizado = await finalizarIncidenteStorage(new Date(), storageApi);
      if (incFinalizado) {
        removerBannerQueda(d);
        renderizarModalRestabelecimento(incFinalizado, d);
        return { status: 'restabelecido', inc: incFinalizado };
      }
      removerBannerQueda(d);
      return { status: 'normal' };
    }

    return { status: 'indeterminado' };
  }

  let downtimeObserver = null;
  let downtimePollInterval = null;

  /**
   * Inicializa o monitoramento contínuo via MutationObserver, listeners e polling.
   * @param {Document} [doc]
   * @param {Window} [win]
   * @param {object} [storageApi]
   */
  function iniciarMonitoramentoContinuo(doc, win, storageApi) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const w = win || (typeof window !== 'undefined' ? window : null);
    if (!d || !w) return;

    iniciarCicloDowntime(d, w, storageApi);

    // 1. Observer para reagir a alterações assíncronas do DOM (Dojo/Ajax)
    if (typeof MutationObserver !== 'undefined' && d.body && !downtimeObserver) {
      let debounceTimer = null;
      try {
        downtimeObserver = new MutationObserver(() => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            iniciarCicloDowntime(d, w, storageApi);
          }, 350);
        });
        downtimeObserver.observe(d.body, { childList: true, subtree: true, characterData: true });
      } catch (e) {
        // Ignora caso observe não seja suportado no mock de testes
      }
    }

    // 2. Polling leve regular (a cada 2 segundos)
    if (!downtimePollInterval && typeof setInterval !== 'undefined') {
      downtimePollInterval = setInterval(() => {
        iniciarCicloDowntime(d, w, storageApi);
      }, 2000);
      if (downtimePollInterval && typeof downtimePollInterval.unref === 'function') {
        downtimePollInterval.unref();
      }
    }

    // 3. Ouvintes de navegação SPA / hashchange
    if (w.addEventListener) {
      w.addEventListener('hashchange', () => iniciarCicloDowntime(d, w, storageApi));
      w.addEventListener('popstate', () => iniciarCicloDowntime(d, w, storageApi));
    }
  }

  return {
    ENGINE_VERSION,
    formatarDataBR,
    formatarHoraBR,
    detectarQuedaAssyst,
    detectarRestabelecimento,
    formatarDuracao,
    gerarTextoComprovante,
    gerarRelatorioConsolidado,
    iniciarIncidenteStorage,
    finalizarIncidenteStorage,
    atualizarCronometroAoVivo,
    renderizarBannerQuedaAtiva,
    removerBannerQueda,
    renderizarModalRestabelecimento,
    iniciarCicloDowntime,
    iniciarMonitoramentoContinuo
  };
})();

if (typeof window !== 'undefined') {
  window.__catiDowntimeEngine = CatiDowntimeEngine;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        CatiDowntimeEngine.iniciarMonitoramentoContinuo(document, window);
      });
    } else {
      CatiDowntimeEngine.iniciarMonitoramentoContinuo(document, window);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CatiDowntimeEngine;
}

