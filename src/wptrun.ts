import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { ArgumentParser } from "argparse";
import puppeteer from "puppeteer";

import { Executor, RefTestExecutor, TestharnessExecutor } from "./executors";
import { Extras as ManifestInfo, ManifestReader } from "./manifest";
import { Result, TestsStatus, TestStatus } from "./results";
import { Logger } from "./util";
const logger = new Logger("wptrun");

const DEFAULT_WPT_DIR = path.join(os.homedir(), "github", "wpt");
const EXT_TIMEOUT_MULTIPLIER = 2;
const HARNESS_TIMEOUT = {
  long: 60000,
  normal: 10000,
};
const BROWSER_ARGS = [
  "--disable-popup-blocking",
  "--enable-experimental-web-platform-features",
  "--enable-features=RTCUnifiedPlanByDefaul",
  "--autoplay-policy=no-user-gesture-required",
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  // Without this, serviceworker tests still fail because of HTTPS errors.
  "--ignore-certificate-errors",
];

class Runner {
  public static async new(headless: boolean): Promise<Runner> {
    return new Runner(headless, await Runner.launchBrowser(headless));
  }

  private static launchBrowser(
    headless: boolean,
    viewport: puppeteer.Viewport = {width: 800, height: 600},
  ): Promise<puppeteer.Browser> {
    // tslint:disable: object-literal-sort-keys
    return puppeteer.launch({
      // executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      args: BROWSER_ARGS,
      headless,
      ignoreHTTPSErrors: true,
      // This only resizes the viewport, not the window.
      defaultViewport: viewport,
    });
  }

  constructor(
    private headless: boolean,
    private browser: puppeteer.Browser,
  ) {}

  public async run(wptDir: string, wptReport: string, testPrefixes: string[]) {
    if (testPrefixes.length === 0) {
      testPrefixes.push("");
    }

    for (let i = 0; i < testPrefixes.length; i++) {
      if (!testPrefixes[i].startsWith("/")) {
        testPrefixes[i] = "/" + testPrefixes[i];
      }
    }

    const manifestReader = new ManifestReader(path.join(wptDir, "MANIFEST.json"));
    const manifest = manifestReader.manifest;

    const results: Result[] = [];

    for (const [file, tests] of Object.entries(manifest.items.testharness)) {
      for (const [test, info] of tests) {
        if (info.jsshell || !this.shouldRun(test, testPrefixes)) {
          continue;
        }

        const result: Result = await this.runSingleTest(TestharnessExecutor, test, info);
        logger.debug(result);
        results.push(result);

        logger.log(result.toString());
        if (result.subtests) {
          for (const subtest of result.subtests) {
            logger.log("  " + subtest.toString());
          }
        }
      }
    }

    // Reftests use a different viewport size.
    await this.restartBrowser({width: 600, height: 600});

    for (const [file, tests] of Object.entries(manifest.items.reftest)) {
      for (const [test, references, info] of tests) {
        if (!this.shouldRun(test, testPrefixes) || references.length === 0) {
          continue;
        }

        const testResult: Result = await this.runSingleTest(RefTestExecutor, test, info);
        logger.debug(testResult);

        if (testResult.status === TestsStatus.OK) {
          testResult.status = TestStatus.FAIL;
          // TODO: Support reference chain.
          for (const [ref, condition] of references) {
            const refResult: Result = await this.runSingleTest(RefTestExecutor, ref, info);
            logger.debug(refResult);

            if (refResult.status === TestsStatus.TIMEOUT) {
              testResult.status = TestsStatus.TIMEOUT;
              testResult.message = "ref timeout";
              break;
            }

            const passed = (condition === "==") === (refResult.hashScreen() === testResult.hashScreen());
            if (passed) {
              testResult.status = TestStatus.PASS;
              break;
            }
          }
        }

        results.push(testResult);
        logger.log(testResult.toString());
      }
    }

    await this.browser.close();

    fs.writeFileSync(wptReport, JSON.stringify({results}) + "\n");
  }

  private async restartBrowser(viewport?: puppeteer.Viewport) {
    logger.debug("Restarting browser...")
    await this.browser.close();
    this.browser = await Runner.launchBrowser(this.headless, viewport);
    logger.debug("Browser restarted.")
  }

  private getCurrentPages(): Promise<puppeteer.Page[]> {
    return new Promise((resolve) => {
      this.browser.pages().then(( pages ) => resolve(pages))
      .catch(() => {
        // Most likely the test page just closed a page. Retry.
        setTimeout(() => {resolve(this.browser.pages()); }, 1000);
      });
    });
  }

  private async getNewPage(): Promise<puppeteer.Page> {
    const oldPages = await this.getCurrentPages();
    // Keep the default blank page to prevent the browser from exiting.
    const promises = [
      Promise.all(oldPages.slice(1).map((p) => p.close())),
      new Promise((resolve) => {setTimeout(resolve, 1000, "timeout"); }),
    ];
    const result = await Promise.race(promises);
    if (result === "timeout") {
      await this.restartBrowser();
    }
    // Create another new page in case the page closes itself.
    return await this.browser.newPage();
  }

  private async runSingleTest(
    executor: typeof Executor,
    test: string,
    info: ManifestInfo): Promise<Result> {
    // TODO: verify the timeout & apply timeout multipler.
    const externalTimeout = EXT_TIMEOUT_MULTIPLIER * (HARNESS_TIMEOUT[info.timeout || "normal"]);
    const url = this.getTestURL(test);

    const page = await this.getNewPage();
    const controller = new executor(page, test, externalTimeout);
    await controller.installBindings();
    if (info.testdriver) {
      await controller.installTestDriverBindings();
    }

    logger.debug("Starting: " + url);
    return controller.runTest(url);
  }

  private shouldRun(test: string, testPrefixes: string[]): boolean {
    for (const testPrefix of testPrefixes) {
      if (test.startsWith(testPrefix)) {
        return true;
      }
    }
    return false;
  }

  private getTestURL(test: string): string {
    if (test === "about:blank") {
      return test;
    }
    const useHTTPS = test.includes(".https.") || test.includes(".serviceworker.");
    // These are the default port numbers.
    return useHTTPS ?
      `https://web-platform.test:8443${test}` :
      `http://web-platform.test:8000${test}`;
  }
}

async function main() {
  const parser = new ArgumentParser({
    addHelp: true,
    description: "Run WPT on Chrome using puppeteer.",
  });
  parser.addArgument("--wpt-dir", {
    defaultValue: DEFAULT_WPT_DIR,
    help: `Path to WPT checkout (default: ${DEFAULT_WPT_DIR})`,
  });
  parser.addArgument("--log-wptreport", {
    defaultValue: "wptreport.json",
    help: "Log wptreport.json to this path (default: wptreport.json).",
  });
  parser.addArgument("--headless", {
    action: "storeTrue",
    defaultValue: false,
    help: "Run in headless mode (default: false).",
  });
  parser.addArgument("TEST", {
    help: "Test prefixes to run",
    nargs: "*",
  });
  const args = parser.parseArgs();
  const runner = await Runner.new(args.headless);
  runner.run(args.wpt_dir, args.log_wptreport, args.TEST);
}

main();
