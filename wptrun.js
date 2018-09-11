const puppeteer = require('puppeteer');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    headless: false,
    defaultViewport: {
        width: 600,
        height: 600,
    }
  });
  const page = await browser.newPage();
  let done = new Promise((resolve, reject) => {
      page.on('console', msg => {
          let x = JSON.parse(msg.text());
          console.log(x);
          resolve();
      });
  });
  await page.goto('http://localhost:8000/fullscreen/api/historical.html');
  await Promise.race([done, sleep(3000)]);
  await browser.close();
})();
