## How to run

Assume your WPT checkout is at `~/github/wpt`.
First, start `wptserve` with the aliases override from this repo:

```bash
~/github/wpt wpt serve --alias_file ./wptserve.aliases
```

Then in another terminal, build and run the test runner:

```bash
npm install
npm run build
npm lib/wptrun.js [tests you want to run...]
```
