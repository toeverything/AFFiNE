import debug from 'debug';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SESSION_KEY = 'affine:debug';

if (typeof window !== 'undefined') {
  const getSessionValue = (key: string) => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const setSessionValue = (key: string, value: string) => {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // ignore if storage is not accessible (e.g., sandboxed renderer)
    }
  };

  // enable debug logs if the URL search string contains `debug`
  // e.g. http://localhost:3000/?debug
  if (window.location.search.includes('debug')) {
    // enable debug logs for the current session
    // since the query string may be removed by the browser after navigations,
    // we need to store the debug flag in sessionStorage
    setSessionValue(SESSION_KEY, 'true');
  }
  if (getSessionValue(SESSION_KEY) === 'true') {
    // enable all debug logs by default
    debug.enable('*');
    console.warn('Debug logs enabled');
  }
  if (BUILD_CONFIG.debug) {
    debug.enable('*,-micromark');
    console.warn('Debug logs enabled');
  }
}

export class DebugLogger {
  private readonly _debug: debug.Debugger;

  constructor(namespace: string) {
    this._debug = debug(namespace);
  }

  set enabled(enabled: boolean) {
    this._debug.enabled = enabled;
  }

  get enabled() {
    return this._debug.enabled;
  }

  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.log('error', message, ...args);
  }

  log(level: LogLevel, message: string, ...args: any[]) {
    this._debug.log = console[level].bind(console);
    this._debug(`[${level.toUpperCase()}] ${message}`, ...args);
  }

  namespace(extra: string) {
    const currentNamespace = this._debug.namespace;
    return new DebugLogger(`${currentNamespace}:${extra}`);
  }
}
