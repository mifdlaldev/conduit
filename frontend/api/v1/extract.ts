import type { VercelRequest, VercelResponse } from "@vercel/node";

const allowedHostSuffixes = [
  "videqs.download",
  "playvvip.top",
  "fwh.is",
  "videy.co",
  "cdn.videy.co",
];

/**
 * Serverless function for Vercel (free tier, no credit card).
 *
 * ARCHITECTURE DECISION — Hybrid 3-Layer:
 *
 *   Layer 1: Vercel (free, always up)
 *     └─ This function: resolves videy.co URLs directly (no Playwright needed)
 *     └─ Other providers return 501 with instructions for local setup
 *
 *   Layer 2: GitHub Codespaces (free, 60h/month)
 *     └─ Full backend with Playwright for all providers
 *     └─ One-click "Open in Codespaces" from README
 *
 *   Layer 3: Local / Docker (forever free)
 *     └─ git clone && docker compose up
 *     └─ 100% functionality, no platform limits
 *
 * Why not deploy Playwright on Vercel?
 *   - Vercel is serverless (max 10s timeout, no persistent processes)
 *   - Playwright Chromium needs ~300MB binary + 1-2GB RAM
 *   - Serverless platforms that support Docker (Render, Fly.io) either
 *     require a credit card or have usage limits that eventually cost
 *
 * This is a deliberate engineering trade-off: the live demo showcases
 * the UI and the "videy.co" flow. Full extraction is available via
 * Codespaces or local clone — both free and no credit card needed.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for the frontend
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      meta: { status: 405, message: "Method Not Allowed" },
      data: null,
      error: "Only POST requests are accepted.",
    });
    return;
  }

  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    res.status(400).json({
      meta: { status: 400, message: "Validation Error" },
      data: null,
      error: "A valid 'url' field is required.",
    });
    return;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // Check if domain is supported at all
    const isSupported = allowedHostSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );

    if (!isSupported) {
      res.status(400).json({
        meta: { status: 400, message: "Validation Error" },
        data: null,
        error: `Unsupported domain: ${hostname}. Only videqs.download, playvvip.top, fwh.is, and videy.co are supported.`,
      });
      return;
    }

    // --- Videy.co direct resolution (no browser needed) ---
    if (hostname === "videy.co" || hostname.endsWith(".videy.co")) {
      const queryId = parsedUrl.searchParams.get("id");
      if (parsedUrl.pathname === "/v" && queryId) {
        const directDownloadUrl = `https://cdn.videy.co/${encodeURIComponent(queryId)}.mp4`;

        res.status(200).json({
          meta: { status: 200, message: "Success" },
          data: {
            title: `Videy ${queryId}`,
            downloadUrl: directDownloadUrl,
            directDownloadUrl,
            headersRequired: {},
            expiresIn: 3600,
            provider: "videy",
            deliveryMethod: "direct",
            proxyDownloadUrl: null,
          },
          error: null,
        });
        return;
      }

      // Videy URL but missing ID
      res.status(404).json({
        meta: { status: 404, message: "Not Found" },
        data: null,
        error: "Could not extract video ID from the provided Videy URL.",
      });
      return;
    }

    // --- Other providers: need Playwright backend ---
    const providerName = hostname.replace(/^.*\./, "");
    const setupGuideUrl =
      "https://github.com/mifdlaldev/conduit#quick-start";

    res.status(501).json({
      meta: { status: 501, message: "Not Implemented" },
      data: null,
      error: [
        `Provider '${hostname}' requires a full backend with Playwright.`,
        "",
        "Two free options (no credit card needed):",
        "",
        "1. GitHub Codespaces (free, 60h/month):",
        "   https://github.com/codespaces/new?repo=mifdlaldev/conduit",
        "",
        `2. Clone & run locally:`,
        `   ${setupGuideUrl}`,
        "",
        "The live demo supports 'videy.co' URLs directly — try one!",
      ].join("\n"),
    });
  } catch {
    res.status(400).json({
      meta: { status: 400, message: "Validation Error" },
      data: null,
      error: "Invalid URL format.",
    });
  }
}
