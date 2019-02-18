# Design of wpt-puppeteer

Author: Robert Ma

## Foreword

This project (`wpt-puppeteer`) was an experimental prototype to explore using Chrome DevTools
Protocol (CDP) more directly to run web-platform-tests (WPT), as part of ["the polypronged approach
to standardization of CDP"][polyprong]. The other parallel experiment was
[`ExecutorCDP`](https://github.com/bocoup/wpt/tree/wptrunner-cdp/tools/pyppeteer) by Mike Pennisi
from Bocoup. `wpt-puppeteer`, as suggested by the name, delegates to the popular
[Puppeteer](https://github.com/GoogleChrome/puppeteer) library to talk CDP, which implies that it is
written in Node.js; `ExecutorCDP`, on the other hand, is integrated into `wptrunner` as an
"executor" (similar to WebDriver, Sauce executors) and handles the protocol itself.

The current conclusion is that both approaches are technically feasible, but `ExecutorCDP` can fit
into the existing Python WPT tools better, so we will first pursue `ExecutorCDP`. Using Puppeteer in
WPT may have its benefits, but the multiprocessing/IPC architecture in WPT needs to be refactored to
avoid having to rewrite the whole test runner in Node.js (also explained in the
[strategy doc][polyprong]).

This doc is converted from some implementation notes during the experimentation and [the demo
presentation][slides] for future reference.

[polyprong]: https://docs.google.com/document/d/1YAy71PUXMe7WdeDooh0nZh85ck8pX0KWzEEyx_zxUPY/preview
[slides]: https://docs.google.com/presentation/d/1ltDm9ntSXWf-N7ynXyZHRGKHQUGEzxkcyodqxl1diwc/edit#slide=id.g484a479ec8_0_1124

## Motivations

The experiment tried to answer the following questions:

* If we were to standardize CDP, it would allow us to use elegant, ergonomic APIs like Puppeteer to
  run WPT. What would it look like?
* Would it be easier to add automation to a Puppeteer-based runner?
* Many web developers say Puppeteer is easier to use than WebDriver. How so?
* How hard is it to replicate the core functionalities of `wptrunner` to run all WPT (including
  those requiring `testdriver.js`)?

## Scope and architecture

The use of Puppeteer requires the project to be written in Node.js. The existing WPT tools are all
in Python, so the prototype unfortunately reimplemented much of `wptrunner`. `wpt-puppeteer` is
essentially a minimal standalone test runner with the following functionalities:

* Loading tests (and metadata) from WPT manifest (but not generating WPT manifest)
* Controlling the browser (Chrome)
* Managing test running and communicating with `testharness.js`
* Implementing `testdriver.js` APIs
* Taking and comparing screenshots (only supporting single-reference reftests)

The prototype is written in Typescript with heavy use of classes and type annotations. It has the
following modules:

* `wptrun`: the entry point of the test runner. The `Runner` class is responsible for managing the
  lifecycle of the browser, loading tests from `manifest` and delegating to the correct `executor`
  to run the tests.
* `manifest`: a strongly typed model of the WPT manifest JSON.
* `results`: strongly typed models of raw results reported by `testharnss.js` and result
  representation (for both testharness tests and reftests) used internally in the runner.
* `executors`: two executors for setting up and running testharness tests and reftests respectively.
* `actions`: implementation of `testdriver.js` APIs, especially action sequence.

## Control mechanism

The control of test running is centered around a two-way communication channel provided by two
Puppeteer APIs:

* [`Page.evaluate`][a1] allows the test runner to run a function in the browser and get the return
  value (i.e. runner -> browser).
* [`Page.exposeFunction`][a2] exposes a function in the test runner to the browser to allow browser
  -> runner communication.

The two APIs are asynchronous (Promise-based), which avoids the complex polling setup in the
upstream WebDriver executor that requires event queues and callbacks. Besides, Puppeteer provides
automatic transparent serialization when crossing contexts between the runner and the browser.
Promises are passed across contexts intuitively. Therefore, the runner can easily use promises to
to get results, handle timeouts and exceptions in the same way.

For testharness tests, the runner installs some private bindings to the test page to be used by our
`testharnessreport.js` override to report test results. When the runner needs to get information
about the test page (e.g. to know when to take reftest screenshots), it evaluates a function in the
test page and handles the returned promise.

[a1]: https://pptr.dev/#?product=Puppeteer&version=v1.10.0&show=api-pageevaluatepagefunction-args
[a2]: https://pptr.dev/#?product=Puppeteer&version=v1.10.0&show=api-pageexposefunctionname-puppeteerfunction

### testdriver.js

[`testdriver.js`](https://web-platform-tests.org/writing-tests/testdriver.html) provides enhanced
automation usable in both testharness tests and reftests. `testdriver-vendor.js` implements these
APIs by calling the bindings exposed by the runner. The `actions` module of the runner essentially
implements the [Actions API](https://w3c.github.io/webdriver/#actions) in the WebDriver spec.

See these [two][s1] [slides][s2] for comparison flowcharts.

[s1]: https://docs.google.com/presentation/d/1ltDm9ntSXWf-N7ynXyZHRGKHQUGEzxkcyodqxl1diwc/edit#slide=id.g48421be0e0_0_16
[s2]: https://docs.google.com/presentation/d/1ltDm9ntSXWf-N7ynXyZHRGKHQUGEzxkcyodqxl1diwc/edit#slide=id.g48421be0e0_0_41

## Results

The experiment ran the full WPT at the same revision locally on a high-performance workstation
against Chrome Dev using `wpt-puppeteer` and the upstream `wptrunner`.

### Performance

* wpt-puppeteer: ~3 hrs
* wptrunner: ~8 hrs

Both used `wptserve` and the same test timeout. However, one caveat is that `wpt-puppeteer` didn’t
restart on unexpected results while `wptrunner` did; this was an oversight in the experiment that
negatively impacted the total run time of `wptrunner`.

One hypothesis is that the bidirectional communication channel of CDP, especially in an event-driven
programming model, is faster than the polling WebDriver model.

### Correctness

Here is a comparison of the test results:
https://staging.wpt.fyi/results/?product=chrome[hexcles]@73167bbb0a&product=chrome[taskcluster]@73167bbb0a&diff

We consider the results produced by the upstream `wptrunner` as the ground truth. The "correctness"
of our `wpt-puppeteer` is its consistency with the upstream runner, which according to the diff is
pretty good.

Caveat: wpt-puppeteer missed a few directories due to my user error.

## Takeaways

* Typescript is awesome!
* Puppeteer is indeed pleasant to use.
    * Its APIs are ergonomic.
    * Using JavaScript on both sides make lots of things easier, more natural.

