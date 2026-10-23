const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => isDev && console.log(...args),
  info: (...args: any[]) => isDev && console.info(...args),
  debug: (...args: any[]) => isDev && console.debug(...args),
  warn: (...args: any[]) => isDev && console.warn(...args),
  error: (...args: any[]) => isDev && console.error(...args),
};
