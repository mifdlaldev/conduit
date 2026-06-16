import { access } from "node:fs/promises";
import { chromium, type Page, type Browser } from "playwright";
import { logger } from "../logger";
import {
  browserUserAgent,
  type MediaCandidate,
  buildMediaCandidateScore,
  detectProvider,
  isLikelyMediaResponse,
  isSameOrigin,
  pickBetterCandidate,
  sanitizeCapturedHeaders,
} from "./helpers";
import { BrowserMissingError, NoMediaFoundError } from "./errors";

export async function ensureChromiumInstalled(): Promise<void> {
  try {
    await access(chromium.executablePath());
  } catch {
    throw new BrowserMissingError();
  }
}

export async function launchBrowser(): Promise<Browser> {
  await ensureChromiumInstalled();

  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function collectDomMediaCandidates(
  page: Page,
  targetUrl: string,
): Promise<MediaCandidate[]> {
  const candidates: MediaCandidate[] = [];
  const fallbackReferer = `${new URL(targetUrl).origin}/`;

  for (const frame of page.frames()) {
    const frameUrl = frame.url();

    if (!frameUrl || !isSameOrigin(targetUrl, frameUrl)) {
      continue;
    }

    try {
      const sourceUrls = new Set<string>();
      const mediaSources = frame.locator("video[src], audio[src], source[src]");
      const mediaSourceCount = await mediaSources.count();

      for (let index = 0; index < mediaSourceCount; index += 1) {
        const source = await mediaSources.nth(index).getAttribute("src");
        if (!source) {
          continue;
        }

        sourceUrls.add(new URL(source, frameUrl).href);
      }

      for (const candidateUrl of sourceUrls) {
        const score = buildMediaCandidateScore({
          url: candidateUrl,
          targetUrl,
          frameUrl,
          referer: fallbackReferer,
          source: "dom",
        });

        candidates.push({
          url: candidateUrl,
          headersRequired: sanitizeCapturedHeaders({
            referer: fallbackReferer,
            "user-agent": browserUserAgent,
          }),
          score,
        });
      }
    } catch (err) {
      logger.debug({ err, frameUrl }, "Failed to evaluate frame");
    }
  }

  return candidates;
}

export async function extractWithBrowser(
  targetUrl: string,
): Promise<{
  url: string;
  headersRequired: Record<string, string>;
  title: string;
  provider: string;
  debugUrls: string[];
}> {
  let bestCandidate: MediaCandidate | null = null;
  const debugUrls: string[] = [];

  logger.info(`Starting extraction for: ${targetUrl}`);

  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({
      userAgent: browserUserAgent,
    });
    const page = await context.newPage();

    page.on("response", (response) => {
      const responseUrl = response.url();

      try {
        const resourceType = response.request().resourceType();
        const contentType = response.headers()["content-type"] || null;
        const frameUrl = response.request().frame()?.url() || null;
        const requestHeaders = response.request().headers();
        const referer = requestHeaders["referer"] || null;

        if (
          ["document", "iframe", "media", "xhr", "fetch"].includes(resourceType)
          && debugUrls.length < 25
          && !debugUrls.includes(responseUrl)
        ) {
          debugUrls.push(responseUrl);
        }

        if (isLikelyMediaResponse(responseUrl, resourceType, contentType)) {
          const candidate: MediaCandidate = {
            url: responseUrl,
            headersRequired: sanitizeCapturedHeaders(requestHeaders),
            score: buildMediaCandidateScore({
              url: responseUrl,
              targetUrl,
              frameUrl,
              referer,
              resourceType,
              contentType,
              source: "response",
            }),
          };

          if (candidate.score > -200) {
            bestCandidate = pickBetterCandidate(bestCandidate, candidate);
            logger.info(`Media candidate score=${candidate.score}: ${responseUrl}`);
          }
        }
      } catch {
        // Ignore parsing errors for malformed URLs returned by third-party pages.
      }
    });

    await page.goto(targetUrl, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    await page.waitForTimeout(8000);

    const domCandidates = await collectDomMediaCandidates(page, targetUrl);
    for (const candidate of domCandidates) {
      bestCandidate = pickBetterCandidate(bestCandidate, candidate);
      logger.info(`DOM media candidate score=${candidate.score}: ${candidate.url}`);
    }

    if (!bestCandidate) {
      throw new NoMediaFoundError(debugUrls);
    }

    const pageTitle = (await page.title()) || "Extracted Video";
    const provider = detectProvider(bestCandidate.url);

    return {
      url: bestCandidate.url,
      headersRequired: bestCandidate.headersRequired,
      title: pageTitle,
      provider,
      debugUrls,
    };
  } finally {
    await browser.close();
  }
}


