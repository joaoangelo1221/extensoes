import { registerHandlers } from '../../core/messaging.js';
import { RefreshManager } from './services/refresh-manager.js';
import { TabManager } from './services/tab-manager.js';
import { DataCleaner } from './services/data-cleaner.js';

const SETTINGS_KEY = 'websuite.automation.settings';
const TIMER_PREFIX = 'websuite.timer_';
const BADGE_TICK_MS = 1000;

const defaultSettings = {
  defaultIntervalMs: 30000,
  progressiveDelayMs: 250,
  pauseBackgroundRefresh: false,
};

let settings = { ...defaultSettings };
let listenersReady = false;

const refreshManager = new RefreshManager({
  onStateChanged: (jobs) => broadcastState(jobs),
  getSettings: () => settings,
});

async function init() {
  const stored = await chrome.storage.local.get([SETTINGS_KEY]);
  settings = { ...defaultSettings, ...(stored[SETTINGS_KEY] || {}) };
  await refreshManager.hydrate();
}

async function saveSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function broadcastState(jobs = refreshManager.getCountdowns()) {
  chrome.runtime.sendMessage({
    type: 'AUTOMATION/STATE_CHANGED',
    payload: { jobs, settings },
  }).catch(() => {});
}

function timerKey(tabId) {
  return `${TIMER_PREFIX}${tabId}`;
}

async function scheduleNext(tabId, intervalSec) {
  const safeIntervalSec = Math.max(1, Number(intervalSec) || 1);
  await chrome.alarms.create(`websuite_refresh_${tabId}`, {
    delayInMinutes: safeIntervalSec / 60,
  });
}

async function startRefresh(tabId, intervalSec) {
  const safeIntervalSec = Math.max(1, Number(intervalSec) || 1);
  await chrome.storage.local.set({
    [timerKey(tabId)]: {
      interval: safeIntervalSec,
      nextExecution: Date.now() + safeIntervalSec * 1000,
    },
  });
  await scheduleNext(tabId, safeIntervalSec);
}

async function stopRefresh(tabId) {
  await chrome.alarms.clear(`websuite_refresh_${tabId}`);
  await chrome.storage.local.remove(timerKey(tabId));
  await chrome.action.setBadgeText({ text: '', tabId });
  await updateBadgeForActiveTab();
}

async function syncTimersFromJobs() {
  const jobs = refreshManager.listJobs();
  const runningEntries = jobs
    .filter((job) => job.status === 'running')
    .flatMap((job) => job.tabIds.map((tabId) => [timerKey(tabId), {
      interval: Math.max(1, Math.round(job.intervalMs / 1000)),
      nextExecution: job.nextRunAt || Date.now() + Math.max(1, Math.round(job.intervalMs / 1000)) * 1000,
    }]));

  const storageTimers = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(storageTimers).filter((key) => key.startsWith(TIMER_PREFIX));
  if (keysToRemove.length) await chrome.storage.local.remove(keysToRemove);
  if (runningEntries.length) await chrome.storage.local.set(Object.fromEntries(runningEntries));
}

async function updateBadgeForActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (!Number.isInteger(tabId)) return;
  const data = await chrome.storage.local.get(timerKey(tabId));
  const timer = data[timerKey(tabId)];
  if (!timer) {
    await chrome.action.setBadgeText({ text: '', tabId });
    return;
  }
  const remaining = Math.max(0, Math.floor((timer.nextExecution - Date.now()) / 1000));
  await chrome.action.setBadgeText({ text: remaining.toString(), tabId });
  await chrome.action.setBadgeBackgroundColor({ color: '#0f766e', tabId });
}

function setupListeners() {
  if (listenersReady) return;
  listenersReady = true;

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm.name.startsWith('websuite_refresh_')) return;
    const tabId = Number.parseInt(alarm.name.split('_').pop(), 10);
    if (!Number.isInteger(tabId)) return;
    try {
      await chrome.tabs.get(tabId);
    } catch {
      await stopRefresh(tabId);
      return;
    }
    await refreshManager.handleAlarm({ ...alarm, name: `refresh_${tabId}` });
    const timerData = await chrome.storage.local.get(timerKey(tabId));
    const entry = timerData[timerKey(tabId)];
    if (entry?.interval) {
      await scheduleNext(tabId, entry.interval);
      entry.nextExecution = Date.now() + entry.interval * 1000;
      await chrome.storage.local.set({ [timerKey(tabId)]: entry });
    }
  });

  chrome.tabs.onActivated.addListener(() => updateBadgeForActiveTab().catch(() => {}));
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') updateBadgeForActiveTab().catch(() => {});
  });

  setInterval(() => updateBadgeForActiveTab().catch(() => {}), BADGE_TICK_MS);
}

export async function initializeAutomationModule() {
  await init();
  setupListeners();

  registerHandlers({
    'AUTOMATION/GET_STATE': async () => {
      const currentTab = await TabManager.getCurrentTab();
      const allTabs = await TabManager.listTabs({ currentWindow: true });
      return { ok: true, payload: { jobs: refreshManager.getCountdowns(), settings, currentTab, tabs: allTabs } };
    },
    'AUTOMATION/START': async ({ scope, selectedTabIds, intervalMs }) => {
      const targetTabIds = await TabManager.resolveScopeTabs(scope, selectedTabIds || []);
      if (!targetTabIds.length) throw new Error('Nenhuma aba encontrada para o escopo selecionado.');
      const intervalSec = Math.max(1, Math.round(intervalMs / 1000));
      const job = await refreshManager.startJob({ tabIds: targetTabIds, intervalMs, name: scope });
      await Promise.all(targetTabIds.map((tabId) => startRefresh(tabId, intervalSec)));
      return { ok: true, payload: job };
    },
    'AUTOMATION/STOP_ALL': async () => {
      const jobs = refreshManager.listJobs();
      await Promise.all(jobs.map(async (job) => {
        await refreshManager.stopJob(job.id);
        await Promise.all(job.tabIds.map((tabId) => stopRefresh(tabId)));
      }));
      return { ok: true };
    },
    'AUTOMATION/STOP_JOB': async ({ jobId }) => {
      const job = refreshManager.jobs[jobId];
      await refreshManager.stopJob(jobId);
      if (job?.tabIds?.length) await Promise.all(job.tabIds.map((tabId) => stopRefresh(tabId)));
      return { ok: true };
    },
    'AUTOMATION/RESTART_JOB': async ({ jobId }) => {
      await refreshManager.restartJob(jobId);
      await syncTimersFromJobs();
      return { ok: true };
    },
    'AUTOMATION/REMOVE_JOB': async ({ jobId }) => {
      const job = refreshManager.jobs[jobId];
      await refreshManager.removeJob(jobId);
      if (job?.tabIds?.length) await Promise.all(job.tabIds.map((tabId) => stopRefresh(tabId)));
      return { ok: true };
    },
    'AUTOMATION/GET_SCOPE_TABS': async ({ scope, selectedTabIds }) => {
      const tabIds = await TabManager.resolveScopeTabs(scope, selectedTabIds || []);
      return { ok: true, payload: tabIds };
    },
    'AUTOMATION/CLEAN': async ({ scope, types }) => {
      const result = await DataCleaner.clean(scope, types);
      return { ok: true, payload: result };
    },
    'AUTOMATION/SAVE_SETTINGS': async (payload) => {
      await saveSettings(payload);
      return { ok: true, payload: settings };
    },
  });
}
