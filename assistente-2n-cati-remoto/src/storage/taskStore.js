// Armazenamento e gerenciamento local de lembretes e tarefas
const STORAGE_TASKS_KEY = "agenda_tasks";
const STORAGE_SETTINGS_KEY = "agenda_settings";

export const TaskStatus = {
  pending: "pending",
  completed: "completed"
};

export const TaskPriority = {
  low: "low",
  normal: "normal",
  high: "high"
};

export const TaskRecurrence = {
  none: "none",
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly"
};

const DEFAULT_SETTINGS = {
  language: "pt",
  theme: "system",
  summaryTime: "09:00",
  snoozeMinutes: 10,
  cleanupDays: 30,
  showDailySummary: true,
  slaTargetHours: 1,
  slaCalculationMode: "business",
  slaWorkStart: "08:00",
  slaWorkEnd: "18:00",
  slaBoxScale: 100,
  scanSpeed: "normal",
  waitingInfoDept: "2N CATI Remoto"
};

const SUPPORTED_LANGUAGES = new Set(["pt", "en"]);
const SUPPORTED_THEMES = new Set(["system", "light", "dark"]);

const PRIORITY_ORDER = {
  [TaskPriority.high]: 0,
  [TaskPriority.normal]: 1,
  [TaskPriority.low]: 2
};

const storageApi = {
  async get(key) {
    const result = await chrome.storage.local.get([key]);
    return result?.[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }
};

function generateId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) return [];
  return subtasks
    .map(st => ({
      id: st.id || generateId(),
      title: String(st.title || "").trim(),
      done: Boolean(st.done)
    }))
    .filter(st => st.title);
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function validateSummaryTime(timeStr) {
  if (typeof timeStr !== "string" || !/^\d{2}:\d{2}$/.test(timeStr)) {
    return DEFAULT_SETTINGS.summaryTime;
  }
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours <= 23 && minutes <= 59 ? timeStr : DEFAULT_SETTINGS.summaryTime;
}

function getSystemLanguage() {
  return "pt";
}

function normalizeTask(raw) {
  const nowIso = new Date().toISOString();
  const dueDate = normalizeIsoDate(raw.due_date ?? raw.dueDate);

  return {
    id: raw.id || generateId(),
    title: String(raw.title || "").trim(),
    description: String(raw.description || "").trim(),
    tag: String(raw.tag || "").trim(),
    priority: Object.values(TaskPriority).includes(raw.priority) ? raw.priority : TaskPriority.normal,
    recurrence: "none",
    subtasks: normalizeSubtasks(raw.subtasks),
    due_date: dueDate,
    recurrence_anchor: null,
    recurrence_day: null,
    status: raw.status === TaskStatus.completed ? TaskStatus.completed : TaskStatus.pending,
    created_at: normalizeIsoDate(raw.created_at) || nowIso,
    updated_at: normalizeIsoDate(raw.updated_at) || normalizeIsoDate(raw.created_at) || nowIso,
    completed_at: normalizeIsoDate(raw.completed_at),
    last_completed_at: normalizeIsoDate(raw.last_completed_at),
    reminded_at: normalizeIsoDate(raw.reminded_at),
    snoozed_until: normalizeIsoDate(raw.snoozed_until)
  };
}

function normalizeTaskList(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map(normalizeTask).filter(t => t.title);
}

function normalizeSettings(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    language: SUPPORTED_LANGUAGES.has(obj.language) ? obj.language : getSystemLanguage(),
    theme: SUPPORTED_THEMES.has(obj.theme) ? obj.theme : DEFAULT_SETTINGS.theme,
    summaryTime: validateSummaryTime(obj.summaryTime),
    snoozeMinutes: clampNumber(obj.snoozeMinutes, DEFAULT_SETTINGS.snoozeMinutes, 1, 180),
    cleanupDays: clampNumber(obj.cleanupDays, DEFAULT_SETTINGS.cleanupDays, 1, 365),
    showDailySummary: typeof obj.showDailySummary === "boolean" ? obj.showDailySummary : DEFAULT_SETTINGS.showDailySummary,
    slaTargetHours: clampNumber(obj.slaTargetHours, DEFAULT_SETTINGS.slaTargetHours, 1, 168),
    slaCalculationMode: obj.slaCalculationMode === "calendar" ? "calendar" : DEFAULT_SETTINGS.slaCalculationMode,
    slaWorkStart: validateSummaryTime(obj.slaWorkStart),
    slaWorkEnd: validateSummaryTime(obj.slaWorkEnd),
    slaBoxScale: clampNumber(obj.slaBoxScale, DEFAULT_SETTINGS.slaBoxScale, 70, 160),
    scanSpeed: ["turbo", "fast", "normal", "careful", "slow"].includes(obj.scanSpeed) ? obj.scanSpeed : DEFAULT_SETTINGS.scanSpeed,
    waitingInfoDept: typeof obj.waitingInfoDept === "string" && obj.waitingInfoDept.trim() ? obj.waitingInfoDept.trim() : DEFAULT_SETTINGS.waitingInfoDept
  };
}

function getDueDateTimestamp(task) {
  return task.due_date ? new Date(task.due_date).getTime() : Infinity;
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === TaskStatus.pending ? -1 : 1;
    }
    if (a.status === TaskStatus.pending) {
      const diffDate = getDueDateTimestamp(a) - getDueDateTimestamp(b);
      if (diffDate !== 0) return diffDate;

      const diffPrio = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (diffPrio !== 0) return diffPrio;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}


