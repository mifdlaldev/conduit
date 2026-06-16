import { Router, Request, Response } from "express";
import { access } from "node:fs/promises";
import { Readable } from "node:stream";
import { z } from "zod";
import { chromium, type Page } from "playwright";

export const extractRouter = Router();

const allowedHostSuffixes = [
  "videqs.download",
  "playvvip.top",
  "fwh.is",
  "videy.co",
  "cdn.videy.co",
];

const browserUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type ExtractResult = {
  title: string;
  downloadUrl: string;
  headersRequired: Record<string, string>;
  expiresIn: number;
  provider: string;
  deliveryMethod: "direct" | "proxy";
  directDownloadUrl?: string;
};

type MediaCandidate = {
  url: string;
  headersRequired: Record<string, string>;
  score: number;
};

const directMediaExtensions = new Set([".m3u8", ".mp4", ".m4v", ".webm", ".mpd", ".mov"]);
const mediaContentTypeMarkers = [
  "video/",
  "audio/",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/dash+xml",
];
const adTrackerHostSuffixes = [
  "doubleclick.net",
  "googlesyndication.com",
  "googletagmanager.com",
  "googletagservices.com",
  "google-analytics.com",
  "profitableratecpm.com",
  "profitablecpmratenetwork.com",
  "protrafficinspector.com",
  "onclckip.com",
  "uuidksinc.net",
  "betweendigital.com",
  "gstcpx.site",
  "awpya.com",
  "nereserv.com",
  "ntvpforever.com",
  "1233130091.com",
  "eff8a530f3.com",
];
const adTrackerHostKeywords = [
  "adservice",
  "analytics",
  "betweendigital",
  "doubleclick",
  "googlesyndication",
  "metric",
  "onclck",
  "profit",
  "track",
];

const extractSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      const hostname = new URL(value).hostname.toLowerCase();
      return allowedHostSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
    }, {
      message: "Only videqs.download, playvvip.top, fwh.is, and videy.co URLs are supported",
    }),
});

const downloadQuerySchema = z.object({
  source: z.string().url(),
  filename: z.string().min(1).max(255).optional(),
  headers: z.string().min(1),
});

function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\-()[\] ]+/g, "_").trim() || "downloaded-video.mp4";
}

function getSuggestedFilename(sourceUrl: string, title?: string) {
  const pathname = new URL(sourceUrl).pathname;
  const fileFromUrl = pathname
    .split("/")
    .filter(Boolean)
    .pop();

  if (fileFromUrl && fileFromUrl.includes(".")) {
    return sanitizeFilename(decodeURIComponent(fileFromUrl));
  }

  if (title) {
    return sanitizeFilename(`${title}.mp4`);
  }

  return "downloaded-video.mp4";
}

function encodeHeaders(headers: Record<string, string>) {
  return Buffer.from(JSON.stringify(headers), "utf8").toString("base64url");
}

function decodeHeaders(encodedHeaders: string) {
  const parsed = JSON.parse(Buffer.from(encodedHeaders, "base64url").toString("utf8"));
  return z.record(z.string(), z.string()).parse(parsed);
}

function buildProxyDownloadUrl(downloadUrl: string, headersRequired: Record<string, string>, title: string) {
  const searchParams = new URLSearchParams({
    source: downloadUrl,
    filename: getSuggestedFilename(downloadUrl, title),
    headers: encodeHeaders(headersRequired),
  });

  return `/api/v1/extract/download?${searchParams.toString()}`;
}

function detectProvider(sourceUrl: string) {
  const hostname = new URL(sourceUrl).hostname.toLowerCase();

  if (hostname === "videy.co" || hostname.endsWith(".videy.co")) {
    return "videy";
  }

  if (hostname === "videqs.download" || hostname.endsWith(".videqs.download")) {
    return "videqs";
  }

  if (hostname === "playvvip.top" || hostname.endsWith(".playvvip.top")) {
    return "playvvip";
  }

  if (hostname === "fwh.is" || hostname.endsWith(".fwh.is")) {
    return "fwh";
  }

  if (hostname === "vidhmm.com" || hostname.endsWith(".vidhmm.com")) {
    return "vidhmm";
  }

  return hostname;
}

function hasDirectMediaExtension(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return Array.from(directMediaExtensions).some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}

function isLikelyMediaContentType(contentType?: string | null) {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return mediaContentTypeMarkers.some((marker) => normalized.includes(marker));
}

function isLikelyAdOrTrackerHost(hostname: string) {
  return adTrackerHostSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
    || adTrackerHostKeywords.some((keyword) => hostname.includes(keyword));
}

function isSameOrigin(sourceUrl: string, compareUrl?: string | null) {
  if (!compareUrl) {
    return false;
  }

  try {
    return new URL(sourceUrl).origin === new URL(compareUrl).origin;
  } catch {
    return false;
  }
}

