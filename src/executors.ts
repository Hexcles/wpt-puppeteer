import { Page } from "puppeteer";

import { Actions, ActionSequence } from "./actions";
import { RawResult, Result, TestsStatus } from "./results";
import { Logger } from "./util";
const logger = new Logger("wptrun.executors");

export class RunnerController {
  private timeout?: NodeJS.Timeout;
  private timeStart?: number;
  private resolve?: (result: Result) => void;

  constructor(
    private page: Page,
    private test: string,
  ) {}

  public async installBindings() {
    await this.page.exposeFunction("_wptrunner_finish_", this.finish.bind(this));
  }

  public async installTestDriverBindings() {
    await this.page.exposeFunction("_wptrunner_action_sequence_", this.actionSequence.bind(this));

    await this.page.exposeFunction("_wptrunner_click_", this.page.click.bind(this.page));
    await this.page.exposeFunction("_wptrunner_type_", this.page.type.bind(this.page));
  }

  public start(timeout: number, resolve: (result: Result) => void) {
    this.resolve = resolve;
    this.timeout = setTimeout(() => {
      this.resolve!(new Result(this.test, { status: TestsStatus.TIMEOUT }));
    }, timeout);
    this.timeStart = Date.now();
  }

  public finish(result: RawResult) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    if (this.timeStart) {
      result.duration = Date.now() - this.timeStart;
    }
    logger.debug(result);
    if (this.resolve) {
      this.resolve(new Result(this.test, result));
    }
  }

  public actionSequence(sequence: ActionSequence[]): Promise<void> {
    const actions = new Actions(sequence);
    actions.process();
    return actions.dispatch(this.page);
  }
}
