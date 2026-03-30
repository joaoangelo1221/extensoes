const storage = chrome.storage.local;

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getState() {
  const data = await storage.get([
    "passwordHash",
    "lockAll",
    "lockedTabs",
    "blurAmount",
    "floatingLockEnabled",
    "floatingLockPosition",
    "floatingLockOpacity",
  ]);
  return {
    passwordHash: data.passwordHash,
    lockAll: !!data.lockAll,
    lockedTabs: data.lockedTabs || {},
    blurAmount: data.blurAmount ?? 6,
    floatingLockEnabled: data.floatingLockEnabled !== false,
    floatingLockPosition: data.floatingLockPosition || null,
    floatingLockOpacity: typeof data.floatingLockOpacity === "number" ? data.floatingLockOpacity : 0.9,
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
    await chrome.tabs.sendMessage(tabId, { type: "APPLY_LOCK_VISUALS", amount: blurAmount });
  } catch {}
}

async function clearLockFromTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CLEAR_LOCK_VISUALS" });
  } catch {}
}

async function sendSettingsToTab(tabId, state) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "SETTINGS_UPDATED",
      floatingLockEnabled: state.floatingLockEnabled,
      floatingLockPosition: state.floatingLockPosition,
      floatingLockOpacity: state.floatingLockOpacity,
      blurAmount: state.blurAmount,
      lockActive: isTabLocked(tabId, state),
    });
  } catch {}
}

async function syncTabState(tabId, stateArg) {
  if (!tabId) return;
  const state = stateArg || (await getState());
  if (isTabLocked(tabId, state)) await applyLockToTab(tabId, state.blurAmount);
  else await clearLockFromTab(tabId);
  await sendSettingsToTab(tabId, state);
}

async function syncAllTabs(stateArg) {
  const state = stateArg || (await getState());
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((tab) => tab.id).map((tab) => syncTabState(tab.id, state)));
}

