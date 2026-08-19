import { auth } from "@/lib/auth";
import { isMangaDexImageHost } from "@/lib/cover-url";
import { MD_UUID_RE } from "@/lib/mangadex-api";
import { fetchMangaDexReaderImage } from "@/lib/reader/mangadex-page-image";
import {
  imageRefererForHost,
  isAllowedReaderImageHost,
} from "@/lib/reader/resolve";
import { fetchKeepingReferer } from "@/lib/reader/source-fetch";

const ALLOWED_PROTOCOLS = new Set(["https:"]);
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

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

  let requestedReferer: URL | null = null;
  const rawReferer = new URL(request.url).searchParams.get("r");
  if (rawReferer) {
    try {
      requestedReferer = new URL(rawReferer);
      if (
        requestedReferer.protocol !== "https:" ||
        unsafeHostname(requestedReferer.hostname)
      ) {
        requestedReferer = null;
      }
    } catch {
      requestedReferer = null;
    }
  }

  if (
    !ALLOWED_PROTOCOLS.has(target.protocol) ||
    !(await isAllowedReaderImageHost(
      target.hostname,
      requestedReferer?.hostname,
    )) ||
    unsafeHostname(target.hostname)
  ) {
    return new Response("Blocked host", { status: 400 });
  }

  if (isMangaDexImageHost(target.hostname)) {
    const params = new URL(request.url).searchParams;
    const chapterId = params.get("mdc");
    const dataSaver = params.get("ds") === "1";
    const image = await fetchMangaDexReaderImage(target, {
      chapterId: chapterId && MD_UUID_RE.test(chapterId) ? chapterId : null,
      dataSaver,
    });
    if (!image) {
      return new Response("Image unavailable", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new Response(Buffer.from(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const referer = await imageRefererForHost(target.hostname);
  const pageReferer = requestedReferer
    ? `${requestedReferer.origin}/`
    : referer;

  const upstream = await fetchKeepingReferer(target.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*",
      "User-Agent": BROWSER_UA,
      ...(pageReferer ? { Referer: pageReferer } : {}),
    },
  });

  if (!upstream.ok) {
    return new Response("Image unavailable", {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return new Response("Unexpected content", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
