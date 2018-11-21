import Debug from 'debug';

export class Logger {
  debug: Debug.IDebugger;
  info: Debug.IDebugger;
  error: Debug.IDebugger;
  warn: Debug.IDebugger;

  log = console.log;

  constructor(namespace: string) {
    this.debug = Debug(namespace + ':debug');
    this.info = Debug(namespace + ':info');
    this.warn = Debug(namespace + ':warn');
    this.error = Debug(namespace + ':error');
  }
}
