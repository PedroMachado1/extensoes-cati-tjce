import {
  _ as e,
  a as t,
  c as n,
  d as r,
  f as i,
  l as a,
  m as o,
  r as s,
  t as c,
  u as l,
  n as createTask
} from "../storage/taskStore.js";

function u(e, t = Date.now()) {
  let n = /^(\d{2}):(\d{2})$/.exec(e || "");
  let r = n ? Number(n[1]) : 9;
  let i = n ? Number(n[2]) : 0;
  let a = r >= 0 && r <= 23 ? r : 9;
  let o = i >= 0 && i <= 59 ? i : 0;
  let s = new Date(t);
  s.setHours(a, o, 0, 0);
  if (s.getTime() <= t) s.setDate(s.getDate() + 1);
  return s.getTime();
}

function d(e, t) {
  let n = String(e || "").trim();
  return n.length <= t ? n : `${n.slice(0, Math.max(0, t - 1)).trimEnd()}…`;
}

function f(e, t) {
  return e ? new Date(e).toLocaleString(t === "en" ? "en-US" : "pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }) : "";
}

var p = "__daily_summary__";
var m = "__missed_sweep__";
var h = "__daily_summary_notification__";
var g = "__missed_notification__";
var _ = new Set([p, m]);
var v = typeof globalThis.browser?.runtime?.getBrowserInfo == "function";
var y = {
  due: e => `Agendado para ${e}`,
  summaryTitle: "Seu resumo de hoje",
  missedTitle: e => `${e} lembrete${e === 1 ? "" : "s"} aguardando`,
  missedMore: e => `e mais ${e}`,
  snooze: e => `Adiar ${e} min`,
  complete: "Concluir",
  highPriority: "Prioridade alta",
  overdue: e => `${e} vencido${e === 1 ? "" : "s"}`,
  today: e => `${e} para hoje`,
  pending: e => `${e} pendente${e === 1 ? "" : "s"}`
};

var b = Promise.resolve();
var x = !1;

chrome.runtime.onInstalled.addListener(() => {
  S();
});

chrome.runtime.onStartup.addListener(S);

chrome.storage.onChanged.addListener((e, t) => {
  if (t === "local" && (e.agenda_tasks || e.agenda_settings)) {
    S();
  }
});

chrome.runtime.onMessage.addListener((e, t, n) => {
  if (e?.type === "refresh") {
    S().then(() => n({ ok: !0 })).catch(e => n({ ok: !1, error: e.message }));
    return !0;
  }
  if (e?.action === "GET_TASKS" || e?.type === "GET_TASKS") {
    r().then(tasks => n({ ok: !0, tasks })).catch(err => n({ ok: !1, error: err.message }));
    return !0;
  }
  if (e?.action === "IMPORT_TASKS" || e?.type === "IMPORT_TASKS") {
    (async () => {
      let tasksToImport = e.tasks || [];
      let imported = 0;
      let existing = await r();
      let existingSet = new Set(existing.map(t => String(t.title || "").trim().toLowerCase()));

      for (let item of tasksToImport) {
        let cleanTitle = String(item.title || "").trim();
        if (!cleanTitle || existingSet.has(cleanTitle.toLowerCase())) continue;

        await createTask({
          title: cleanTitle,
          description: item.description || "",
          dueDate: item.dueDate || "",
          priority: item.priority || "normal",
          tag: item.tag || "Assyst",
          recurrence: "none",
          subtasks: []
        });
        existingSet.add(cleanTitle.toLowerCase());
        imported++;
      }

      await S();
      return { ok: !0, imported };
    })().then(res => n(res)).catch(err => n({ ok: !1, error: err.message }));
    return !0;
  }
  return !1;
});

chrome.alarms.onAlarm.addListener(e => {
  C(e).catch(G);
});

if (chrome.notifications.onButtonClicked) {
  chrome.notifications.onButtonClicked.addListener((e, t) => {
    w(e, t).catch(G);
  });
}

chrome.notifications.onClicked.addListener(e => {
  U().catch(G);
  B(e).catch(G);
});

function S() {
  x = !0;
  b = b.catch(G).then(async () => {
    if (x) {
      x = !1;
      await T();
    }
  });
  return b;
}

async function C(e) {
  if (e.name === p) {
    await N();
    await O(await n());
    return;
  }
  if (e.name === m) {
    await j();
    return;
  }
  await A(e.name);
}

async function w(r, i) {
  if (_.has(r) || r.startsWith("__")) return;
  let a = await n();
  if (i === 0) {
    await D(await e(r, a.snoozeMinutes));
  }
  if (i === 1) {
    let e = await t(r);
    if (e?.status === c.pending) {
      await D(e);
    } else {
      await z(r);
    }
  }
  await B(r);
  await F();
}

async function T() {
  let e = await n();
  await s(e.cleanupDays);
  await E();
  await O(e);
  await k();
  await j();
  await F();
}

async function E() {
  let e = await r();
  let t = new Set(e.map(e => e.id));
  let n = await R();
  await Promise.all(n.filter(e => !_.has(e.name) && !t.has(e.name)).map(e => z(e.name)));
  await Promise.all(e.map(D));
}

async function D(e) {
  if (e?.id) {
    if (e.status !== c.pending || !e.due_date || i(e.due_date)) {
      await z(e.id);
      return;
    }
    await H(e.id, { when: new Date(e.due_date).getTime() });
  }
}

async function O(e) {
  await z(p);
  if (e.showDailySummary) {
    await H(p, { when: u(e.summaryTime) });
  }
}

async function k() {
  await H(m, { delayInMinutes: 15, periodInMinutes: 15 });
}

async function A(e) {
  let t = await l(e);
  if (!t || t.status !== c.pending || I(t)) return;
  let r = await n();
  let i = y;
  let a = f(t.due_date, r.language);
  let s = {
    type: "basic",
    iconUrl: chrome.runtime.getURL("src/assets/icon128.png"),
    title: d(t.title, 80),
    message: d(t.description || i.due(a), 240)
  };
  if (!v) {
    s.contextMessage = d(["Assistente 2N", t.priority === "high" ? i.highPriority : "", t.tag ? `#${t.tag}` : ""].filter(Boolean).join(" · "), 80);
    s.priority = t.priority === "high" ? 2 : 1;
    s.eventTime = new Date(t.due_date).getTime();
    s.requireInteraction = t.priority === "high";
    s.buttons = [{ title: i.snooze(r.snoozeMinutes) }, { title: i.complete }];
  }
  await V(t.id, s);
  await o(t.id);
  await F();
}

async function j() {
  let e = (await r()).filter(e => e.status === c.pending && e.due_date && i(e.due_date) && !I(e));
  if (e.length) {
    if (e.length === 1) {
      await A(e[0].id);
      return;
    }
    await M(e);
  }
}

async function M(e) {
  let t = y;
  let r = e.slice(0, 3).map(e => e.title);
  let i = e.length - r.length;
  if (i) r.push(t.missedMore(i));
  await V(g, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("src/assets/icon128.png"),
    title: t.missedTitle(e.length),
    message: d(r.join(" · "), 240)
  });
  for (let t of e) await o(t.id);
  await F();
}

