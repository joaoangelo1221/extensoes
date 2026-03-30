export const logger = {
  info(scope, message, payload) {
    console.info(`[WebSuite][${scope}] ${message}`, payload ?? '');
  },
  warn(scope, message, payload) {
    console.warn(`[WebSuite][${scope}] ${message}`, payload ?? '');
  },
  error(scope, message, payload) {
    console.error(`[WebSuite][${scope}] ${message}`, payload ?? '');
  },
};
