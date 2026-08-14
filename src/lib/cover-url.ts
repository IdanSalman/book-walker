const MANGADEX_THUMB_RE = /\.(256|512)\.jpg$/i;

export function isMangaDexImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "uploads.mangadex.org" ||
    host.endsWith(".mangadex.org") ||
    host === "mangadex.network" ||
    host.endsWith(".mangadex.network")
  );
}

/** MangaDex serves 256px / 512px JPEG derivatives; other hosts keep the original URL. */
export function coverDisplayUrl(
  coverUrl: string,
  size: 256 | 512 = 256,
): string {
  try {
    const url = new URL(coverUrl);
    if (!isMangaDexImageHost(url.hostname)) return coverUrl;

    if (MANGADEX_THUMB_RE.test(url.pathname)) {
      url.pathname = url.pathname.replace(MANGADEX_THUMB_RE, `.${size}.jpg`);
      return url.toString();
    }

    url.pathname = `${url.pathname}.${size}.jpg`;
    return url.toString();
  } catch {
    return coverUrl;
  }
}
