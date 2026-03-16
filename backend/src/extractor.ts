import { Router, Request, Response } from "express";
import { z } from "zod";
import { chromium, Request as PlaywrightRequest } from "playwright";

export const extractRouter = Router();

// Validation Schema (User Rule 81)
const extractSchema = z.object({
  url: z
    .string()
    .url()
    .refine((val) => val.includes("videqs.download") || val.includes("playvvip.top"), {
      message: "Only videqs.download and playvvip.top URLs are supported",
    }),
});

// Extractor Endpoint
extractRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = extractSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        meta: { status: 400, message: "Validation Error" },
        data: null,
        error: parseResult.error.issues,
      });
      return;
    }

    const targetUrl = parseResult.data.url;

    // Attempt Extraction via Playwright
    let extractedUrl: string | null = null;
    let extractedHeaders: Record<string, string> = {};
    const debugUrls: string[] = [];

    console.log(`Starting extraction for: ${targetUrl}`);

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Listen to network traffic for responses to capture redirects (e.g. 302 to an .mp4)
    page.on("response", (response) => {
      const respUrl = response.url();
      try {
        const urlObj = new URL(respUrl);
        
        // Track unique domains for debug
        if (response.request().resourceType() === "document" || response.request().resourceType() === "iframe" || response.request().resourceType() === "media" || response.request().resourceType() === "xhr" || response.request().resourceType() === "fetch") {
           if (debugUrls.length < 25 && !debugUrls.includes(respUrl)) debugUrls.push(respUrl);
        }

        if (
          urlObj.pathname.endsWith(".m3u8") ||
          urlObj.pathname.endsWith(".mp4")
        ) {
          console.log(`Intercepted Media Stream: ${respUrl}`);
          extractedUrl = respUrl;
          extractedHeaders = response.request().headers();
        }
      } catch (error) {
        // Ignore parsing errors for invalid URLs
      }
    });

    // Navigate to page and wait for a bit to allow dynamic loading
    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for potentially delayed requests (extend slightly for slower networks)
    await page.waitForTimeout(8000);

    await browser.close();

    if (!extractedUrl) {
      res.status(404).json({
        meta: { status: 404, message: "Not Found" },
        data: null,
        error: "Failed to extract video stream from the provided URL.",
        debug: debugUrls
      });
      return;
    }

    // Success Response (User Rule 91: Response Envelope)
    res.status(200).json({
      meta: { status: 200, message: "Success" },
      data: {
        title: "Extracted Video",
        downloadUrl: extractedUrl,
        headersRequired: extractedHeaders,
        expiresIn: 3600,
      },
      error: null,
    });
  } catch (error: any) {
    console.error("Extraction Error:", error);
    res.status(500).json({
      meta: { status: 500, message: "Internal Server Error" },
      data: null,
      error: error.message || "An unexpected error occurred during extraction.",
    });
  }
});
