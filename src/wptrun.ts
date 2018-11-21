import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import puppeteer from 'puppeteer';

import { ManifestReader } from './manifest';
import { Logger } from './util';
const logger = new Logger('wptrun');

// Must match testharness.js.
enum TestsStatus {
  OK = 0,
  ERROR = 1,
  TIMEOUT = 2
}

enum TestStatus {
  PASS = 0,
  FAIL = 1,
  TIMEOUT = 2,
  NOTRUN = 3
}

// Must match testharnessreport.js.
interface RawResult {
  status: TestsStatus,
  message?: string | null,
  stack?: any | null,
  duration?: number,
  subtests?: Array<RawSubtestResult> | null,
}

interface RawSubtestResult {
  name: string,
  status: TestStatus,
  message?: string | null,
  stack?: any | null,
}

class Result implements RawResult {
  test: string;
  status: TestsStatus;
  message?: string;
  duration?: number;
  // Do not include stack in report.
  subtests: Array<RawSubtestResult> = [];

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
        this.subtests.push(r);
      }
    }
  }

  toJSON(): Object {
    return Object.assign({}, this, {status: TestsStatus[this.status]})
  }
}

class SubtestResult implements RawSubtestResult {
  name: string;
  status: TestStatus;
  message?: string;
  // Do not include stack in report.

  constructor(result: RawSubtestResult) {
    this.name = result.name;
    this.status = result.status;
    if (result.message) {
      this.message = result.message;
    }
  }

  toJSON(): Object {
    return Object.assign({}, this, {status: TestStatus[this.status]})
  }
}

const default_wpt_dir = path.join(os.homedir(), 'github', 'wpt')

async function closeAllPages(browser: puppeteer.Browser) {
  try {
    const pages = await browser.pages();
    await Promise.all(pages.map(page => page.close()));
  } catch(e) {
    // TODO: happens when running html/
    logger.error(e);
  }
}

async function runSingleTest(browser: puppeteer.Browser, url: string, timeout: number): Promise<RawResult> {
  // run the test in a new page. no parallel tests in one browser instance
  await closeAllPages(browser);
  const page = await browser.newPage();

  const done = new Promise<RawResult>(async (resolve, reject) => {
    const start_ms = Date.now();

    // race timeout and test being done
    const timeout_id = setTimeout(() => {
      resolve({ status: TestsStatus.TIMEOUT }); // lol
    }, timeout * 1000);

    await page.exposeFunction("_wptrunner_finish", (result: RawResult) => {
      clearTimeout(timeout_id);
      const end_ms = Date.now();
      result.duration = end_ms - start_ms;
      logger.debug(result);
      resolve(result);
    });
  });

  // TODO: make this not hang if the page hangs when loading
  await page.goto(url);

  return done;
}

function shouldRun(test: string, testPrefixes: Array<string>) : boolean {
  for (const testPrefix of testPrefixes) {
    if (test.startsWith(testPrefix)) {
      return true;
    }
  }
  return false;
}

async function run() {
  // TODO: Make this a command-line flag.
  const wptDir = default_wpt_dir;
  // argv[0]=node, argv[1]=script
  let testPrefixes = process.argv.slice(2);

  if (testPrefixes.length === 0) {
    testPrefixes.push('');
  }

  for (let i = 0; i < testPrefixes.length; i++) {
    if (!testPrefixes[i].startsWith('/')) {
      testPrefixes[i] = '/' + testPrefixes[i];
    }
  }

  const manifestReader = new ManifestReader(path.join(wptDir, 'MANIFEST.json'));
  const manifest = manifestReader.manifest;

  const browser = await puppeteer.launch({
    //executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    headless: false,
    defaultViewport: {
        width: 800,
        height: 600,
    }
  });

  const results: Array<Result> = [];

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
      // TODO: verify the condition.
      const use_https = test.includes('.https.') || test.includes('.serviceworker.');
      // TODO: verify the port numbers.
      const test_url = use_https ?
        `https://web-platform.test:8443${test}`:
        `http://web-platform.test:8000${test}`;
      // TODO: verify the timeout & apply timeout multipler.
      const timeout = info.timeout === 'long' ? 60 : 10;

      const rawResult = await runSingleTest(browser, test_url, timeout);
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

  fs.writeFileSync('wptreport.json', JSON.stringify({"results": results}) + '\n');

  process.exit(0);
}

run();
