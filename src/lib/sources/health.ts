import type { SourceHealth } from "@prisma/client";

import { builtInSource } from "@/lib/sources/registry";

const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "BookWalker/0.1 (personal library reader; admin source health check)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type HealthCheckResult = {
  health: SourceHealth;
  latencyMs: number;
  httpStatus: number | null;
  error: string | null;
};

function classify(status: number): { health: SourceHealth; error: string | null } {
  if (status >= 200 && status < 400) return { health: "ONLINE", error: null };
  if (status === 401 || status === 403) {
    return { health: "DEGRADED", error: `Reachable but blocked (HTTP ${status})` };
  }
  if (status === 429) {
    return { health: "DEGRADED", error: "Rate limited (HTTP 429)" };
  }
  if (status >= 500) {
    return { health: "OFFLINE", error: `Server error (HTTP ${status})` };
  }
  return { health: "DEGRADED", error: `Unexpected response (HTTP ${status})` };
}

export async function checkSourceConnection(source: {
  key: string;
  baseUrl: string;
}): Promise<HealthCheckResult> {
  const builtIn = builtInSource(source.key);
  const url = builtIn?.healthPath ?? source.baseUrl;
  const method = builtIn?.healthMethod ?? "GET";
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "*/*",
        "User-Agent": builtIn?.kind === "SCRAPER" ? BROWSER_UA : USER_AGENT,
        ...(source.key === "toonily"
          ? {
              Cookie: "toonily-mature=1",
              "X-Requested-With": "XMLHttpRequest",
            }
          : {}),
        ...(builtIn?.healthBody
          ? {
              "Content-Type":
                builtIn.healthMethod === "POST" &&
                !builtIn.healthBody.trimStart().startsWith("{")
                  ? "application/x-www-form-urlencoded; charset=UTF-8"
                  : "application/json",
            }
          : {}),
      },
      body: builtIn?.healthBody,
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const { health, error } = classify(res.status);
    return {
      health,
      latencyMs: Date.now() - startedAt,
      httpStatus: res.status,
      error,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const timedOut =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");

    return {
      health: "OFFLINE",
      latencyMs,
      httpStatus: null,
      error: timedOut
        ? `No response within ${TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : "Connection failed",
    };
  }
}
