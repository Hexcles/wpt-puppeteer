// Raw JSON from testharness.js.
// Must match testharness.js.
export enum TestsStatus {
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

// Must match testharnessreport.js.
export interface RawResult {
  status: TestsStatus;
  message?: string | null;
  stack?: string;
  duration?: number;
  subtests?: RawSubtestResult[] | null;
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
  public status: TestsStatus;
  public message?: string;
  public duration?: number;
  public stack?: string;
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
    if (results.stack) {
      this.stack = results.stack;
    }
    if (results.subtests) {
      for (const r of results.subtests) {
        this.subtests.push(new SubtestResult(r));
      }
    }
  }

  public toJSON(): object {
    return {
      test: this.test,
      status: TestsStatus[this.status],
      message: this.message,
      duration: this.duration,
      subtests: this.subtests,
      // Do not include stack in the report.
    };
  }

  public toString(): string {
    let message = `${TestsStatus[this.status]} ${this.test}`;
    if (this.message) {
      message += `: ${this.message}`;
    }
    return message;
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
