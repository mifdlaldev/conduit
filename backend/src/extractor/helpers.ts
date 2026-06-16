import { z } from "zod";

// ─── Constants ───────────────────────────────────────────────────────────────

export const allowedHostSuffixes = [
  "videqs.download",
  "playvvip.top",
  "fwh.is",
  "videy.co",
  "cdn.videy.co",
];

export const browserUserAgent =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const directMediaExtensions = new Set([".m3u8", ".mp4", ".m4v", ".webm", ".mpd", ".mov"]);

export const mediaContentTypeMarkers = [
  "video/",
  "audio/",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/dash+xml",
];

export const adTrackerHostSuffixes = [
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

export const adTrackerHostKeywords = [
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

// ─── Types ───────────────────────────────────────────────────────────────────

export type MediaCandidate = {
  url: string;
  headersRequired: Record<string, string>;
  score: number;
};

// ─── Provider Map ────────────────────────────────────────────────────────────

const providerMap: Array<{ hostname: string; provider: string }> = [
  { hostname: "videy.co", provider: "videy" },
  { hostname: "videqs.download", provider: "videqs" },
  { hostname: "playvvip.top", provider: "playvvip" },
  { hostname: "fwh.is", provider: "fwh" },
  { hostname: "vidhmm.com", provider: "vidhmm" },
];

// ─── Pure Helper Functions ───────────────────────────────────────────────────

export function sanitizeFilename(filename: string) {
  return filename.replace(/[^\w.\-()[\] ]+/g, "_").trim() || "downloaded-video.mp4";
}

export function getSuggestedFilename(sourceUrl: string, title?: string) {
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

export function encodeHeaders(headers: Record<string, string>) {
  return Buffer.from(JSON.stringify(headers), "utf8").toString("base64url");
}

export function decodeHeaders(encodedHeaders: string) {
  const parsed = JSON.parse(Buffer.from(encodedHeaders, "base64url").toString("utf8"));
  return z.record(z.string(), z.string()).parse(parsed);
}

export function buildProxyDownloadUrl(
  downloadUrl: string,
  headersRequired: Record<string, string>,
  title: string,
) {
  const searchParams = new URLSearchParams({
    source: downloadUrl,
    filename: getSuggestedFilename(downloadUrl, title),
    headers: encodeHeaders(headersRequired),
  });

  return `/api/v1/extract/download?${searchParams.toString()}`;
}

export function detectProvider(sourceUrl: string) {
  const hostname = new URL(sourceUrl).hostname.toLowerCase();

  for (const entry of providerMap) {
    if (hostname === entry.hostname || hostname.endsWith(`.${entry.hostname}`)) {
      return entry.provider;
    }
  }

  return hostname;
}

export function hasDirectMediaExtension(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return Array.from(directMediaExtensions).some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}

export function isLikelyMediaContentType(contentType?: string | null) {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return mediaContentTypeMarkers.some((marker) => normalized.includes(marker));
}

export function isLikelyAdOrTrackerHost(hostname: string) {
  return (
    adTrackerHostSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
    || adTrackerHostKeywords.some((keyword) => hostname.includes(keyword))
  );
}

export function isSameOrigin(sourceUrl: string, compareUrl?: string | null) {
  if (!compareUrl) {
    return false;
  }

  try {
    return new URL(sourceUrl).origin === new URL(compareUrl).origin;
  } catch {
    return false;
  }
}

export function isLikelyPlayerFrame(frameUrl?: string | null) {
  if (!frameUrl) {
    return false;
  }

  try {
    const pathname = new URL(frameUrl).pathname.toLowerCase();
    return ["/playvid", "/player", "/embed", "/stream", "/watch"].some((segment) =>
      pathname.includes(segment),
    );
  } catch {
    return false;
  }
}

export function sanitizeCapturedHeaders(headers: Record<string, string>) {
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

export function buildMediaCandidateScore(params: {
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

export function pickBetterCandidate(current: MediaCandidate | null, next: MediaCandidate) {
  if (!current) {
    return next;
  }

  if (next.score > current.score) {
    return next;
  }

  if (
    next.score === current.score
    && Object.keys(next.headersRequired).length > Object.keys(current.headersRequired).length
  ) {
    return next;
  }

  return current;
}

export function isLikelyMediaResponse(
  responseUrl: string,
  resourceType: string,
  contentType?: string | null,
) {
  return (
    resourceType === "media"
    || hasDirectMediaExtension(responseUrl)
    || isLikelyMediaContentType(contentType)
  );
}
