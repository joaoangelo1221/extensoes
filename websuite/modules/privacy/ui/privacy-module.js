import { getLanguage, translate } from '../../../core/i18n.js';

const language = await getLanguage();
const t = (key, fallback = '') => translate(language, key) || fallback || key;

function sendToActiveTab(message) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return resolve({ ok: false, error: t('noActiveTab', 'Nenhuma aba ativa encontrada.') });
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: t('privacyCurrentTabUnavailable', 'Não foi possível comunicar com a aba atual.') });
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

document.addEventListener('DOMContentLoaded', () => {
  const pwdCurrent = document.getElementById('pwd-current');
  const pwdNew = document.getElementById('pwd-new');
  const btnChangePwd = document.getElementById('btn-change-pwd');
  const blur = document.getElementById('blur');
  const btnLockTab = document.getElementById('btn-lock-tab');
  const btnUnlockTabToggle = document.getElementById('btn-unlock-tab-toggle');
  const btnUnlockTab = document.getElementById('btn-unlock-tab');
  const fieldUnlockOne = document.getElementById('unlock-one');
  const pwdUnlockOne = document.getElementById('pwd-unlock-one');
  const btnLockAll = document.getElementById('btn-lock-all');
  const btnUnlockAllToggle = document.getElementById('btn-unlock-all-toggle');
  const btnUnlockAll = document.getElementById('btn-unlock-all');
  const fieldUnlockAll = document.getElementById('unlock-all');
  const pwdUnlockAll = document.getElementById('pwd-unlock-all');
  const toggleFloatingLock = document.getElementById('toggle-floating-lock');
  const floatingLockOpacity = document.getElementById('floating-lock-opacity');
  const floatingLockOpacityValue = document.getElementById('floating-lock-opacity-value');
  const colorInput = document.getElementById('color');
  const btnHighlight = document.getElementById('btn-highlight');
  const btnClear = document.getElementById('btn-clear');
  const btnClearOne = document.getElementById('btn-clear-one');
  const btnAddNote = document.getElementById('btn-add-note');
  const btnClearNotes = document.getElementById('btn-clear-notes');

  chrome.runtime.sendMessage({ type: 'PRIVACY/GET_STATE' }, (response) => {
    const state = response?.payload || response;
    if (state?.blurAmount != null) blur.value = state.blurAmount;
    toggleFloatingLock.checked = state?.floatingLockEnabled !== false;
    const opacityPercent = Math.round((state?.floatingLockOpacity ?? 0.9) * 100);
    floatingLockOpacity.value = String(opacityPercent);
    floatingLockOpacityValue.textContent = `${opacityPercent}%`;
  });

  btnChangePwd.addEventListener('click', async () => {
    const current = (pwdCurrent.value || '').trim();
    const next = (pwdNew.value || '').trim();
    if (!next) {
      alert(t('privacyEnterNewPassword', 'Informe a nova senha.'));
      return;
    }

    const res = await chrome.runtime.sendMessage({ type: 'PRIVACY/CHANGE_PASSWORD', payload: { current, next } });
    if (!res?.ok) {
      alert(res?.error || t('privacySavePasswordFailed', 'Falha ao salvar senha.'));
      return;
    }

    alert(t('privacyPasswordSaved', 'Senha salva.'));
    pwdCurrent.value = '';
    pwdNew.value = '';
  });

  blur.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'PRIVACY/SET_BLUR_AMOUNT', payload: { amount: Number(blur.value || 6) } });
  });

  toggleFloatingLock.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({ type: 'PRIVACY/SET_FLOATING_LOCK_ENABLED', payload: { enabled: toggleFloatingLock.checked } });
  });

  floatingLockOpacity.addEventListener('input', () => {
    floatingLockOpacityValue.textContent = `${floatingLockOpacity.value}%`;
  });

  floatingLockOpacity.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      type: 'PRIVACY/SET_FLOATING_LOCK_OPACITY',
      payload: { opacity: Number(floatingLockOpacity.value || 90) / 100 },
    });
  });

  btnLockTab.addEventListener('click', async () => {
    const tabId = await getActiveTabId();
    const res = await chrome.runtime.sendMessage({ type: 'PRIVACY/LOCK_CURRENT', payload: { tabId } });
    if (!res?.ok) alert(res?.error || t('privacyLockCurrentFailed', 'Falha ao bloquear esta aba.'));
  });

  btnUnlockTabToggle.addEventListener('click', () => {
    fieldUnlockOne.classList.toggle('hidden');
    if (!fieldUnlockOne.classList.contains('hidden')) pwdUnlockOne.focus();
  });

  btnUnlockTab.addEventListener('click', async () => {
    const tabId = await getActiveTabId();
    const password = pwdUnlockOne.value || '';
    const res = await chrome.runtime.sendMessage({ type: 'PRIVACY/UNLOCK_CURRENT', payload: { tabId, password } });
    if (!res?.ok) alert(res?.error || t('privacyUnlockCurrentFailed', 'Falha ao desbloquear esta aba.'));
    else pwdUnlockOne.value = '';
  });

  btnLockAll.addEventListener('click', async () => {
    if (!confirm(t('privacyConfirmLockAll', 'Deseja bloquear todas as abas agora?'))) return;
    const res = await chrome.runtime.sendMessage({ type: 'PRIVACY/LOCK_ALL' });
    if (!res?.ok) alert(res?.error || t('privacyLockAllFailed', 'Falha ao bloquear todas as abas.'));
  });

  btnUnlockAllToggle.addEventListener('click', () => {
    fieldUnlockAll.classList.toggle('hidden');
    if (!fieldUnlockAll.classList.contains('hidden')) pwdUnlockAll.focus();
  });

  btnUnlockAll.addEventListener('click', async () => {
    if (!confirm(t('privacyConfirmUnlockAll', 'Deseja desbloquear todas as abas agora?'))) return;
    const password = pwdUnlockAll.value || '';
    const res = await chrome.runtime.sendMessage({ type: 'PRIVACY/UNLOCK_ALL', payload: { password } });
    if (!res?.ok) alert(res?.error || t('privacyUnlockAllFailed', 'Falha ao desbloquear todas as abas.'));
    else pwdUnlockAll.value = '';
  });

  btnHighlight.addEventListener('click', async () => {
    const color = colorInput.value || '#fff59d';
    const res = await sendToActiveTab({ type: 'PRIVACY/HIGHLIGHT_SELECTION', payload: { color } });
    if (!res?.ok) alert(res?.error || t('privacyHighlightSelectionRequired', 'Selecione um texto antes de realçar.'));
  });

  btnClear.addEventListener('click', async () => {
    await sendToActiveTab({ type: 'PRIVACY/CLEAR_HIGHLIGHTS' });
  });

  btnClearOne.addEventListener('click', async () => {
    const res = await sendToActiveTab({ type: 'PRIVACY/ENABLE_HIGHLIGHT_REMOVE_MODE' });
    if (!res?.ok) alert(res?.error || t('privacySingleClearFailed', 'Não foi possível ativar a limpeza individual.'));
  });

  btnAddNote.addEventListener('click', async () => {
    const res = await sendToActiveTab({ type: 'PRIVACY/CREATE_NOTE' });
    if (!res?.ok) alert(res?.error || t('privacyAddNoteFailed', 'Não foi possível adicionar a nota.'));
  });

  btnClearNotes.addEventListener('click', async () => {
    if (!confirm(t('privacyConfirmClearNotes', 'Deseja remover todas as notas desta página?'))) return;
    await sendToActiveTab({ type: 'PRIVACY/CLEAR_NOTES' });
  });
});
