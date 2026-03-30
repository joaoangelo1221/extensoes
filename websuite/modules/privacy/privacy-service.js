import { registerHandlers } from '../../core/messaging.js';

const storage = chrome.storage.local;
let listenersReady = false;

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getState() {
  const data = await storage.get([
    'passwordHash',
    'lockAll',
    'lockedTabs',
    'blurAmount',
    'floatingLockEnabled',
    'floatingLockPosition',
    'floatingLockOpacity',
  ]);
  return {
    passwordHash: data.passwordHash,
    lockAll: !!data.lockAll,
    lockedTabs: data.lockedTabs || {},
    blurAmount: data.blurAmount ?? 6,
    floatingLockEnabled: data.floatingLockEnabled !== false,
    floatingLockPosition: data.floatingLockPosition || null,
    floatingLockOpacity: typeof data.floatingLockOpacity === 'number' ? data.floatingLockOpacity : 0.9,
  };
}

async function setState(patch) {
  await storage.set(patch);
}

function normalizeTabId(tabId) {
  return String(tabId);
}

function isTabLocked(tabId, state) {
  return !!state.lockAll || !!state.lockedTabs[normalizeTabId(tabId)];
}

async function applyLockToTab(tabId, blurAmount) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PRIVACY/APPLY_LOCK_VISUALS', payload: { amount: blurAmount } });
  } catch {}
}

async function clearLockFromTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PRIVACY/CLEAR_LOCK_VISUALS' });
  } catch {}
}

async function sendSettingsToTab(tabId, state) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'PRIVACY/SETTINGS_UPDATED',
      payload: {
        floatingLockEnabled: state.floatingLockEnabled,
        floatingLockPosition: state.floatingLockPosition,
        floatingLockOpacity: state.floatingLockOpacity,
        blurAmount: state.blurAmount,
        lockActive: isTabLocked(tabId, state),
      },
    });
  } catch {}
}

async function syncTabState(tabId, stateArg) {
  if (!tabId) return;
  const state = stateArg || await getState();
  if (isTabLocked(tabId, state)) await applyLockToTab(tabId, state.blurAmount);
  else await clearLockFromTab(tabId);
  await sendSettingsToTab(tabId, state);
}

async function syncAllTabs(stateArg) {
  const state = stateArg || await getState();
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((tab) => tab.id).map((tab) => syncTabState(tab.id, state)));
}

async function switchTab(direction) {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!current) return;
  const tabs = await chrome.tabs.query({ windowId: current.windowId });
  const index = tabs.findIndex((tab) => tab.id === current.id);
  if (index === -1) return;
  const nextIndex = direction === 'prev' ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
  const target = tabs[nextIndex];
  if (target?.id) await chrome.tabs.update(target.id, { active: true });
}

function setupListeners() {
  if (listenersReady) return;
  listenersReady = true;
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'prev-tab') switchTab('prev');
    if (command === 'next-tab') switchTab('next');
  });
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === 'complete') await syncTabState(tabId);
  });
  chrome.tabs.onActivated.addListener(async ({ tabId }) => syncTabState(tabId));
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const state = await getState();
    const key = normalizeTabId(tabId);
    if (!state.lockedTabs[key]) return;
    const lockedTabs = { ...state.lockedTabs };
    delete lockedTabs[key];
    await setState({ lockedTabs });
  });
}