export async function getSettings() {
  return normalizeSettings(await storageApi.get(STORAGE_SETTINGS_KEY));
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const merged = normalizeSettings({ ...current, ...settings });
  await storageApi.set(STORAGE_SETTINGS_KEY, merged);
  return merged;
}

export async function getAllTasks() {
  return sortTasks(normalizeTaskList(await storageApi.get(STORAGE_TASKS_KEY)));
}

export async function getTaskById(id) {
  const tasks = await getAllTasks();
  return tasks.find(t => t.id === id) || null;
}

export async function saveTaskList(tasks) {
  await storageApi.set(STORAGE_TASKS_KEY, sortTasks(normalizeTaskList(tasks)));
}

export async function createTask({ title, description = "", dueDate = "", priority = TaskPriority.normal, tag = "", recurrence = TaskRecurrence.none, subtasks = [] }) {
  const tasks = await getAllTasks();
  const now = new Date().toISOString();
  const newTask = normalizeTask({
    id: generateId(),
    title,
    description,
    tag,
    priority,
    recurrence,
    subtasks,
    due_date: dueDate ? new Date(dueDate).toISOString() : null,
    status: TaskStatus.pending,
    created_at: now,
    updated_at: now
  });
  await saveTaskList([newTask, ...tasks]);
  return newTask;
}

export async function updateTask(id, updates) {
  const tasks = await getAllTasks();
  let updatedItem = null;
  const copy = { ...updates };

  if (Object.hasOwn(copy, "dueDate")) {
    copy.due_date = copy.dueDate ? normalizeIsoDate(copy.dueDate) : null;
    delete copy.dueDate;
  }

  await saveTaskList(
    tasks.map(task => {
      if (task.id !== id) return task;
      updatedItem = normalizeTask({ ...task, ...copy, updated_at: new Date().toISOString() });
      return updatedItem;
    })
  );

  return updatedItem;
}

export async function completeTask(id) {
  const task = await getTaskById(id);
  if (!task) return null;

  return updateTask(id, {
    status: TaskStatus.completed,
    completed_at: new Date().toISOString()
  });
}

export async function reopenTask(id) {
  return updateTask(id, {
    status: TaskStatus.pending,
    completed_at: null,
    reminded_at: null
  });
}

export async function snoozeTask(id, minutes) {
  const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  return updateTask(id, {
    status: TaskStatus.pending,
    due_date: snoozedUntil,
    snoozed_until: snoozedUntil,
    reminded_at: null
  });
}

export async function markReminded(id) {
  return updateTask(id, {
    reminded_at: new Date().toISOString()
  });
}

export async function deleteTask(id) {
  const tasks = await getAllTasks();
  const target = tasks.find(t => t.id === id) || null;
  await saveTaskList(tasks.filter(t => t.id !== id));
  return target;
}

export async function restoreTask(task) {
  if (!task?.id || !task?.title) return null;
  const tasks = (await getAllTasks()).filter(t => t.id !== task.id);
  const restored = normalizeTask(task);
  await saveTaskList([restored, ...tasks]);
  return restored;
}

export async function completeAllOverdue() {
  const overdueIds = (await getAllTasks())
    .filter(t => t.status === TaskStatus.pending && isOverdue(t.due_date))
    .map(t => t.id);

  for (const id of overdueIds) {
    await completeTask(id);
  }
  return overdueIds.length;
}

export async function deleteAllCompleted() {
  const tasks = await getAllTasks();
  const remaining = tasks.filter(t => t.status !== TaskStatus.completed);
  const count = tasks.length - remaining.length;
  if (count > 0) {
    await saveTaskList(remaining);
  }
  return count;
}

export async function cleanupOldCompleted(days) {
  const tasks = await getAllTasks();
  const cutoff = Date.now() - Number(days) * 24 * 60 * 60 * 1000;
  const filtered = tasks.filter(
    t => t.status !== TaskStatus.completed || !t.completed_at || new Date(t.completed_at).getTime() > cutoff
  );
  const removed = tasks.length - filtered.length;
  if (removed > 0) {
    await saveTaskList(filtered);
  }
  return removed;
}

export function isDueToday(isoDate) {
  if (!isoDate) return false;
  const target = new Date(isoDate);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return target.getTime() >= startOfDay.getTime() && target.getTime() < endOfDay.getTime();
}

export function isOverdue(isoDate) {
  return isoDate ? new Date(isoDate).getTime() < Date.now() : false;
}

export function getTaskCounts(tasks) {
  return tasks.reduce(
    (acc, t) => {
      if (t.status === TaskStatus.completed) {
        acc.completed += 1;
      } else {
        acc.pending += 1;
        if (isOverdue(t.due_date)) acc.overdue += 1;
        if (isDueToday(t.due_date)) acc.today += 1;
        if (t.priority === TaskPriority.high) acc.high += 1;
      }
      if (t.subtasks.length) {
        acc.subtasks += t.subtasks.length;
        acc.doneSubtasks += t.subtasks.filter(st => st.done).length;
      }
      return acc;
    },
    { pending: 0, completed: 0, overdue: 0, today: 0, high: 0, subtasks: 0, doneSubtasks: 0 }
  );
}

// Aliases para compatibilidade total com os scripts existentes
export {
  snoozeTask as _,
  completeTask as a,
  getSettings as c,
  getAllTasks as d,
  isOverdue as f,
  restoreTask as g,
  reopenTask as h,
  completeAllOverdue as i,
  getTaskCounts as l,
  markReminded as m,
  createTask as n,
  deleteAllCompleted as o,
  isDueToday as p,
  cleanupOldCompleted as r,
  deleteTask as s,
  TaskStatus as t,
  getTaskById as u,
  saveSettings as v,
  updateTask as y
};
