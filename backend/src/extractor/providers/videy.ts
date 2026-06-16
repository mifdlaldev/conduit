export type ExtractResult = {
  title: string;
  downloadUrl: string;
  headersRequired: Record<string, string>;
  expiresIn: number;
  provider: string;
  deliveryMethod: "direct" | "proxy";
  directDownloadUrl?: string;
};

export function extractVideyId(sourceUrl: string): string | null {
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

export function buildVideyDirectDownloadUrl(videoId: string): string {
  return `https://cdn.videy.co/${encodeURIComponent(videoId)}.mp4`;
}

export function getDirectExtractResult(
  targetUrl: string,
  videyId: string,
): ExtractResult | null {
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
