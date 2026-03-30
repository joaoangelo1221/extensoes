const handlers = new Map();

export function registerHandler(type, handler) {
  handlers.set(type, handler);
}

export function registerHandlers(map) {
  Object.entries(map).forEach(([type, handler]) => registerHandler(type, handler));
}

export async function dispatchMessage(message, sender) {
  const type = message?.type;
  if (!type || !handlers.has(type)) {
    return { ok: false, error: `Mensagem não reconhecida: ${type || 'sem tipo'}` };
  }
  return handlers.get(type)(message?.payload ?? {}, sender, message);
}

export async function sendRuntimeMessage(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error || 'Falha de comunicação');
  return response;
}
