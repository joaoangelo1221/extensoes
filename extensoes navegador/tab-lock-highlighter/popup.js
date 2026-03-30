function sendToActiveTab(message) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return resolve({ ok: false, error: "Nenhuma aba ativa encontrada." });
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: "Não foi possível comunicar com a aba atual." });
          return;
        }
        resolve(response ?? { ok: false });
      });
    });
  });
}

function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0]?.id ?? null));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const pwdCurrent = document.getElementById("pwd-current");
  const pwdNew = document.getElementById("pwd-new");
  const btnChangePwd = document.getElementById("btn-change-pwd");
  const blur = document.getElementById("blur");
  const btnLockTab = document.getElementById("btn-lock-tab");
  const btnUnlockTabToggle = document.getElementById("btn-unlock-tab-toggle");
  const btnUnlockTab = document.getElementById("btn-unlock-tab");
  const fieldUnlockOne = document.getElementById("unlock-one");
  const pwdUnlockOne = document.getElementById("pwd-unlock-one");
  const btnLockAll = document.getElementById("btn-lock-all");
  const btnUnlockAllToggle = document.getElementById("btn-unlock-all-toggle");
  const btnUnlockAll = document.getElementById("btn-unlock-all");
  const fieldUnlockAll = document.getElementById("unlock-all");
  const pwdUnlockAll = document.getElementById("pwd-unlock-all");
  const toggleFloatingLock = document.getElementById("toggle-floating-lock");
  const floatingLockOpacity = document.getElementById("floating-lock-opacity");
  const floatingLockOpacityValue = document.getElementById("floating-lock-opacity-value");
  const colorInput = document.getElementById("color");
  const btnHighlight = document.getElementById("btn-highlight");
  const btnClear = document.getElementById("btn-clear");
  const btnClearOne = document.getElementById("btn-clear-one");
  const btnAddNote = document.getElementById("btn-add-note");
  const btnClearNotes = document.getElementById("btn-clear-notes");

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
    if (state?.blurAmount != null) blur.value = state.blurAmount;
    toggleFloatingLock.checked = state?.floatingLockEnabled !== false;
    const opacityPercent = Math.round((state?.floatingLockOpacity ?? 0.9) * 100);
    floatingLockOpacity.value = String(opacityPercent);
    floatingLockOpacityValue.textContent = `${opacityPercent}%`;
  });

  btnChangePwd.addEventListener("click", async () => {
    const current = (pwdCurrent.value || "").trim();
    const next = (pwdNew.value || "").trim();
    if (!next) {
      alert("Informe a nova senha.");
      return;
    }

    const res = await chrome.runtime.sendMessage({ type: "CHANGE_PASSWORD", current, next });
    if (!res?.ok) {
      alert(res?.error || "Falha ao salvar senha.");
      return;
    }

    alert("Senha salva.");
    pwdCurrent.value = "";
    pwdNew.value = "";
  });

  blur.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({ type: "SET_BLUR_AMOUNT", amount: Number(blur.value || 6) });
  });

  toggleFloatingLock.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({ type: "SET_FLOATING_LOCK_ENABLED", enabled: toggleFloatingLock.checked });
  });

  floatingLockOpacity.addEventListener("input", () => {
    floatingLockOpacityValue.textContent = `${floatingLockOpacity.value}%`;
  });

  floatingLockOpacity.addEventListener("change", async () => {
    await chrome.runtime.sendMessage({
      type: "SET_FLOATING_LOCK_OPACITY",
      opacity: Number(floatingLockOpacity.value || 90) / 100,
    });
  });

  btnLockTab.addEventListener("click", async () => {
    const tabId = await getActiveTabId();
    const res = await chrome.runtime.sendMessage({ type: "LOCK_CURRENT", tabId });
    if (!res?.ok) alert(res?.error || "Falha ao bloquear esta aba.");
    else await sendToActiveTab({ type: "APPLY_LOCK_VISUALS", amount: Number(blur.value || 6) });
    window.close();
  });

  btnUnlockTabToggle.addEventListener("click", () => {
    fieldUnlockOne.classList.toggle("hidden");
    if (!fieldUnlockOne.classList.contains("hidden")) pwdUnlockOne.focus();
  });

  btnUnlockTab.addEventListener("click", async () => {
    const tabId = await getActiveTabId();
    const password = pwdUnlockOne.value || "";
    const res = await chrome.runtime.sendMessage({ type: "UNLOCK_CURRENT", tabId, password });
    if (!res?.ok) {
      alert(res?.error || "Falha ao desbloquear esta aba.");
      return;
    }
    window.close();
  });

  btnLockAll.addEventListener("click", async () => {
    if (!confirm("Deseja bloquear todas as abas agora?")) return;
    const res = await chrome.runtime.sendMessage({ type: "LOCK_ALL" });
    if (!res?.ok) alert(res?.error || "Falha ao bloquear todas as abas.");
    else await sendToActiveTab({ type: "APPLY_LOCK_VISUALS", amount: Number(blur.value || 6) });
    window.close();
  });

  btnUnlockAllToggle.addEventListener("click", () => {
    fieldUnlockAll.classList.toggle("hidden");
    if (!fieldUnlockAll.classList.contains("hidden")) pwdUnlockAll.focus();
  });

  btnUnlockAll.addEventListener("click", async () => {
    if (!confirm("Deseja desbloquear todas as abas agora?")) return;
    const password = pwdUnlockAll.value || "";
    const res = await chrome.runtime.sendMessage({ type: "UNLOCK_ALL", password });
    if (!res?.ok) {
      alert(res?.error || "Falha ao desbloquear todas as abas.");
      return;
    }
    window.close();
  });

  btnHighlight.addEventListener("click", async () => {
    const color = colorInput.value || "#fff59d";
    const res = await sendToActiveTab({ type: "HIGHLIGHT_SELECTION", color });
    if (!res?.ok) alert(res?.error || "Selecione um texto antes de realçar.");
    window.close();
  });

  btnClear.addEventListener("click", async () => {
    await sendToActiveTab({ type: "CLEAR_HIGHLIGHTS" });
    window.close();
  });

  btnClearOne.addEventListener("click", async () => {
    const res = await sendToActiveTab({ type: "ENABLE_HIGHLIGHT_REMOVE_MODE" });
    if (!res?.ok) alert(res?.error || "Não foi possível ativar a limpeza individual.");
    window.close();
  });

  btnAddNote.addEventListener("click", async () => {
    const res = await sendToActiveTab({ type: "CREATE_NOTE" });
    if (!res?.ok) alert(res?.error || "Não foi possível adicionar a nota.");
    window.close();
  });

  btnClearNotes.addEventListener("click", async () => {
    if (!confirm("Deseja remover todas as notas desta página?")) return;
    await sendToActiveTab({ type: "CLEAR_NOTES" });
    window.close();
  });
});
