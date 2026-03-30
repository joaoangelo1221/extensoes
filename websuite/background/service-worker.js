import { dispatchMessage } from '../core/messaging.js';
import { initializeWorkspaceModule } from '../modules/workspace/workspace-service.js';
import { initializeAutomationModule } from '../modules/automation/automation-service.js';
import { initializePrivacyModule } from '../modules/privacy/privacy-service.js';
import { logger } from '../core/logger.js';

let initialized = false;

async function bootstrap() {
  if (initialized) return;
  await initializeWorkspaceModule();
  await initializeAutomationModule();
  await initializePrivacyModule();
  initialized = true;
  logger.info('core', 'WebSuite inicializada');
}

chrome.runtime.onInstalled.addListener(() => {
  bootstrap().catch((error) => logger.error('core', 'Falha no onInstalled', error));
});

chrome.runtime.onStartup.addListener(() => {
  bootstrap().catch((error) => logger.error('core', 'Falha no onStartup', error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  bootstrap()
    .then(() => dispatchMessage(message, sender))
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

bootstrap().catch((error) => logger.error('core', 'Falha no bootstrap inicial', error));