export async function initializePrivacyModule() {
  setupListeners();
  registerHandlers({
    'PRIVACY/GET_STATE': async () => ({ ok: true, payload: await getState() }),
    'PRIVACY/GET_TAB_STATE': async (payload, sender) => {
      const state = await getState();
      const tabId = payload.tabId ?? sender?.tab?.id ?? null;
      return { ok: true, payload: { ...state, tabId, lockActive: tabId ? isTabLocked(tabId, state) : false } };
    },
    'PRIVACY/CHANGE_PASSWORD': async ({ current, next }) => {
      const state = await getState();
      if (!next) return { ok: false, error: 'Nova senha inválida.' };
      if (state.passwordHash) {
        const tryHash = await sha256(current || '');
        if (tryHash !== state.passwordHash) return { ok: false, error: 'Senha atual incorreta.' };
      }
      await setState({ passwordHash: await sha256(next) });
      return { ok: true };
    },
    'PRIVACY/SET_BLUR_AMOUNT': async ({ amount }) => {
      const state = await getState();
      const nextState = { ...state, blurAmount: Math.max(0, Math.min(30, Number(amount) || 6)) };
      await setState({ blurAmount: nextState.blurAmount });
      await syncAllTabs(nextState);
      return { ok: true };
    },
    'PRIVACY/SET_FLOATING_LOCK_ENABLED': async ({ enabled }) => {
      const state = await getState();
      const nextState = { ...state, floatingLockEnabled: enabled !== false };
      await setState({ floatingLockEnabled: nextState.floatingLockEnabled });
      await syncAllTabs(nextState);
      return { ok: true };
    },
    'PRIVACY/SET_FLOATING_LOCK_POSITION': async ({ position }) => {
      const state = await getState();
      const safePosition = position && typeof position.x === 'number' && typeof position.y === 'number'
        ? { x: Math.max(0, Math.round(position.x)), y: Math.max(0, Math.round(position.y)) }
        : null;
      const nextState = { ...state, floatingLockPosition: safePosition };
      await setState({ floatingLockPosition: safePosition });
      await syncAllTabs(nextState);
      return { ok: true };
    },
    'PRIVACY/SET_FLOATING_LOCK_OPACITY': async ({ opacity }) => {
      const state = await getState();
      const nextState = { ...state, floatingLockOpacity: Math.max(0.2, Math.min(1, Number(opacity) || 0.9)) };
      await setState({ floatingLockOpacity: nextState.floatingLockOpacity });
      await syncAllTabs(nextState);
      return { ok: true };
    },
    'PRIVACY/LOCK_CURRENT': async ({ tabId }, sender) => {
      const state = await getState();
      if (!state.passwordHash) return { ok: false, error: 'Defina uma senha antes.' };
      const currentTabId = tabId ?? sender?.tab?.id;
      if (!currentTabId) return { ok: false, error: 'Aba atual não identificada.' };
      const lockedTabs = { ...state.lockedTabs, [normalizeTabId(currentTabId)]: true };
      const nextState = { ...state, lockedTabs };
      await setState({ lockedTabs });
      await syncTabState(currentTabId, nextState);
      return { ok: true };
    },
    'PRIVACY/UNLOCK_CURRENT': async ({ tabId, password }, sender) => {
      const state = await getState();
      if (!state.passwordHash) return { ok: false, error: 'Sem senha definida.' };
      const currentTabId = tabId ?? sender?.tab?.id;
      if (!currentTabId) return { ok: false, error: 'Aba atual não identificada.' };
      const tryHash = await sha256(password || '');
      if (tryHash !== state.passwordHash) return { ok: false, error: 'Senha incorreta.' };
      const lockedTabs = { ...state.lockedTabs };
      delete lockedTabs[normalizeTabId(currentTabId)];
      const nextState = { ...state, lockedTabs };
      await setState({ lockedTabs });
      await syncTabState(currentTabId, nextState);
      return { ok: true };
    },
    'PRIVACY/LOCK_ALL': async () => {
      const state = await getState();
      if (!state.passwordHash) return { ok: false, error: 'Defina uma senha antes.' };
      const nextState = { ...state, lockAll: true };
      await setState({ lockAll: true });
      await syncAllTabs(nextState);
      return { ok: true };
    },
    'PRIVACY/UNLOCK_ALL': async ({ password }) => {
      const state = await getState();
      if (!state.passwordHash) return { ok: false, error: 'Sem senha definida.' };
      const tryHash = await sha256(password || '');
      if (tryHash !== state.passwordHash) return { ok: false, error: 'Senha incorreta.' };
      const nextState = { ...state, lockAll: false, lockedTabs: {} };
      await setState({ lockAll: false, lockedTabs: {} });
      await syncAllTabs(nextState);
      return { ok: true };
    },
    'PRIVACY/TRY_UNLOCK_FROM_CONTENT': async ({ tabId, password }, sender) => {
      const state = await getState();
      if (!state.passwordHash) return { ok: false, error: 'Sem senha definida.' };
      if (state.lockAll) return { ok: false, error: 'Use “Desbloquear todas” no popup para o bloqueio global.' };
      const currentTabId = tabId ?? sender?.tab?.id;
      if (!currentTabId) return { ok: false, error: 'Aba atual não identificada.' };
      const tryHash = await sha256(password || '');
      if (tryHash !== state.passwordHash) return { ok: false, error: 'Senha incorreta.' };
      const lockedTabs = { ...state.lockedTabs };
      delete lockedTabs[normalizeTabId(currentTabId)];
      const nextState = { ...state, lockedTabs };
      await setState({ lockedTabs });
      await syncTabState(currentTabId, nextState);
      return { ok: true };
    },
  });
}
