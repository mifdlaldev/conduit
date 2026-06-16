import { Router, Request, Response } from "express";
import { Readable } from "node:stream";
import { z } from "zod";

import { logger } from "./logger";
import {
  sanitizeFilename,
  getSuggestedFilename,
  encodeHeaders,
  decodeHeaders,
  buildProxyDownloadUrl,
  browserUserAgent,
} from "./extractor/helpers";
import { extractSchema, downloadQuerySchema } from "./extractor/schemas";
import { extractWithBrowser } from "./extractor/browser";
import {
  extractVideyId,
  getDirectExtractResult,
  type ExtractResult,
} from "./extractor/providers/videy";
import { NoMediaFoundError, BrowserMissingError } from "./extractor/errors";

export const extractRouter = Router();

async function extractVideoStream(targetUrl: string): Promise<ExtractResult> {
  const videyId = extractVideyId(targetUrl);

  if (videyId) {
    const directResult = getDirectExtractResult(targetUrl, videyId);

    if (directResult) {
      logger.info(`Resolved direct provider URL without browser: ${directResult.downloadUrl}`);
      return directResult;
    }
  }

  const browserResult = await extractWithBrowser(targetUrl);
  const isDirect = browserResult.provider === "videy";

  return {
    title: browserResult.title,
    downloadUrl: browserResult.url,
    headersRequired: browserResult.headersRequired,
    expiresIn: 3600,
    provider: browserResult.provider,
    deliveryMethod: isDirect ? "direct" : "proxy",
    directDownloadUrl: isDirect ? browserResult.url : undefined,
  };
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
    const status = error instanceof BrowserMissingError
      ? 503
      : error instanceof NoMediaFoundError
        ? 404
        : 500;

    logger.error({ err: error, status }, "Extraction Error");
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
      logger.error(
        { status: upstreamResponse.status, body: errorBody.slice(0, 500) },
        "Download proxy failed",
      );

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
    logger.error({ err: error }, "Download Proxy Error");
    res.status(500).json({
      meta: { status: 500, message: "Internal Server Error" },
      data: null,
      error: error.message || "An unexpected error occurred during download.",
    });
  }
});
