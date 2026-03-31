import { getLanguage, translate } from '../../../core/i18n.js';

const language = await getLanguage();
const t = (key, fallback = '') => translate(language, key) || fallback || key;

const elements = {
  intervalValue: document.getElementById('intervalValue'),
  intervalUnit: document.getElementById('intervalUnit'),
  scopeSelect: document.getElementById('scopeSelect'),
  selectedTabsContainer: document.getElementById('selectedTabsContainer'),
  startBtn: document.getElementById('startBtn'),
  stopAllBtn: document.getElementById('stopAllBtn'),
  advancedPanel: document.getElementById('advancedPanel'),
  cache: document.getElementById('cache'),
  cookies: document.getElementById('cookies'),
  localStorage: document.getElementById('localStorage'),
  sessionStorage: document.getElementById('sessionStorage'),
  clearTab: document.getElementById('clearTab'),
  clearDomain: document.getElementById('clearDomain'),
  clearAll: document.getElementById('clearAll'),
  status: document.getElementById('status'),
  jobs: document.getElementById('jobs')
};

let currentState = { jobs: [], tabs: [] };

function getScopeLabel(scope) {
  if (scope === 'current') return t('currentTab', 'Aba atual');
  if (scope === 'domain') return t('sameDomain', 'Mesmo domínio');
  if (scope === 'selected') return t('selectedTabs', 'Múltiplas abas selecionadas');
  if (scope === 'all') return t('allTabs', 'Todas as abas');
  return scope;
}

function getJobStatusLabel(status) {
  if (status === 'running') return t('automationStatusRunning', 'em execução');
  if (status === 'stopped') return t('automationStatusStopped', 'parado');
  if (status === 'paused') return t('automationStatusPaused', 'pausado');
  return status;
}

function toMs(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (unit === 'hours') return number * 3600 * 1000;
  if (unit === 'minutes') return number * 60 * 1000;
  return number * 1000;
}

function setStatus(message, error = false) {
  elements.status.textContent = message;
  elements.status.style.color = error ? '#ff8787' : '#8be9a8';
}

async function sendMessage(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || t('unknownError', 'Erro desconhecido'));
  return response.payload ?? response;
}

async function sendRefreshStartAction(scope, selectedTabIds, intervalMs) {
  return sendMessage('AUTOMATION/START', { scope, selectedTabIds, intervalMs });
}

function renderTabsSelection(tabs) {
  if (elements.scopeSelect.value !== 'selected') {
    elements.selectedTabsContainer.style.display = 'none';
    elements.selectedTabsContainer.innerHTML = '';
    return;
  }

  elements.selectedTabsContainer.style.display = 'block';
  elements.selectedTabsContainer.innerHTML = tabs
    .filter((tab) => !!tab.id)
    .map(
      (tab) =>
        `<label><input type="checkbox" value="${tab.id}" /> ${tab.title?.slice(0, 40) || t('untitledTab', 'Sem título')}</label>`
    )
    .join('');
}

function getSelectedTabIds() {
  return [...elements.selectedTabsContainer.querySelectorAll('input[type="checkbox"]:checked')].map((el) =>
    Number(el.value)
  );
}

function getSelectedOptions() {
  return {
    cache: elements.cache.checked,
    cookies: elements.cookies.checked,
    localStorage: elements.localStorage.checked,
    sessionStorage: elements.sessionStorage.checked
  };
}

function buildExplanation(scope) {
  const opts = getSelectedOptions();
  const selected = [];

  if (opts.cache) selected.push(t('automationCacheLabel', 'cache'));
  if (opts.cookies) selected.push(t('automationCookiesLabel', 'cookies'));
  if (opts.localStorage) selected.push(t('localStorageLabel', 'armazenamento local'));
  if (opts.sessionStorage) selected.push(t('sessionStorageLabel', 'armazenamento de sessão'));

  if (selected.length === 0) {
    return t('automationNoOptionsSelected', 'Nenhuma opção selecionada.');
  }

  return `${t('automationCleanExplanationPrefix', 'Limpar')} ${selected.join(', ')} ${t('automationCleanExplanationSuffix', 'de')} ${scope}. ${t('automationCleanExplanationImpact', 'Isso irá remover dados armazenados, podendo desconectar sessões e apagar preferências locais.')}`;
}

function updateCleanTooltips() {
  elements.clearTab.title = buildExplanation(t('automationCurrentSiteScope', 'o site atual'));
  elements.clearDomain.title = buildExplanation(t('automationDomainScope', 'o domínio nas abas abertas'));
  elements.clearAll.title = buildExplanation(t('automationBrowserScope', 'todo o navegador'));
}