async function switchTab(direction) {
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!current) return;
  const tabs = await chrome.tabs.query({ windowId: current.windowId });
  const index = tabs.findIndex((tab) => tab.id === current.id);
  if (index === -1) return;
  const nextIndex = direction === "prev" ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
  const target = tabs[nextIndex];
  if (target?.id) await chrome.tabs.update(target.id, { active: true });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "prev-tab") switchTab("prev");
  if (command === "next-tab") switchTab("next");
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  await syncTabState(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await syncTabState(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  const key = normalizeTabId(tabId);
  if (!state.lockedTabs[key]) return;
  const lockedTabs = { ...state.lockedTabs };
  delete lockedTabs[key];
  await setState({ lockedTabs });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const state = await getState();

    switch (msg?.type) {
      case "PING_TAB_ID":
        sendResponse({ tabId: sender?.tab?.id ?? null });
        return;

      case "GET_STATE":
        sendResponse(state);
        return;

      case "GET_TAB_STATE": {
        const tabId = msg.tabId ?? sender?.tab?.id ?? null;
        sendResponse({ ...state, tabId, lockActive: tabId ? isTabLocked(tabId, state) : false });
        return;
      }

      case "CHANGE_PASSWORD": {
        const { current, next } = msg;
        if (!next) {
          sendResponse({ ok: false, error: "Nova senha inválida." });
          return;
        }
        if (state.passwordHash) {
          const tryHash = await sha256(current || "");
          if (tryHash !== state.passwordHash) {
            sendResponse({ ok: false, error: "Senha atual incorreta." });
            return;
          }
        }
        await setState({ passwordHash: await sha256(next) });
        sendResponse({ ok: true });
        return;
      }

      case "SET_BLUR_AMOUNT": {
        const amount = Math.max(0, Math.min(30, Number(msg.amount) || 6));
        const nextState = { ...state, blurAmount: amount };
        await setState({ blurAmount: amount });
        await syncAllTabs(nextState);
        sendResponse({ ok: true });
        return;
      }

      case "SET_FLOATING_LOCK_ENABLED": {
        const enabled = msg.enabled !== false;
        const nextState = { ...state, floatingLockEnabled: enabled };
        await setState({ floatingLockEnabled: enabled });
        await syncAllTabs(nextState);
        sendResponse({ ok: true });
        return;
      }

      case "SET_FLOATING_LOCK_POSITION": {
        const position = msg.position && typeof msg.position.x === "number" && typeof msg.position.y === "number"
          ? { x: Math.max(0, Math.round(msg.position.x)), y: Math.max(0, Math.round(msg.position.y)) }
          : null;
        const nextState = { ...state, floatingLockPosition: position };
        await setState({ floatingLockPosition: position });
        await syncAllTabs(nextState);
        sendResponse({ ok: true });
        return;
      }

      case "SET_FLOATING_LOCK_OPACITY": {
        const opacity = Math.max(0.2, Math.min(1, Number(msg.opacity) || 0.9));
        const nextState = { ...state, floatingLockOpacity: opacity };
        await setState({ floatingLockOpacity: opacity });
        await syncAllTabs(nextState);
        sendResponse({ ok: true });
        return;
      }

      case "LOCK_CURRENT": {
        if (!state.passwordHash) {
          sendResponse({ ok: false, error: "Defina uma senha antes." });
          return;
        }
        const tabId = msg.tabId ?? sender?.tab?.id;
        if (!tabId) {
          sendResponse({ ok: false, error: "Aba atual não identificada." });
          return;
        }
        const lockedTabs = { ...state.lockedTabs, [normalizeTabId(tabId)]: true };
        const nextState = { ...state, lockedTabs };
        await setState({ lockedTabs });
        await syncTabState(tabId, nextState);
        await chrome.tabs.update(tabId, { active: true });
        sendResponse({ ok: true });
        return;
      }

      case "UNLOCK_CURRENT": {
        if (!state.passwordHash) {
          sendResponse({ ok: false, error: "Sem senha definida." });
          return;
        }
        const tabId = msg.tabId ?? sender?.tab?.id;
        if (!tabId) {
          sendResponse({ ok: false, error: "Aba atual não identificada." });
          return;
        }
        const tryHash = await sha256(msg.password || "");
        if (tryHash !== state.passwordHash) {
          sendResponse({ ok: false, error: "Senha incorreta." });
          return;
        }
        const lockedTabs = { ...state.lockedTabs };
        delete lockedTabs[normalizeTabId(tabId)];
        const nextState = { ...state, lockedTabs };
        await setState({ lockedTabs });
        await syncTabState(tabId, nextState);
        sendResponse({ ok: true });
        return;
      }

      case "LOCK_ALL": {
        if (!state.passwordHash) {
          sendResponse({ ok: false, error: "Defina uma senha antes." });
          return;
        }
        const nextState = { ...state, lockAll: true };
        await setState({ lockAll: true });
        await syncAllTabs(nextState);
        if (sender?.tab?.id) await syncTabState(sender.tab.id, nextState);
        sendResponse({ ok: true });
        return;
      }

      case "UNLOCK_ALL": {
        if (!state.passwordHash) {
          sendResponse({ ok: false, error: "Sem senha definida." });
          return;
        }
        const tryHash = await sha256(msg.password || "");
        if (tryHash !== state.passwordHash) {
          sendResponse({ ok: false, error: "Senha incorreta." });
          return;
        }
        const nextState = { ...state, lockAll: false, lockedTabs: {} };
        await setState({ lockAll: false, lockedTabs: {} });
        await syncAllTabs(nextState);
        sendResponse({ ok: true });
        return;
      }

      case "TRY_UNLOCK_FROM_CONTENT": {
        if (!state.passwordHash) {
          sendResponse({ ok: false, error: "Sem senha definida." });
          return;
        }
        if (state.lockAll) {
          sendResponse({ ok: false, error: "Use “Desbloquear todas” no popup para o bloqueio global." });
          return;
        }
        const tabId = msg.tabId ?? sender?.tab?.id;
        if (!tabId) {
          sendResponse({ ok: false, error: "Aba atual não identificada." });
          return;
        }
        const tryHash = await sha256(msg.password || "");
        if (tryHash !== state.passwordHash) {
          sendResponse({ ok: false, error: "Senha incorreta." });
          return;
        }
        const lockedTabs = { ...state.lockedTabs };
        delete lockedTabs[normalizeTabId(tabId)];
        const nextState = { ...state, lockedTabs };
        await setState({ lockedTabs });
        await syncTabState(tabId, nextState);
        sendResponse({ ok: true });
        return;
      }

      default:
        sendResponse({ ok: false });
    }
  })();

  return true;
});