function isLikelyPlayerFrame(frameUrl?: string | null) {
  if (!frameUrl) {
    return false;
  }

  try {
    const pathname = new URL(frameUrl).pathname.toLowerCase();
    return ["/playvid", "/player", "/embed", "/stream", "/watch"].some((segment) => pathname.includes(segment));
  } catch {
    return false;
  }
}

function sanitizeCapturedHeaders(headers: Record<string, string>) {
  const sanitized: Record<string, string> = {};
  const blockedHeaderNames = new Set([
    "accept-encoding",
    "connection",
    "content-length",
    "host",
    "if-none-match",
    "pragma",
    "range",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "sec-fetch-dest",
    "sec-fetch-mode",
    "sec-fetch-site",
    "sec-fetch-user",
  ]);

  for (const [key, value] of Object.entries(headers)) {
    if (blockedHeaderNames.has(key.toLowerCase())) {
      continue;
    }

    sanitized[key] = value;
  }

  if (!sanitized["user-agent"]) {
    sanitized["user-agent"] = browserUserAgent;
  }

  return sanitized;
}

function buildMediaCandidateScore(params: {
  url: string;
  targetUrl: string;
  frameUrl?: string | null;
  referer?: string | null;
  resourceType?: string | null;
  contentType?: string | null;
  source: "dom" | "response";
}) {
  let score = 0;
  const candidateUrl = new URL(params.url);
  const hostname = candidateUrl.hostname.toLowerCase();
  const targetHostname = new URL(params.targetUrl).hostname.toLowerCase();
  const sameOriginAsTarget = isSameOrigin(params.targetUrl, params.url);
  const noKnownExtension = !hasDirectMediaExtension(params.url);

  if (isLikelyAdOrTrackerHost(hostname)) {
    score -= 1000;
  }

  if (params.source === "dom") {
    score += 500;
  }

  if (params.resourceType === "media") {
    score += 500;
  }

  if (isLikelyMediaContentType(params.contentType)) {
    score += 400;
  }

  if (hasDirectMediaExtension(params.url)) {
    score += 250;
  }

  if (params.frameUrl && isSameOrigin(params.targetUrl, params.frameUrl)) {
    score += 250;
  }

  if (isLikelyPlayerFrame(params.frameUrl)) {
    score += 220;
  }

  if (params.referer && isSameOrigin(params.targetUrl, params.referer)) {
    score += 180;
  }

  if (!sameOriginAsTarget) {
    score += 100;
  }

  if (!sameOriginAsTarget && noKnownExtension) {
    score += 200;
  }

  if (hostname === targetHostname) {
    score -= 150;
  }

  if (hostname === "vidhmm.com" || hostname.endsWith(".vidhmm.com")) {
    score += 250;
  }

  return score;
}

function pickBetterCandidate(current: MediaCandidate | null, next: MediaCandidate) {
  if (!current) {
    return next;
  }

  if (next.score > current.score) {
    return next;
  }

  if (next.score === current.score && Object.keys(next.headersRequired).length > Object.keys(current.headersRequired).length) {
    return next;
  }

  return current;
}

async function collectDomMediaCandidates(page: Page, targetUrl: string) {
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
    } catch {
      // Ignore cross-frame evaluation failures and keep collecting from other frames.
    }
  }

  return candidates;
}

function isLikelyMediaResponse(responseUrl: string, resourceType: string, contentType?: string | null) {
  return resourceType === "media"
    || hasDirectMediaExtension(responseUrl)
    || isLikelyMediaContentType(contentType);
}

function createMissingBrowserError() {
  const error = new Error(
    'Playwright Chromium browser is not installed. Run "npm run playwright:install" in the backend folder, then restart the server.',
  ) as Error & { code?: string };
  error.code = "PLAYWRIGHT_BROWSER_MISSING";
  return error;
}

async function ensureChromiumInstalled() {
  try {
    await access(chromium.executablePath());
  } catch {
    throw createMissingBrowserError();
  }
}

function extractVideyId(sourceUrl: string) {
  const parsedUrl = new URL(sourceUrl);
  const hostname = parsedUrl.hostname.toLowerCase();

  if (hostname === "videy.co" || hostname.endsWith(".videy.co")) {
    const queryId = parsedUrl.searchParams.get("id");
    if (parsedUrl.pathname === "/v" && queryId) {
      return queryId;
    }
  }

  if (hostname === "cdn.videy.co") {
    const filename = parsedUrl.pathname.split("/").filter(Boolean).pop();
    if (filename?.endsWith(".mp4")) {
      return filename.slice(0, -4);
    }
  }

  return null;
}

function buildVideyDirectDownloadUrl(videoId: string) {
  return `https://cdn.videy.co/${encodeURIComponent(videoId)}.mp4`;
}

