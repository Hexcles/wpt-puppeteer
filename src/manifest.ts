import * as fs from 'fs';
import * as path from 'path';

interface Items {
  manual: {
    [file: string]: Array<URLItem>
  },
  reftest: {
    [file: string]: Array<RefTestItem>
  },
  testharness: {
    [file: string]: Array<URLItem>
  }
}

interface Manifest {
  items: Items
}

type URLItem = [string /* url */, Extras];
type RefTestItem = [string /* url */, Array<Reference>, Extras];
type Reference = [string /* ref_url */, string /* condition */];

interface Extras {
  [key: string]: any,
  timeout?: Timeout,
  testdriver?: boolean,
  jsshell?: boolean,
  viewport_size?: any,
  dpi?: any
}

enum Timeout {
  long = "long",
  normal = "normal"
}

export class ManifestReader {
  manifest: Manifest

  constructor(path: string) {
    const json = JSON.parse(fs.readFileSync(path, {encoding: "utf8"}));
    this.manifest = json;
  }
}
