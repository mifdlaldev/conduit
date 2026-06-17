import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { logger } from "../logger";
import { extractSchema, downloadQuerySchema } from "./schemas";
import {
  decodeHeaders,
  sanitizeFilename,
  getSuggestedFilename,
  browserUserAgent,
  buildProxyDownloadUrl,
} from "./helpers";
import { extractVideyId, getDirectExtractResult, type ExtractResult } from "./providers/videy";
import { extractWithBrowser } from "./browser";
import {
  ExtractError,
  ValidationError,
  NoMediaFoundError,
  BrowserMissingError,
  UpstreamFetchError,
} from "./errors";

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
      throw new ValidationError(parseResult.error.issues);
    }

    const extracted = await extractVideoStream(parseResult.data.url);

    // Success Response
    res.status(200).json({
      meta: { status: 200, message: "Success" },
      data: {
        ...extracted,
        proxyDownloadUrl:
          extracted.deliveryMethod === "proxy"
            ? buildProxyDownloadUrl(
                extracted.downloadUrl,
                extracted.headersRequired,
                extracted.title,
              )
            : null,
      },
      error: null,
    });
  } catch (error: unknown) {
    if (error instanceof ExtractError) {
      const status =
        error instanceof BrowserMissingError
          ? 503
          : error instanceof NoMediaFoundError
            ? 404
            : error.statusCode;

      logger.error({ err: error, status }, "Extraction Error");

      const response: Record<string, unknown> = {
        meta: { status, message: error.message },
        data: null,
        error: error.message,
      };

      if (error.debug) {
        response.debug = error.debug;
      }

      res.status(status).json(response);
      return;
    }

    logger.error({ err: error }, "Unexpected Extraction Error");
    res.status(500).json({
      meta: { status: 500, message: "Internal Server Error" },
      data: null,
      error: "An unexpected error occurred during extraction.",
    });
  }
});

extractRouter.get("/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = downloadQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      throw new ValidationError(parseResult.error.issues);
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

      throw new UpstreamFetchError(upstreamResponse.status);
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

    const nodeStream = Readable.from(upstreamResponse.body);
    nodeStream.pipe(res);
  } catch (error: unknown) {
    if (error instanceof ExtractError) {
      logger.error({ err: error, status: error.statusCode }, "Download Proxy Error");

      const response: Record<string, unknown> = {
        meta: { status: error.statusCode, message: error.message },
        data: null,
        error: error.message,
      };

      if (error.debug) {
        response.debug = error.debug;
      }

      res.status(error.statusCode).json(response);
      return;
    }

    logger.error({ err: error }, "Unexpected Download Proxy Error");
    res.status(500).json({
      meta: { status: 500, message: "Internal Server Error" },
      data: null,
      error: "An unexpected error occurred during download.",
    });
  }
});
