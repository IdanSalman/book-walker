import { auth } from "@/lib/auth";
import { isMangaDexImageHost } from "@/lib/mangadex-api";

const ALLOWED_PROTOCOLS = new Set(["https:"]);

function unsafeHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "127.0.0.1" || hostname === "::1" || hostname === "0.0.0.0") {
    return true;
  }
  if (/^(10\.|192\.168\.|169\.254\.)/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  return false;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoded = new URL(request.url).searchParams.get("u");
  if (!encoded) {
    return new Response("Missing image", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(encoded);
  } catch {
    return new Response("Invalid image URL", { status: 400 });
  }

  if (
    !ALLOWED_PROTOCOLS.has(target.protocol) ||
    !isMangaDexImageHost(target.hostname) ||
    unsafeHostname(target.hostname)
  ) {
    return new Response("Blocked host", { status: 400 });
  }

  const upstream = await fetch(target, {
    headers: {
      Accept: "image/*,*/*",
      "User-Agent":
        "BookWalker/0.1 (personal library reader; Mihon-compatible MangaDex source)",
    },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new Response("Image unavailable", { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return new Response("Unexpected content", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