function renderJobs(jobs) {
  if (!jobs.length) {
    elements.jobs.innerHTML = `<div class="muted">${t('automationNoTimers', 'Nenhum temporizador ativo.')}</div>`;
    return;
  }

  elements.jobs.innerHTML = jobs
    .map(
      (job) => `
      <div class="job">
        <div><strong>${getScopeLabel(job.name)}</strong></div>
        <div class="muted">${t('automationTabsLabel', 'Abas')}: ${job.tabIds.length} | ${t('automationStatusLabel', 'Status')}: ${getJobStatusLabel(job.status)}</div>
        <div>${t('automationNextRun', 'Próxima execução')}: ${job.secondsLeft !== null ? `${job.secondsLeft}s` : '-'}</div>
        <div class="row" style="margin-top:6px">
          <button class="small" data-action="restart" data-id="${job.id}">${t('start', 'Iniciar')}</button>
          <button class="small danger" data-action="stop" data-id="${job.id}">${t('automationStop', 'Parar')}</button>
          <button class="small" data-action="remove" data-id="${job.id}">${t('remove', 'Remover')}</button>
        </div>
      </div>`
    )
    .join('');

  elements.jobs.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.action;
      const jobId = button.dataset.id;
      try {
        if (action === 'restart') await sendMessage('AUTOMATION/RESTART_JOB', { jobId });
        if (action === 'stop') await sendMessage('AUTOMATION/STOP_JOB', { jobId });
        if (action === 'remove') await sendMessage('AUTOMATION/REMOVE_JOB', { jobId });
        await refreshState();
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  });
}

async function refreshState() {
  try {
    const state = await sendMessage('AUTOMATION/GET_STATE');
    currentState = state;
    renderTabsSelection(state.tabs || []);
    renderJobs(state.jobs || []);

    if (state.settings?.defaultIntervalMs) {
      const totalSeconds = Math.round(state.settings.defaultIntervalMs / 1000);
      if (totalSeconds % 3600 === 0) {
        elements.intervalUnit.value = 'hours';
        elements.intervalValue.value = totalSeconds / 3600;
      } else if (totalSeconds % 60 === 0) {
        elements.intervalUnit.value = 'minutes';
        elements.intervalValue.value = totalSeconds / 60;
      } else {
        elements.intervalUnit.value = 'seconds';
        elements.intervalValue.value = totalSeconds;
      }
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

elements.scopeSelect.addEventListener('change', () => renderTabsSelection(currentState.tabs || []));

elements.startBtn.addEventListener('click', async () => {
  try {
    const intervalMs = toMs(elements.intervalValue.value, elements.intervalUnit.value);
    if (intervalMs < 1000 || intervalMs > 24 * 60 * 60 * 1000) {
      throw new Error(t('automationInvalidInterval', 'Intervalo inválido. Use entre 1 segundo e 24 horas.'));
    }

    const scope = elements.scopeSelect.value;
    const selectedTabIds = scope === 'selected' ? getSelectedTabIds() : [];
    const targetTabIds = await sendMessage('AUTOMATION/GET_SCOPE_TABS', { scope, selectedTabIds });

    if (!targetTabIds.length) {
      throw new Error(t('automationNoTabsForScope', 'Nenhuma aba encontrada para o escopo selecionado.'));
    }

    await sendRefreshStartAction(scope, selectedTabIds, intervalMs);

    setStatus(t('automationStarted', 'Atualização automática iniciada.'));
    await refreshState();
  } catch (error) {
    setStatus(error.message, true);
  }
});

elements.stopAllBtn.addEventListener('click', async () => {
  try {
    await sendMessage('AUTOMATION/STOP_ALL');
    setStatus(t('automationStoppedAll', 'Todos os temporizadores foram pausados.'));
    await refreshState();
  } catch (error) {
    setStatus(error.message, true);
  }
});

async function runClean(scope) {
  const scopeLabel = scope === 'current'
    ? t('automationCurrentSiteScope', 'o site atual')
    : scope === 'domain'
      ? t('automationDomainScope', 'o domínio nas abas abertas')
      : t('automationBrowserScope', 'todo o navegador');
  const msg = buildExplanation(scopeLabel);
  if (!confirm(`${msg}\n\n${t('automationCleanConfirm', 'Deseja continuar?')}`)) return;

  try {
    const types = getSelectedOptions();
    await sendMessage('AUTOMATION/CLEAN', { scope, types });
    setStatus(`${t('automationCleanDone', 'Limpeza concluída no escopo')}: ${scopeLabel}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

elements.clearTab.addEventListener('click', () => runClean('current'));
elements.clearDomain.addEventListener('click', () => runClean('domain'));
elements.clearAll.addEventListener('click', () => runClean('all'));

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'AUTOMATION/STATE_CHANGED' && message.payload?.jobs) {
    currentState.jobs = message.payload.jobs;
    renderJobs(message.payload.jobs);
  }
});

['cache', 'cookies', 'localStorage', 'sessionStorage'].forEach((id) => {
  elements[id].addEventListener('change', updateCleanTooltips);
});

updateCleanTooltips();
refreshState();
