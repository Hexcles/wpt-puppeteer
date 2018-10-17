"use strict";
const fs = require('fs');
const puppeteer = require('puppeteer');
// Must match TestsStatus.statuses and Test.statuses.
const harness_statuses = ['OK', 'ERROR', 'TIMEOUT'];
const subtest_statuses = ['PASS', 'FAIL', 'TIMEOUT', 'NOTRUN'];
async function closeAllPages(browser) {
    try {
        const pages = await browser.pages();
        await Promise.all(pages.map(page => page.close()));
    }
    catch (e) {
        //console.error(e);
        // happens when running html/
    }
}
async function runSingleTest(browser, url, timeout) {
    // run the test in a new page. no parallel tests in one browser instance
    await closeAllPages(browser);
    const page = await browser.newPage();
    const done = new Promise((resolve, reject) => {
        const start_ms = Date.now();
        // race timeout and test being done
        const timeout_id = setTimeout(() => {
            resolve({ status: harness_statuses.indexOf('TIMEOUT') }); // lol
        }, timeout * 1000);
        // we need a message channel for the page to sent results or
        // testdriver.js commands to us. use console.trace for this.
        // TODO: don't get confused by console/ tests.
        page.on('console', msg => {
            if (msg.type() != 'trace') {
                return;
            }
            const end_ms = Date.now();
            const duration = end_ms - start_ms;
            clearTimeout(timeout_id);
            const results = JSON.parse(msg.text());
            //results.duration = duration;
            resolve(results);
        });
    });
    // TODO: make this not hang if the page hangs when loading
    await page.goto(url);
    return done;
}
async function run() {
    const wptDir = process.argv[2];
    let testPrefix = process.argv[3];
    if (!testPrefix) {
        process.exit(1);
    }
    if (!testPrefix.startsWith('/')) {
        testPrefix = `/${testPrefix}`;
    }
    const browser = await puppeteer.launch({
        //executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        //headless: false,
        defaultViewport: {
            width: 600,
            height: 600,
        }
    });
    const manifest = JSON.parse(fs.readFileSync(`${wptDir}/MANIFEST.json`));
    const report = [];
    for (const [file, tests] of Object.entries(manifest.items.testharness)) {
        for (const [test, info] of tests) {
            if (info.jsshell) {
                continue;
            }
            if (!test.startsWith(testPrefix)) {
                continue;
            }
            if (info.testdriver) {
                // TODO: communicate!
            }
            let use_https = test.includes('.https.') || test.includes('.serviceworker.');
            let test_url;
            if (use_https) {
                test_url = `https://web-platform.test:8443${test}`;
            }
            else {
                test_url = `http://web-platform.test:8000${test}`;
            }
            let timeout = info.timeout === 'long' ? 60 : 10;
            const results = await runSingleTest(browser, test_url, timeout);
            // throw on the same (not known by runSingleTest)
            results.name = test;
            // convert status ints to strings
            results.status = harness_statuses[results.status];
            console.log(`${results.status} ${results.name}`);
            if (results.subtests) {
                for (const subtest of results.subtests) {
                    subtest.status = subtest_statuses[subtest.status];
                    console.log(`  ${subtest.status} ${subtest.name}`);
                }
            }
            report.push(results);
        }
    }
    fs.writeFileSync('wptreport.json', JSON.stringify(report, null, 1) + '\n');
    process.exit(0);
}
run();