function getDirectExtractResult(targetUrl: string): ExtractResult | null {
  const videyId = extractVideyId(targetUrl);

  if (!videyId) {
    return null;
  }

  const directDownloadUrl = buildVideyDirectDownloadUrl(videyId);

  return {
    title: `Videy ${videyId}`,
    downloadUrl: directDownloadUrl,
    directDownloadUrl,
    headersRequired: {},
    expiresIn: 3600,
    provider: "videy",
    deliveryMethod: "direct",
  };
}

async function extractVideoStream(targetUrl: string): Promise<ExtractResult> {
  const directResult = getDirectExtractResult(targetUrl);

  if (directResult) {
    console.log(`Resolved direct provider URL without browser: ${directResult.downloadUrl}`);
    return directResult;
  }

  let bestCandidate: MediaCandidate | null = null;
  const debugUrls: string[] = [];

  console.log(`Starting extraction for: ${targetUrl}`);

  await ensureChromiumInstalled();

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

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
          ["document", "iframe", "media", "xhr", "fetch"].includes(resourceType) &&
          debugUrls.length < 25 &&
          !debugUrls.includes(responseUrl)
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
            console.log(`Media candidate score=${candidate.score}: ${responseUrl}`);
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
      console.log(`DOM media candidate score=${candidate.score}: ${candidate.url}`);
    }

    if (!bestCandidate) {
      const error = new Error("Failed to extract video stream from the provided URL.");
      (error as Error & { debug?: string[] }).debug = debugUrls;
      throw error;
    }

    const pageTitle = (await page.title()) || "Extracted Video";
    const provider = detectProvider(bestCandidate.url);
    const directDownloadUrl = provider === "videy" ? bestCandidate.url : undefined;

    return {
      title: pageTitle,
      downloadUrl: bestCandidate.url,
      headersRequired: bestCandidate.headersRequired,
      expiresIn: 3600,
      provider,
      deliveryMethod: directDownloadUrl ? "direct" : "proxy",
      directDownloadUrl,
    };
  } finally {
    await browser.close();
  }
}

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

    const extracted = await extractVideoStream(parseResult.data.url);

    // Success Response (User Rule 91: Response Envelope)
    res.status(200).json({
      meta: { status: 200, message: "Success" },
      data: {
        ...extracted,
        proxyDownloadUrl: extracted.deliveryMethod === "proxy"
          ? buildProxyDownloadUrl(
            extracted.downloadUrl,
            extracted.headersRequired,
            extracted.title,
          )
          : null,
      },
      error: null,
    });
  } catch (error: any) {
    const debug = error?.debug;
    const status = error?.code === "PLAYWRIGHT_BROWSER_MISSING"
      ? 503
      : error?.message === "Failed to extract video stream from the provided URL."
        ? 404
        : 500;

    console.error("Extraction Error:", error);
    res.status(status).json({
      meta: {
        status,
        message: status === 404
          ? "Not Found"
          : status === 503
            ? "Service Unavailable"
            : "Internal Server Error",
      },
      data: null,
      error: error.message || "An unexpected error occurred during extraction.",
      ...(debug ? { debug } : {}),
    });
  }
});

extractRouter.get("/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = downloadQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({
        meta: { status: 400, message: "Validation Error" },
        data: null,
        error: parseResult.error.issues,
      });
      return;
    }

    const { source, filename, headers } = parseResult.data;
    const requestHeaders = decodeHeaders(headers);
    const forwardedHeaders = new Headers();

    for (const [key, value] of Object.entries(requestHeaders)) {
      if (["host", "content-length"].includes(key.toLowerCase())) {
        continue;
      }

      forwardedHeaders.set(key, value);
    }

    forwardedHeaders.set("user-agent", requestHeaders["user-agent"] || browserUserAgent);

    const range = req.header("range");
    if (range) {
      forwardedHeaders.set("range", range);
    }

    const upstreamResponse = await fetch(source, {
      method: "GET",
      headers: forwardedHeaders,
      redirect: "follow",
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      const errorBody = await upstreamResponse.text();
      console.error("Download proxy failed:", upstreamResponse.status, errorBody.slice(0, 500));

      res.status(502).json({
        meta: { status: 502, message: "Bad Gateway" },
        data: null,
        error: "Upstream download request failed.",
      });
      return;
    }

    const finalFilename = sanitizeFilename(filename || getSuggestedFilename(source));
    const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
    const contentLength = upstreamResponse.headers.get("content-length");
    const acceptRanges = upstreamResponse.headers.get("accept-ranges");
    const contentRange = upstreamResponse.headers.get("content-range");

    res.status(upstreamResponse.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);

    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    if (acceptRanges) {
      res.setHeader("Accept-Ranges", acceptRanges);
    }

    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }

    if (!upstreamResponse.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body as globalThis.ReadableStream<Uint8Array>).pipe(res);
  } catch (error: any) {
    console.error("Download Proxy Error:", error);
    res.status(500).json({
      meta: { status: 500, message: "Internal Server Error" },
      data: null,
      error: error.message || "An unexpected error occurred during download.",
    });
  }
});
