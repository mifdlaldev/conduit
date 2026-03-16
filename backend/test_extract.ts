import { chromium } from 'playwright';

async function testExtraction() {
  const targetUrl = 'https://videqs.download/qcchd98f6k';
  console.log(`Testing extraction for: ${targetUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  let extractedUrl: string | null = null;
  let headers: any = null;

  page.on('request', request => {
    const reqUrl = request.url();
    if (reqUrl.includes('.m3u8') || reqUrl.includes('.mp4')) {
      console.log(`[FOUND] Media Stream: ${reqUrl}`);
      extractedUrl = reqUrl;
      headers = request.headers();
    }
  });

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for the video player to load and make requests
    await page.waitForTimeout(10000); 
  } catch (err) {
    console.error("Navigation error:", err);
  } finally {
    await browser.close();
  }

  if (extractedUrl) {
    console.log("SUCCESS. URL:", extractedUrl);
    console.log("HEADERS:", headers);
  } else {
    console.log("FAILED to find media stream.");
  }
}

testExtraction();
