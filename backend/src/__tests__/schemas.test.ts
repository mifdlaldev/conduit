import { describe, it, expect } from "vitest";
import { extractSchema, downloadQuerySchema } from "../extractor/schemas";

// ─── extractSchema ───────────────────────────────────────────────────────

describe("extractSchema", () => {
  describe("valid URLs", () => {
    it.each([
      { url: "https://videqs.download/abc123", label: "videqs.download" },
      { url: "https://playvvip.top/d/xyz", label: "playvvip.top" },
      { url: "https://fwh.is/video", label: "fwh.is" },
      { url: "https://videy.co/v?id=123", label: "videy.co with query" },
      { url: "https://sub.videqs.download/abc", label: "subdomain of videqs.download" },
      { url: "https://sub.playvvip.top/xyz", label: "subdomain of playvvip.top" },
      { url: "https://cdn.videy.co/video", label: "cdn.videy.co" },
    ])("accepts $label — $url", ({ url }) => {
      const result = extractSchema.safeParse({ url });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it.each([
      { input: { url: "" }, label: "empty string" },
      { input: { url: "not-a-url" }, label: "not a URL" },
      { input: { url: "https://youtube.com/watch?v=xxx" }, label: "unsupported domain" },
      { input: { url: "https://example.com/video" }, label: "example.com" },
      { input: { url: "hello" }, label: "random string as URL" },
      { input: {}, label: "missing url field" },
    ])("rejects $label", ({ input }) => {
      const result = extractSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ─── downloadQuerySchema ──────────────────────────────────────────────────

describe("downloadQuerySchema", () => {
  describe("valid inputs", () => {
    it.each([
      {
        input: { source: "https://cdn.example.com/video.mp4", headers: "eyJ0ZXN0IjogInZhbHVlIn0K" },
        label: "source and headers only",
      },
      {
        input: {
          source: "https://cdn.example.com/video.mp4",
          headers: "eyJ0ZXN0IjogInZhbHVlIn0K",
          filename: "my-video",
        },
        label: "source, headers, and filename",
      },
    ])("accepts $label", ({ input }) => {
      const result = downloadQuerySchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it.each([
      { input: {}, label: "missing both source and headers" },
      { input: { headers: "eyJ..." }, label: "missing source" },
      { input: { source: "https://cdn.example.com/video.mp4" }, label: "missing headers" },
      { input: { source: "not-a-url", headers: "eyJ..." }, label: "invalid source URL" },
      { input: { source: "", headers: "eyJ..." }, label: "empty source string" },
      { input: { source: "https://cdn.example.com/video.mp4", headers: "" }, label: "empty headers" },
      {
        input: { source: "https://cdn.example.com/video.mp4", headers: "eyJ...", filename: "" },
        label: "empty filename",
      },
    ])("rejects $label", ({ input }) => {
      const result = downloadQuerySchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
