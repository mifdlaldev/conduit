import { chromium, Request as PlaywrightRequest } from 'playwright';

async function testExtraction() {
  const targetUrl = 'https://notsale.playvvip.top/detail/p0urVfAtUL';
  console.log(`Starting extraction test for: ${targetUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Listen to network traffic
  page.on('response', (response) => {
    const respUrl = response.url();
    try {
      const urlObj = new URL(respUrl);
      if (
        urlObj.pathname.endsWith('.m3u8') || 
        urlObj.pathname.endsWith('.mp4')
      ) {
        console.log(`\n✅ Intercepted Media Stream: ${respUrl}`);
        console.log('Headers:', response.request().headers());
      } else if (respUrl.includes('playvidiframe') || respUrl.includes('m?id=')) {
        console.log(`Potential iframe loaded: ${respUrl} [${response.status()}]`);
      } else if (response.status() >= 400 && response.request().resourceType() === 'document') {
        console.log(`Error document loaded: ${respUrl} [${response.status()}]`);
      }
    } catch (e) {
      // invalid URL
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
