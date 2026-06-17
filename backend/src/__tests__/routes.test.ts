import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";
import { Readable } from "node:stream";

import { extractRouter } from "../extractor/routes";
import { NoMediaFoundError } from "../extractor/errors";

// Mock the browser module so we never launch actual Playwright
vi.mock("../extractor/browser", () => ({
  extractWithBrowser: vi.fn(),
}));

// Grab the mocked export so we can control it per-test
import { extractWithBrowser } from "../extractor/browser";

// ─── POST / (extract endpoint) ──────────────────────────────────────────────

describe("POST /api/v1/extract", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use("/api/v1/extract", extractRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with data shape for a valid URL", async () => {
    // Use a non-videy provider so deliveryMethod is "proxy"
    const mockResult = {
      url: "https://cdn.fwh.is/abc.mp4",
      headersRequired: { referer: "https://videqs.download/test" },
      title: "Test Video",
      provider: "fwh",
      debugUrls: [],
    };

    vi.mocked(extractWithBrowser).mockResolvedValue(mockResult);

    const res = await supertest(app)
      .post("/api/v1/extract")
      .send({ url: "https://videqs.download/abc" })
      .expect(200);

    expect(res.body.meta.status).toBe(200);
    expect(res.body.data.downloadUrl).toBe("https://cdn.fwh.is/abc.mp4");
    expect(res.body.data.title).toBe("Test Video");
    expect(res.body.data.provider).toBe("fwh");
    expect(res.body.data.deliveryMethod).toBe("proxy");
    expect(res.body.data.proxyDownloadUrl).toContain("/api/v1/extract/download?");
    expect(res.body.data.directDownloadUrl).toBeUndefined();
    expect(res.body.error).toBeNull();
  });

  it("returns 400 for empty body", async () => {
    const res = await supertest(app)
      .post("/api/v1/extract")
      .send({})
      .expect(400);

    expect(res.body.meta.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBeTruthy();
  });

  it("returns 400 for unsupported domain (youtube.com)", async () => {
    const res = await supertest(app)
      .post("/api/v1/extract")
      .send({ url: "https://youtube.com/watch?v=xxx" })
      .expect(400);

    expect(res.body.meta.status).toBe(400);
    expect(res.body.error).toBe("Validation Error");
  });

  it("returns 404 when extractWithBrowser throws NoMediaFoundError", async () => {
    vi.mocked(extractWithBrowser).mockRejectedValue(
      new NoMediaFoundError(["https://debug1.example.com"]),
    );

    const res = await supertest(app)
      .post("/api/v1/extract")
      .send({ url: "https://videqs.download/abc" })
      .expect(404);

    expect(res.body.meta.status).toBe(404);
    expect(res.body.data).toBeNull();
    // The debug array should be present on NoMediaFoundError
    expect(res.body.debug).toEqual(["https://debug1.example.com"]);
  });

  it("returns 200 with direct delivery for a videy.co URL (bypasses browser)", async () => {
    // extractVideyId / getDirectExtractResult are real – they inline-resolve
    // the videy URL so extractWithBrowser is never called.
    const res = await supertest(app)
      .post("/api/v1/extract")
      .send({ url: "https://videy.co/v?id=test123" })
      .expect(200);

    expect(res.body.meta.status).toBe(200);
    expect(res.body.data.deliveryMethod).toBe("direct");
    expect(res.body.data.directDownloadUrl).toBe(
      "https://cdn.videy.co/test123.mp4",
    );
    expect(res.body.data.proxyDownloadUrl).toBeNull();
    expect(res.body.data.provider).toBe("videy");

    // Browser was never called for a direct videy URL
    expect(extractWithBrowser).not.toHaveBeenCalled();
  });
});

// ─── GET /download (proxy download endpoint) ───────────────────────────────

describe("GET /api/v1/extract/download", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use("/api/v1/extract", extractRouter);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with stream for valid query params", async () => {
    // Build a ReadableStream that supertest can consume
    const encoder = new TextEncoder();
    const bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("fake video data"));
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(bodyStream, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": "15",
          "accept-ranges": "bytes",
        },
      }),
    );

    // Base64url-encoded { "referer": "https://example.com/" }
    const headers =
      Buffer.from(JSON.stringify({ referer: "https://example.com/" })).toString(
        "base64url",
      );

    const res = await supertest(app)
      .get("/api/v1/extract/download")
      .query({
        source: "https://cdn.example.com/v.mp4",
        filename: "test-video.mp4",
        headers,
      })
      .expect(200);

    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["content-disposition"]).toContain("test-video.mp4");
    expect(res.headers["content-length"]).toBe("15");
    expect(res.headers["accept-ranges"]).toBe("bytes");

    // Verify upstream fetch was called with correct source
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://cdn.example.com/v.mp4",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns 400 when query params are missing", async () => {
    const res = await supertest(app)
      .get("/api/v1/extract/download")
      .expect(400);

    expect(res.body.meta.status).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBeTruthy();
  });
});