async function N() {
  let e = await r();
  let t = y;
  let i = a(e);
  if (!i.pending) return;
  let o = [];
  if (i.overdue) o.push(t.overdue(i.overdue));
  if (i.today) o.push(t.today(i.today));
  if (!o.length) o.push(t.pending(i.pending));
  await V(h, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("src/assets/icon128.png"),
    title: t.summaryTitle,
    message: o.join(" · ")
  });
}

async function F() {
  let e = a(await r());
  let t = e.overdue || e.today || e.pending;
  let n = t > 99 ? "99+" : t ? String(t) : "";
  await chrome.action.setBadgeText({ text: n });
  await chrome.action.setBadgeBackgroundColor({ color: e.overdue ? "#d44254" : "#2358d5" });
}

function I(e) {
  return !!(e.reminded_at && e.due_date && new Date(e.reminded_at).getTime() >= new Date(e.due_date).getTime());
}

function R() {
  return chrome.alarms.getAll();
}

function z(e) {
  return chrome.alarms.clear(e);
}

function B(e) {
  return chrome.notifications.clear(e);
}

function V(e, t) {
  return chrome.notifications.create(e, t);
}

async function H(e, t) {
  let n = chrome.alarms.create(e, t);
  if (n?.then) await n;
}

async function U() {
  if (chrome.action.openPopup) await chrome.action.openPopup();
}

function G(e) {
  console.error("Assistente 2N background error:", e);
}