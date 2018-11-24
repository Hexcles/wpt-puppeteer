import * as crypto from "crypto";

// Raw JSON from testharness.js.
// Must match testharness.js.
export enum TestsStatus {
  CRASH = -1,
  OK = 0,
  ERROR = 1,
  TIMEOUT = 2,
}

export enum TestStatus {
  PASS = 0,
  FAIL = 1,
  TIMEOUT = 2,
  NOTRUN = 3,
}

// Must match testharnessreport.js.
export interface RawResult {
  status: TestsStatus | TestStatus;
  message?: string | null;
  stack?: string;
  duration?: number;
  subtests?: RawSubtestResult[] | null;
  screenshot?: Buffer;
}

interface RawSubtestResult {
  name: string;
  status: TestStatus;
  message?: string | null;
  stack?: string;
}

// Implementation

// tslint:disable: object-literal-sort-keys

export class Result implements RawResult {
  public test: string;
  public status: TestsStatus | TestStatus;
  public message?: string;
  public duration?: number;
  public stack?: string;
  public subtests: SubtestResult[] = [];
  public screenshot?: Buffer;

  constructor(test: string, results: RawResult) {
    this.test = test;
    this.status = results.status;
    if (results.message) {
      this.message = results.message;
    }
    if (results.duration) {
      this.duration = results.duration;
    }
    if (results.stack) {
      this.stack = results.stack;
    }
    if (results.screenshot) {
      this.screenshot = results.screenshot;
    }
    if (results.subtests) {
      for (const r of results.subtests) {
        this.subtests.push(new SubtestResult(r));
      }
    }
  }

  public getStatus(): string {
    return this.screenshot ? TestStatus[this.status] : TestsStatus[this.status];
  }

  public toJSON(): object {
    return {
      test: this.test,
      status: this.getStatus(),
      message: this.message,
      duration: this.duration,
      subtests: this.subtests,
      // Do not include stack, screenshot in the report.
    };
  }

  public toString(): string {
    let message = `${this.getStatus()} ${this.test}`;
    if (this.message) {
      message += `: ${this.message}`;
    }
    return message;
  }

  public hashScreen(): string | number {
    if (!this.screenshot) {
      // NaN !== anything
      return NaN;
    }
    const hash = crypto.createHash("sha1");
    hash.update(this.screenshot);
    return hash.digest("hex");
  }
}

class SubtestResult implements RawSubtestResult {
  public name: string;
  public status: TestStatus;
  public message?: string;
  public stack?: string;

  constructor(result: RawSubtestResult) {
    this.name = result.name;
    this.status = result.status;
    if (result.message) {
      this.message = result.message;
    }
    if (result.stack) {
      this.stack = result.stack;
    }
  }

  public toJSON(): object {
    return Object.assign({}, this, {status: TestStatus[this.status]});
    return {
      name: this.name,
      status: TestStatus[this.status],
      message: this.message,
      // Do not include stack in the report.
    };
  }

  public toString(): string {
    let message = `${TestStatus[this.status]} ${this.name}`;
    if (this.message) {
      message += `: ${this.message}`;
    }
    return message;
  }
}
