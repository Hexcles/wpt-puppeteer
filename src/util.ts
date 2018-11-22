import Debug from "debug";

export class Logger {
  public debug: Debug.IDebugger;
  public info: Debug.IDebugger;
  public error: Debug.IDebugger;
  public warn: Debug.IDebugger;

  // tslint:disable-next-line:no-console
  public log = console.log;

  constructor(namespace: string) {
    this.debug = Debug(namespace + ":debug");
    this.info = Debug(namespace + ":info");
    this.warn = Debug(namespace + ":warn");
    this.error = Debug(namespace + ":error");
  }
}
