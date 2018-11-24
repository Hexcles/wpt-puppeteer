import { Page } from "puppeteer";

import { Actions, ActionSequence } from "./actions";
import { RawResult, Result, TestsStatus } from "./results";
import { Logger } from "./util";
const logger = new Logger("wptrun.executors");

export class Executor {
  protected timeout?: NodeJS.Timeout;
  protected timeStart?: number;
  protected resolve?: (result: Result) => void;

  constructor(
    protected page: Page,
    protected test: string,
    protected externalTimeout: number,
  ) {}

  public async installBindings() { } 

  public async installTestDriverBindings() {
    await this.page.exposeFunction("_wptrunner_action_sequence_", this.actionSequence.bind(this));

    await this.page.exposeFunction("_wptrunner_click_", this.page.click.bind(this.page));
    await this.page.exposeFunction("_wptrunner_type_", this.page.type.bind(this.page));
  }

  public runTest(url: string): Promise<Result> {
    return new Promise((resolve, reject) => reject("unimplemented"));
  };

  public start(resolve: (result: Result) => void) {
    this.resolve = resolve;
    this.timeout = setTimeout(() => {
      this.resolve!(new Result(this.test, { status: TestsStatus.TIMEOUT }));
    }, this.externalTimeout);
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

export class TestharnessExecutor extends Executor {
  constructor(page: Page, test: string, externalTimeout: number) {
    super(page, test, externalTimeout);
  }

  public async installBindings() {
    await this.page.exposeFunction("_wptrunner_finish_", this.finish.bind(this));
  }

  public runTest(url: string) {
    return new Promise<Result>((resolve) => {
      this.start(resolve);
      this.page.goto(url);
    });
  }
}

declare function _wptrunner_screenshot_(): void;

export class RefTestExecutor extends Executor {
  // This function is executed in browser context.
  public static waitForScreenshot() {
    const root_wait = () => {
      if (!root.classList.contains("reftest-wait")) {
        observer.disconnect();

        if (Document.prototype.hasOwnProperty("fonts")) {
          document.fonts.ready.then(_wptrunner_screenshot_);
        } else {
          _wptrunner_screenshot_();
        }
      }
    }
    const root = document.documentElement!;
    const observer = new MutationObserver(root_wait);
    observer.observe(root, {attributes: true});

    if (document.readyState !== "complete") {
      window.onload = root_wait;
    } else {
      root_wait();
    }
  }

  constructor(page: Page, test: string, externalTimeout: number) {
    super(page, test, externalTimeout);
  }

  public async installBindings() {
    await this.page.exposeFunction("_wptrunner_screenshot_", this.screenshot.bind(this));
  }

  public async screenshot() {
    const image = await this.page.screenshot({encoding: "binary"});
    this.finish({
      status: TestsStatus.OK,
      screenshot: image,
    });
  }

  public runTest(url: string) {
    return new Promise<Result>((resolve) => {
      this.start(resolve);
      this.page.goto(url).then(() => {
        this.page.evaluate(RefTestExecutor.waitForScreenshot);
      });
    });
  }
}
