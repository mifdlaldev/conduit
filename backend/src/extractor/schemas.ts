import { z } from "zod";
import { allowedHostSuffixes } from "./helpers";

export const extractSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      let hostname: string;
      try {
        hostname = new URL(value).hostname.toLowerCase();
      } catch {
        return false;
      }
      return allowedHostSuffixes.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
      );
    }, {
      message: "Only videqs.download, playvvip.top, fwh.is, and videy.co URLs are supported",
    }),
});

export const downloadQuerySchema = z.object({
  source: z.string().url(),
  filename: z.string().min(1).max(255).optional(),
  headers: z.string().min(1),
});
