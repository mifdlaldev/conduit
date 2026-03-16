import { chromium, Request as PlaywrightRequest } from 'playwright';

async function testExtraction() {
  const targetUrl = 'https://notsale.playvvip.top/BYuuQjRiH8?i=1';
  console.log(`Starting extraction test for: ${targetUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Listen to network traffic
  page.on('request', (request: PlaywrightRequest) => {
    const reqUrl = request.url();
    if (reqUrl.includes('.m3u8') || reqUrl.includes('.mp4')) {
      console.log(`\n✅ Intercepted Media Stream: ${reqUrl}`);
      console.log('Headers:', request.headers());
    } else if (reqUrl.includes('video') || reqUrl.includes('stream') || reqUrl.includes('play')) {
      console.log(`Potential video request: ${reqUrl}`);
    }
  });

  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded completely.');
    await page.waitForTimeout(5000); 
  } catch (err) {
    console.error('Error during navigation:', err);
  } finally {
    await browser.close();
  }
}

testExtraction();
