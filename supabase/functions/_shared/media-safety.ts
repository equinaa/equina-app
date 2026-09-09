import { HttpError } from "./http.ts";

type ScanVerdict = "clean" | "malicious" | "unknown";

type ScanResponse = {
  verdict?: ScanVerdict;
  code?: string;
};

type ScanInput = {
  signedUrl: string;
  mimeType: string;
  byteSize: number;
  sha256: string | null;
};

const scannerRequired = () =>
  (Deno.env.get("MALWARE_SCAN_REQUIRED") ?? "false").toLowerCase() === "true";

export const inspectUploadForMalware = async ({
  signedUrl,
  mimeType,
  byteSize,
  sha256,
}: ScanInput) => {
  const endpoint = Deno.env.get("MALWARE_SCAN_URL");
  const token = Deno.env.get("MALWARE_SCAN_TOKEN");
  const required = scannerRequired();

  if (!endpoint || !token) {
    if (required) {
      throw new HttpError(
        503,
        "File inspection is temporarily unavailable.",
        "media_scan_unavailable",
      );
    }
    return { configured: false, verdict: "unknown" as const };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        downloadUrl: signedUrl,
        mimeType,
        byteSize,
        sha256,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("scanner_provider_failed");
    }

    const result = await response.json() as ScanResponse;
    if (result.verdict === "malicious") {
      throw new HttpError(
        422,
        "This file did not pass the security inspection.",
        "malware_detected",
      );
    }
    if (result.verdict !== "clean") {
      throw new Error(result.code || "scanner_inconclusive");
    }

    return { configured: true, verdict: "clean" as const };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (required) {
      throw new HttpError(
        503,
        "File inspection is temporarily unavailable.",
        "media_scan_unavailable",
      );
    }
    return { configured: true, verdict: "unknown" as const };
  } finally {
    clearTimeout(timeout);
  }
};
