/*
 * Motor de Auditoria e Cálculo de SLA — Assistente 2N CATI Remoto
 * Suporte a:
 *  - Horário Comercial (08:00 às 18:00 ou configurável, com pausas noturnas, finais de semana e feriados TJCE)
 *  - Operação 24/7 (contagem contínua ininterrupta)
 *  - Atendimento Programado com extração de data e auto-reativação
 *  - Despausa automática por retorno de 3N e respostas no portal do usuário
 */
'use strict';

const CatiSlaEngine = (() => {
  const ENGINE_VERSION = '2.0.0';

  function normalize(s) {
    if (s == null) return '';
    return String(s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function parseDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    const m = String(raw).trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})[ \u00a0]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const sec = m[6] ? Number(m[6]) : 0;
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), sec, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  function parseHM(raw) {
    if (!raw) return null;
    const m = String(raw).trim().match(/^(\d{1,4}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function fmtHM(totalMinutes) {
    if (totalMinutes == null || isNaN(totalMinutes)) return '—';
    const neg = totalMinutes < 0;
    const t = Math.abs(Math.round(totalMinutes));
    return (neg ? '-' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }

  function fmtDateBR(d) {
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' +
           d.getFullYear();
  }

  function fmtTimeBR(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function fmtDateTimeBR(d) {
    return fmtDateBR(d) + ' ' + fmtTimeBR(d);
  }

  function isoDay(d) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function matchQueue(deptName, queues) {
    const dept = normalize(deptName);
    if (!dept) return null;
    for (const q of queues || []) {
      if (!q.name || q.name.includes('*')) continue;
      if (normalize(q.name) === dept) return { queue: q, byWildcard: false };
    }
    for (const q of queues || []) {
      if (!q.name || !q.name.includes('*')) continue;
      const prefix = normalize(q.name.split('*')[0]);
      if (prefix && dept.startsWith(prefix)) return { queue: q, byWildcard: true };
    }
    return null;
  }

  function classifyAction(typeName, actionTypes) {
    const t = normalize(typeName);
    if (!t) return 'neutral';
    for (const at of actionTypes || []) {
      if (normalize(at.name) === t) return at.effect || 'neutral';
    }
    return 'neutral';
  }

  function matchTime(s) {
    const m = String(s).match(/(\d{1,2})\s*(?:h\s*:?\s*(\d{1,2})\s*m?|:\s*(\d{1,2})\s*h?|h)/i);
    if (!m) return null;
    const h = +m[1];
    const mi = m[2] != null ? +m[2] : (m[3] != null ? +m[3] : 0);
    if (h > 23 || mi > 59) return null;
    return { h, m: mi, raw: m[0] };
  }

  function parseScheduleText(text, refDate) {
    const t = String(text || '').replace(/\u00a0/g, ' ');
    const dm = t.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
    if (!dm) return { date: null, reason: 'ilegivel', textDate: null };
    const day = +dm[1], mon = +dm[2];
    const year = dm[3] != null ? (+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]) : null;
    if (day < 1 || day > 31 || mon < 1 || mon > 12) return { date: null, reason: 'ilegivel', textDate: dm[0] };
    const after = t.slice(dm.index + dm[0].length);
    const hm = matchTime(after) || null;
    const hh = hm ? hm.h : 0, min = hm ? hm.m : 0;
    const textDate = dm[0].replace(/\s+/g, '') + (hm ? ' ' + hm.raw.trim() : '');
    const mk = (y, mo) => new Date(y, mo - 1, day, hh, min, 0, 0);

    const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
    const baseYear = refDate ? refDate.getFullYear() : new Date().getFullYear();
    const cand = mk(year != null ? year : baseYear, mon);
    if (cand.getDate() !== day || cand.getMonth() !== mon - 1) return { date: null, reason: 'ilegivel', textDate };

    if (!refDate || cand > refDate) {
      return { date: cand, reason: refDate && (cand - refDate) > WINDOW_MS ? 'distante' : null, textDate };
    }

    if (year == null && refDate) {
      const candNext = mk(refDate.getFullYear() + 1, mon);
      if (candNext.getDate() === day && candNext > refDate && (candNext - refDate) <= WINDOW_MS) {
        return { date: candNext, reason: 'ano', textDate };
      }
    }

    return { date: null, reason: 'inconsistente', textDate };
  }

  function windowsFor(queue, date, holidaySet) {
    const dow = date.getDay();
    const isWeekendOrHoliday = dow === 0 || dow === 6 || (holidaySet && holidaySet.has(isoDay(date)));
    const wins = isWeekendOrHoliday ? (queue.weekend || []) : (queue.week || []);
    return wins.filter(w => w && w.start && w.end);
  }

  function minutesOfDay(hhmm) {
    const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Math.min(Number(m[1]) * 60 + Number(m[2]), 23 * 60 + 59);
  }

  function nextWindowStart(queue, from, holidaySet) {
    if (!queue) return null;
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    for (let d = 0; d < 60; d++) {
      for (const w of windowsFor(queue, cursor, holidaySet)) {
        const ws = minutesOfDay(w.start), we = minutesOfDay(w.end);
        if (ws == null || we == null || we <= ws) continue;
        const winStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), Math.floor(ws / 60), ws % 60);
        const winEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), Math.floor(we / 60), we % 60);
        if (winEnd > from) return winStart > from ? winStart : from;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return null;
  }

  function clipSegment(seg, holidaySet, calQueue) {
    const rows = [];
    const calendar = calQueue || seg.queue;
    if (!calendar || !(seg.end > seg.start)) return rows;
    const cursor = new Date(seg.start.getFullYear(), seg.start.getMonth(), seg.start.getDate());
    const lastDay = new Date(seg.end.getFullYear(), seg.end.getMonth(), seg.end.getDate());
    while (cursor <= lastDay) {
      const wins = windowsFor(calendar, cursor, holidaySet);
      for (const w of wins) {
        const ws = minutesOfDay(w.start);
        const we = minutesOfDay(w.end);
        if (ws == null || we == null || we <= ws) continue;
        const winStart = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), Math.floor(ws / 60), ws % 60);
        const winEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), Math.floor(we / 60), we % 60);
        const effStart = seg.start > winStart ? seg.start : winStart;
        const effEnd = seg.end < winEnd ? seg.end : winEnd;
        if (effEnd > effStart) {
          const minutes = Math.round((effEnd - effStart) / 60000);
          if (minutes > 0) {
            rows.push({
              dateISO: isoDay(cursor),
              dateBR: fmtDateBR(cursor),
              startHM: fmtTimeBR(effStart),
              endHM: fmtTimeBR(effEnd),
              minutes,
              queueName: seg.deptRaw
            });
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }

  // Cálculo astronômico do Domingo de Páscoa (Algoritmo de Meeus/Jones/Butcher)
  function calcularDomingoPascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }

  // Gera feriados oficiais do TJCE / Ceará para qualquer ano civil
  function gerarFeriadosTJCE(ano) {
    const pascoa = calcularDomingoPascoa(ano);
    const offset = (d, dias) => {
      const r = new Date(d);
      r.setDate(r.getDate() + dias);
      return isoDay(r);
    };

    return [
      `${ano}-01-01`, // Confraternização Universal
      offset(pascoa, -48), // Segunda de Carnaval
      offset(pascoa, -47), // Terça de Carnaval
      offset(pascoa, -46), // Quarta de Cinzas
      `${ano}-03-19`, // São José (Padroeiro CE)
      `${ano}-03-25`, // Data Magna do Ceará
      offset(pascoa, -2),  // Sexta-feira Santa
      `${ano}-04-21`, // Tiradentes
      `${ano}-05-01`, // Dia do Trabalho
      offset(pascoa, 60),  // Corpus Christi
      `${ano}-08-15`, // N. Sra. da Assunção
      `${ano}-09-07`, // Independência do Brasil
      `${ano}-10-12`, // N. Sra. Aparecida
      `${ano}-10-28`, // Dia do Servidor Público
      `${ano}-11-02`, // Finados
      `${ano}-11-15`, // Proclamação da República
      `${ano}-11-20`, // Consciência Negra
      `${ano}-12-08`, // Dia da Justiça
      `${ano}-12-25`  // Natal
    ];
  }

  // Feriados Oficiais TJCE / CE pré-computados para múltiplos anos (2025 a 2030)
  const DEFAULT_HOLIDAYS = [2025, 2026, 2027, 2028, 2029, 2030]
    .flatMap(ano => gerarFeriadosTJCE(ano));

  const DEFAULT_ACTION_TYPES = [
    { id: 'a-atrib',       name: 'Atribuição Interna',            effect: 'assign' },
    { id: 'a-email',       name: 'Email Recebido do Usuário',     effect: 'start' },
    { id: 'a-info',        name: 'Info Recebidas do Usuário',     effect: 'start' },
    { id: 'a-resforn',     name: 'Resolvido pelo Fornecedor',     effect: 'start' },
    { id: 'a-inforecforn', name: 'Info Recebida do Fornecedor',  effect: 'start' },
    { id: 'a-iniciar',     name: 'Iniciar Relógio',               effect: 'start' },
    { id: 'a-fornreq',     name: 'Fornecedor Requer informação',  effect: 'start' },
    { id: 'a-urgencia',    name: 'Solicitação de Urgência',       effect: 'neutral' },
    { id: 'a-atinic',      name: 'Atendimento Iniciado',          effect: 'start' },
    { id: 'a-reabrir',     name: 'Reabrir',                       effect: 'reopen' },
    { id: 'a-atprog',      name: 'Atendimento Programado',        effect: 'schedule' },
    { id: 'a-atribforn',   name: 'Atribuir ao Fornecedor',        effect: 'pause' },
    { id: 'a-aginfoforn',  name: 'Aguardando Info do Fornecedor', effect: 'pause' },
    { id: 'a-aginfousu',   name: 'Aguardando Info do Usuário',    effect: 'pause' },
    { id: 'a-parar',       name: 'Parar Relógio',                 effect: 'pause' },
    { id: 'a-resolvido',   name: 'Resolvido',                     effect: 'resolve' },
    { id: 'a-fechamento',  name: 'Fechamento',                    effect: 'resolve' }
  ];

  function gerarFilasPadrao(config) {
    const is24_7 = config && config.slaCalculationMode === 'calendar';
    const hStart = (config && config.slaWorkStart) || '08:00';
    const hEnd = (config && config.slaWorkEnd) || '18:00';
    const targetHours = Number(config && config.slaTargetHours) || 1;
    const targetMin = Math.round(targetHours * 60);

    const W = (s, e) => [{ start: s, end: e }];
    const FULL = W('00:00', '23:59');

    // Fila 2N CATI Remoto: parametrizada pelo modo ativo do analista
    const remotoWeek = is24_7 ? FULL : W(hStart, hEnd);
    const remotoWeekend = is24_7 ? FULL : [];

    return [
      { id: 'q-remoto',    name: '2N CATI Remoto', active: true, slaMin: targetMin, week: remotoWeek, weekend: remotoWeekend },
      { id: 'q-fcb',       name: '2N CATI FCB', active: true, slaMin: 180, week: W('08:00', '21:00'), weekend: W('08:00', '18:00') },
      { id: 'q-tj',        name: '2N CATI TJ', active: true, slaMin: 180, week: W('08:00', '21:00'), weekend: W('08:00', '18:00') },
      { id: 'q-capitais',  name: '2N CATI Demais Capital', active: true, slaMin: 360, week: W('08:00', '18:00'), weekend: [] },
      { id: 'q-juizado',   name: '2N CATI Juizado da Mulher', active: true, slaMin: 180, week: W('07:30', '17:30'), weekend: [] },
      { id: 'q-polo',      name: '2N CATI Polo*', active: true, slaMin: 720, week: W('07:30', '17:30'), weekend: [] },
      { id: 'q-custodia',  name: '2N CATI Vara de Custódia', active: true, slaMin: 120, week: W('07:30', '17:30'), weekend: W('07:30', '14:00') },
      { id: 'q-1n',        name: '1N CATI', active: true, slaMin: 15, week: FULL, weekend: FULL },
      { id: 'q-sistemas',  name: '2N CATI Sistemas', active: true, slaMin: 120, week: FULL, weekend: FULL },
      { id: 'q-sig',       name: '2N CATI Sala de Imagem - Galpão BR', active: true, slaMin: 480, week: W('08:00', '20:00'), weekend: [] },
      { id: 'q-sif',       name: '2N CATI Sala de Imagem - FCB', active: true, slaMin: 480, week: W('08:00', '20:00'), weekend: [] }
    ];
  }

  function computeAudit(input, cfg) {
    const config = cfg || {};
    const is24_7 = config.slaCalculationMode === 'calendar';
    const queues = config.queues || gerarFilasPadrao(config);
    const actionTypes = config.actionTypes || DEFAULT_ACTION_TYPES;
    // No modo 24/7, feriados não pausam a contagem
    const holidaySet = is24_7 ? new Set() : new Set(config.holidays || DEFAULT_HOLIDAYS);

    const unpauseFrom = Array.isArray(config.unpauseFrom) ? config.unpauseFrom : ['3N TJ*', 'Div. de Patrimônio TJ'];
    const isHandoffQueue = (dept) => {
      const nd = normalize(dept);
      if (!nd) return false;
      return (unpauseFrom || []).some(p => {
        const raw = String(p || '');
        if (!raw.trim()) return false;
        if (raw.includes('*')) {
          const pref = normalize(raw.split('*')[0]);
          return !!pref && nd.startsWith(pref);
        }
        return normalize(raw) === nd;
      });
    };

    const userPortalIds = Array.isArray(config.userPortalIds) ? config.userPortalIds : ['Zz Assystnet Users', 'assystNet User'];
    const isPortalEv = (evt) => {
      if (!userPortalIds || !userPortalIds.length) return false;
      const na = normalize(evt.actingDept), nu = normalize(evt.actor);
      if (!na && !nu) return false;
      return userPortalIds.some(p => {
        const raw = String(p || '');
        if (!raw.trim()) return false;
        if (raw.includes('*')) {
          const pref = normalize(raw.split('*')[0]);
          return !!pref && ((!!na && na.startsWith(pref)) || (!!nu && nu.startsWith(pref)));
        }
        const n = normalize(raw);
        return n === na || n === nu;
      });
    };

    const problems = [];
    const events = (input.events || [])
      .map(ev => ({ ...ev, _date: parseDate(ev.dateRaw || ev.date || ev.dataObj), _aid: Number(ev.actionId) || 0 }))
      .filter(ev => {
        if (!ev._date) {
          if (ev.type) problems.push('Data ilegível no log: "' + (ev.dateRaw || '') + '" (' + ev.type + ')');
          return false;
        }
        return true;
      })
      .sort((a, b) => (a._date - b._date) || (a._aid - b._aid));

    events.forEach((ev, i) => { ev._i = i; });

    const state = {
      deptRaw: null,
      match: null,
      inActive: false,
      pausedByAction: false,
      pauseFromSchedule: false,
      scheduledAt: null,
      resolved: false,
      resolvingDept: null,
      resolvedAtDate: null,
      open: null
    };

    const rawSegments = [];
    const timeline = [];
    let reopenCount = 0;

    const openSeg = (when, cont) => {
      if (!state.open && state.inActive && !state.pausedByAction && !state.resolved) {
        state.open = { deptRaw: state.deptRaw, queue: state.match.queue, start: when, cont: !!cont };
        state.scheduledAt = null;
        state.pauseFromSchedule = false;
      }
    };

    const closeSeg = (when) => {
      if (state.open) {
        if (when > state.open.start) {
          rawSegments.push({
            deptRaw: state.open.deptRaw,
            queue: state.open.queue,
            start: state.open.start,
            end: when,
            cont: !!state.open.cont
          });
        }
        state.open = null;
      }
    };

    const materializeSchedule = (when) => {
      if (!state.scheduledAt || state.resolved || when < state.scheduledAt) return;
      const at = state.scheduledAt;
      state.scheduledAt = null;
      if (state.inActive && !state.open) {
        state.pausedByAction = false;
        state.pauseFromSchedule = false;
        state.open = { deptRaw: state.deptRaw, queue: state.match.queue, start: at };
        timeline.push({
          text: fmtDateTimeBR(at) + ' — (automático) → relógio reativado no horário programado',
          bold: true,
          clock: 'on',
          when: at.getTime(),
          note: 'relógio reativado no horário programado'
        });
      }
    };

    for (const ev of events) {
      const when = ev._date;
      materializeSchedule(when);

      let effect = classifyAction(ev.type, actionTypes);
      const isUrgencia = normalize(ev.type).includes('urgencia');
      const viaPortal = effect === 'neutral' && isPortalEv(ev) && !isUrgencia;
      if (viaPortal) effect = 'start';

      if (state.resolved && effect !== 'reopen') continue;

      if (effect === 'assign') {
        const newDept = (ev.assignedDept || '').trim();
        if (!newDept) continue;
        if (state.deptRaw != null && normalize(newDept) === normalize(state.deptRaw)) continue;

        const prevDept = state.deptRaw;
        const wasRunning = !!state.open;
        closeSeg(when);

        const match = matchQueue(newDept, queues);
        state.deptRaw = newDept;
        state.match = match;
        state.inActive = !!(match && match.queue.active);

        if (state.inActive) {
          const fromHandoff = !wasRunning && !!prevDept && isHandoffQueue(prevDept);
          const handoffRelease = fromHandoff && state.pausedByAction && !state.pauseFromSchedule;
          if (handoffRelease) state.pausedByAction = false;

          openSeg(when, wasRunning);
          timeline.push({
            text: fmtDateTimeBR(when) + ' — Atribuição Interna → ' + newDept + ' (relógio ligado)',
            bold: true,
            clock: 'on',
            when: when.getTime()
          });
        } else {
          timeline.push({
            text: fmtDateTimeBR(when) + ' — Atribuição para fila fora do 2N → ' + newDept + ' (relógio pausado)',
            bold: wasRunning,
            clock: wasRunning ? 'off' : null,
            when: when.getTime()
          });
        }
      } else if (effect === 'pause') {
        closeSeg(when);
        state.pausedByAction = true;
        state.pauseFromSchedule = false;
        timeline.push({
          text: fmtDateTimeBR(when) + ' — ' + ev.type + ' → relógio pausado',
          bold: true,
          clock: 'off',
          when: when.getTime()
        });
      } else if (effect === 'start') {
        state.pausedByAction = false;
        openSeg(when);
        timeline.push({
          text: fmtDateTimeBR(when) + ' — ' + ev.type + ' → relógio retomado',
          bold: true,
          clock: 'on',
          when: when.getTime()
        });
      } else if (effect === 'schedule') {
        const parsed = parseScheduleText(ev.remarks || '', when);
        if (parsed.date) {
          closeSeg(when);
          state.pausedByAction = true;
          state.pauseFromSchedule = true;
          state.scheduledAt = parsed.date;
          timeline.push({
            text: fmtDateTimeBR(when) + ' — Atendimento Programado para ' + fmtDateTimeBR(parsed.date) + ' (relógio pausado até lá)',
            bold: true,
            clock: 'off',
            when: when.getTime()
          });
        } else {
          timeline.push({
            text: fmtDateTimeBR(when) + ' — Atendimento Programado sem data válida futura (relógio mantido)',
            bold: true,
            clock: state.open ? 'on' : 'off',
            when: when.getTime()
          });
        }
      } else if (effect === 'resolve') {
        closeSeg(when);
        state.resolved = true;
        state.resolvingDept = state.deptRaw;
        state.resolvedAtDate = when;
        state.scheduledAt = null;
        state.pauseFromSchedule = false;
        timeline.push({
          text: fmtDateTimeBR(when) + ' — ' + ev.type + ' → relógio encerrado',
          bold: true,
          clock: 'off',
          when: when.getTime()
        });
      } else if (effect === 'reopen') {
        if (state.resolved) { reopenCount++; state.resolved = false; }
        state.pausedByAction = false;
        openSeg(when);
        timeline.push({
          text: fmtDateTimeBR(when) + ' — Reaberto → relógio ligado',
          bold: true,
          clock: 'on',
          when: when.getTime()
        });
      }
    }

    const auditedAtDate = new Date(input.auditedAt || Date.now());
    let status = 'concluido';
    let clockStateNow = null;

    if (!state.resolved) {
      materializeSchedule(auditedAtDate);
      clockStateNow = state.open ? 'rodando' : (state.inActive ? 'pausado_acao' : 'fora_fila_ativa');
      closeSeg(auditedAtDate);
      status = 'em_andamento';
    }

    const dayRowsDetail = [];
    for (const seg of rawSegments) {
      const rows = clipSegment(seg, holidaySet, null);
      dayRowsDetail.push(...rows);
    }

    dayRowsDetail.sort((a, b) => (a.dateISO + 'T' + a.startHM).localeCompare(b.dateISO + 'T' + b.startHM));
    const totalMinutes = dayRowsDetail.reduce((s, r) => s + r.minutes, 0);

    const dayRows = [];
    let cur = null;
    for (const r of dayRowsDetail) {
      if (cur && cur.dateISO === r.dateISO && cur.endHM === r.startHM) {
        cur.endHM = r.endHM;
        cur.minutes += r.minutes;
      } else {
        if (cur) dayRows.push(cur);
        cur = Object.assign({}, r);
      }
    }
    if (cur) dayRows.push(cur);

    // Meta de SLA
    const ansName = (input.ansPanel && input.ansPanel.ansName) || '';
    const vip = !!(ansName && normalize(ansName).includes('vip'));

    const activeQueue = (state.resolvingDept ? matchQueue(state.resolvingDept, queues) : null) ||
                        (state.deptRaw ? matchQueue(state.deptRaw, queues) : null) ||
                        queues.find(q => q.id === 'q-remoto');

    let slaMinutes = activeQueue ? activeQueue.queue.slaMin : 60;
    if (vip) slaMinutes = Math.min(60, slaMinutes);

    const verdict = totalMinutes <= slaMinutes ? 'DENTRO' : 'ESTOURADO';

    let progress = null;
    if (status === 'em_andamento') {
      const remainingMinutes = slaMinutes - totalMinutes;
      progress = {
        clockState: clockStateNow,
        currentQueue: state.deptRaw || '2N CATI Remoto',
        slaMinutes,
        remainingMinutes,
        prevVerdict: remainingMinutes >= 0 ? 'DENTRO' : 'ESTOURADO',
        mode: is24_7 ? '24_7' : 'comercial'
      };
    }

    return {
      engineVersion: ENGINE_VERSION,
      ref: input.ref,
      status,
      mode: is24_7 ? '24_7' : 'comercial',
      vip,
      resolvingDept: state.resolvingDept || state.deptRaw,
      resolvedAt: state.resolvedAtDate ? fmtDateTimeBR(state.resolvedAtDate) : null,
      reopenCount,
      slaMinutes,
      totalMinutes,
      verdict,
      progress,
      dayRows,
      timeline,
      auditedAt: auditedAtDate.getTime()
    };
  }

  return {
    ENGINE_VERSION,
    normalize,
    parseDate,
    parseHM,
    fmtHM,
    fmtDateBR,
    fmtTimeBR,
    fmtDateTimeBR,
    isoDay,
    matchQueue,
    classifyAction,
    parseScheduleText,
    windowsFor,
    clipSegment,
    computeAudit,
    DEFAULT_HOLIDAYS,
    DEFAULT_ACTION_TYPES,
    gerarFilasPadrao,
    gerarFeriadosTJCE,
    calcularDomingoPascoa
  };
})();

if (typeof window !== 'undefined') {
  window.CatiSlaEngine = CatiSlaEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CatiSlaEngine;
}
