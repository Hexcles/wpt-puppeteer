import * as fs from "fs";

interface Items {
  manual: {
    [file: string]: URLItem[],
  };
  reftest: {
    [file: string]: RefTestItem[],
  };
  testharness: {
    [file: string]: URLItem[],
  };
}

interface Manifest {
  items: Items;
}

type URLItem = [string /* url */, Extras];
type RefTestItem = [string /* url */, Reference[], Extras];
type Reference = [string /* ref_url */, string /* condition */];

interface Extras {
  [key: string]: any;
  timeout?: Timeout;
  testdriver?: boolean;
  jsshell?: boolean;
  viewport_size?: any;
  dpi?: any;
}

enum Timeout {
  long = "long",
  normal = "normal",
}

export class ManifestReader {
  public manifest: Manifest;

  constructor(path: string) {
    const json = JSON.parse(fs.readFileSync(path, {encoding: "utf8"}));
    this.manifest = json;
  }
}
