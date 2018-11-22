import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import puppeteer from "puppeteer";

import { ManifestReader } from "./manifest";
import { Logger } from "./util";
const logger = new Logger("wptrun");

const DEFAULT_WPT_DIR = path.join(os.homedir(), "github", "wpt");

// Must match testharness.js.
enum TestsStatus {
  OK = 0,
  ERROR = 1,
  TIMEOUT = 2,
}

enum TestStatus {
  PASS = 0,
  FAIL = 1,
  TIMEOUT = 2,
  NOTRUN = 3,
}

const HarnessTimeout = {
  long: 60000,
  normal: 10000,
};

const ExternalTimeoutMultiplier = 2;

// Must match testharnessreport.js.
interface RawResult {
  status: TestsStatus;
  message?: string | null;
  stack?: any | null;
  duration?: number;
  subtests?: RawSubtestResult[] | null;
}

interface RawSubtestResult {
  name: string;
  status: TestStatus;
  message?: string | null;
  stack?: any | null;
}

class Result implements RawResult {
  public test: string;
  public status: TestsStatus;
  public message?: string;
  public duration?: number;
  // Do not include stack in report.
  public subtests: SubtestResult[] = [];

  constructor(test: string, results: RawResult) {
    this.test = test;
    this.status = results.status;
    if (results.message) {
      this.message = results.message;
    }
    if (results.duration) {
      this.duration = results.duration;
    }
    if (results.subtests) {
      for (const r of results.subtests) {
        this.subtests.push(new SubtestResult(r));
      }
    }
  }

  public toJSON(): object {
    return Object.assign({}, this, {status: TestsStatus[this.status]});
  }
}

class SubtestResult implements RawSubtestResult {
  public name: string;
  public status: TestStatus;
  public message?: string;
  // Do not include stack in report.

  constructor(result: RawSubtestResult) {
    this.name = result.name;
    this.status = result.status;
    if (result.message) {
      this.message = result.message;
    }
  }

  public toJSON(): object {
    return Object.assign({}, this, {status: TestStatus[this.status]});
  }
}

async function getNewPage(browser: puppeteer.Browser) {
  const oldPages = await browser.pages();
  // Create a new page before closing the old ones to prevent the browser from exiting.
  const newPage = await browser.newPage();
  await Promise.all(oldPages.map((p) => p.close()));
  return newPage;
}

class RunnerController {
  private timeout?: NodeJS.Timeout;
  private timeStart?: number;
  private resolve?: (result: RawResult) => void;

  constructor(
    private page: puppeteer.Page,
  ) {}

  public async installBindings() {
    await this.page.exposeFunction("_wptrunner_finish_", this.finish.bind(this));

    await this.page.exposeFunction("_wptrunner_click_", this.page.click.bind(this.page));
    await this.page.exposeFunction("_wptrunner_type_", this.page.type.bind(this.page));
  }

  public start(timeout: number, resolve: (result: RawResult) => void) {
    this.resolve = resolve;
    this.timeout = setTimeout(() => {
      this.resolve!({ status: TestsStatus.TIMEOUT });
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
      this.resolve(result);
    }
  }
}

async function runSingleTest(browser: puppeteer.Browser, url: string, externalTimeout: number): Promise<RawResult> {
  const page = await getNewPage(browser);
  const controller = new RunnerController(page);
  await controller.installBindings();

  return new Promise<RawResult>(async (resolve, reject) => {
    controller.start(externalTimeout, resolve);
    page.goto(url);
  });
}

function shouldRun(test: string, testPrefixes: string[]): boolean {
  for (const testPrefix of testPrefixes) {
    if (test.startsWith(testPrefix)) {
      return true;
    }
  }
  return false;
}

async function run() {
  // TODO: Make this a command-line flag.
  const wptDir = DEFAULT_WPT_DIR;
  // argv[0]=node, argv[1]=script
  const testPrefixes = process.argv.slice(2);

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

  // tslint:disable: object-literal-sort-keys
  const browser = await puppeteer.launch({
    // executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    // Without this, serviceworker tests still fail because of HTTPS errors.
    args: ["--ignore-certificate-errors"],
    headless: false,
    ignoreHTTPSErrors: true,
    // This only resizes the viewport, not the window.
    defaultViewport: {
        width: 800,
        height: 600,
    },
  });
  // tslint:enable: object-literal-sort-keys

  const results: Result[] = [];

  for (const [file, tests] of Object.entries(manifest.items.testharness)) {
    for (const [test, info] of tests) {
      // Decide whether to run the test.
      if (info.jsshell || !shouldRun(test, testPrefixes)) {
        continue;
      }

      // Setup
      if (info.testdriver) {
        // TODO: communicate!
      }
      const useHTTPS = test.includes(".https.") || test.includes(".serviceworker.");
      // These are the default port numbers.
      const testURL = useHTTPS ?
        `https://web-platform.test:8443${test}` :
        `http://web-platform.test:8000${test}`;
      // TODO: verify the timeout & apply timeout multipler.
      const externalTimeout = ExternalTimeoutMultiplier * (HarnessTimeout[info.timeout || "normal"]);

      const rawResult = await runSingleTest(browser, testURL, externalTimeout);
      const result = new Result(test, rawResult);
      logger.debug(result);
      results.push(result);

      logger.log(`${TestsStatus[result.status]} ${result.test}`);
      if (result.subtests) {
        for (const subtest of result.subtests) {
          logger.log(`  ${TestStatus[subtest.status]} ${subtest.name}`);
        }
      }
    }
  }

  fs.writeFileSync("wptreport.json", JSON.stringify({results}) + "\n");
  browser.close();
}

run();
