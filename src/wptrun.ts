import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import puppeteer from "puppeteer";

import { Executor, TestharnessExecutor, RefTestExecutor } from "./executors";
import { Extras as ManifestInfo, ManifestReader } from "./manifest";
import { TestsStatus, TestStatus, Result } from "./results";
import { Logger } from "./util";
const logger = new Logger("wptrun");

const DEFAULT_WPT_DIR = path.join(os.homedir(), "github", "wpt");
const EXT_TIMEOUT_MULTIPLIER = 2;
const HARNESS_TIMEOUT = {
  long: 60000,
  normal: 10000,
};
const BROWSER_ARGS = [
  "--enable-experimental-web-platform-features",
  "--enable-features=RTCUnifiedPlanByDefaul",
  "--autoplay-policy=no-user-gesture-required",
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  // Without this, serviceworker tests still fail because of HTTPS errors.
  "--ignore-certificate-errors",
];

async function getNewPage(browser: puppeteer.Browser) {
  const oldPages = await browser.pages();
  // Create a new page before closing the old ones to prevent the browser from exiting.
  const newPage = await browser.newPage();
  await Promise.all(oldPages.map((p) => p.close()));
  return newPage;
}

async function runSingleTest(browser: puppeteer.Browser, executor: typeof Executor, test: string, info: ManifestInfo): Promise<Result> {
  // TODO: verify the timeout & apply timeout multipler.
  const externalTimeout = EXT_TIMEOUT_MULTIPLIER * (HARNESS_TIMEOUT[info.timeout || "normal"]);
  const url = getTestURL(test);

  const page = await getNewPage(browser);
  const controller = new executor(page, test, externalTimeout);
  await controller.installBindings();
  if (info.testdriver) {
    await controller.installTestDriverBindings();
  }

  return controller.runTest(url);
}

function shouldRun(test: string, testPrefixes: string[]): boolean {
  for (const testPrefix of testPrefixes) {
    if (test.startsWith(testPrefix)) {
      return true;
    }
  }
  return false;
}

function getTestURL(test: string): string {
  if (test === "about:blank") {
    return test;
  }
  const useHTTPS = test.includes(".https.") || test.includes(".serviceworker.");
  // These are the default port numbers.
  return  useHTTPS ?
    `https://web-platform.test:8443${test}` :
    `http://web-platform.test:8000${test}`;
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
  let browser = await puppeteer.launch({
    // executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    args: BROWSER_ARGS,
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
      if (info.jsshell || !shouldRun(test, testPrefixes)) {
        continue;
      }

      const result: Result = await runSingleTest(browser, TestharnessExecutor, test, info);
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

  browser.close();

  // tslint:disable: object-literal-sort-keys
  browser = await puppeteer.launch({
    args: BROWSER_ARGS,
    headless: false,
    ignoreHTTPSErrors: true,
    // Reftests use a different viewport size.
    defaultViewport: {
        width: 600,
        height: 600,
    },
  });
  // tslint:enable: object-literal-sort-keys

  for (const [file, tests] of Object.entries(manifest.items.reftest)) {
    for (const [test, references, info] of tests) {
      if (!shouldRun(test, testPrefixes) || references.length === 0) {
        continue;
      }

      const testResult: Result = await runSingleTest(browser, RefTestExecutor, test, info);
      logger.debug(testResult);

      if (testResult.status === TestsStatus.OK) {
        testResult.status = TestStatus.FAIL;
        // TODO: Support reference chain.
        for (const [ref, condition] of references) {
          const refResult: Result = await runSingleTest(browser, RefTestExecutor, ref, info);
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

  browser.close();

  fs.writeFileSync("wptreport.json", JSON.stringify({results}) + "\n");
}

run();
