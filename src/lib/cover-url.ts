const MANGADEX_THUMB_RE = /\.(256|512)\.jpg$/i;

const COVER_REFERERS: { suffix: string; referer: string }[] = [
  { suffix: "asurascans.com", referer: "https://asurascans.com/" },
  { suffix: "asuracomic.net", referer: "https://asurascans.com/" },
  { suffix: "weebcentral.com", referer: "https://weebcentral.com/" },
  { suffix: "lastation.us", referer: "https://weebcentral.com/" },
  { suffix: "planeptune.us", referer: "https://weebcentral.com/" },
  { suffix: "compsci88.com", referer: "https://weebcentral.com/" },
  { suffix: "2xstorage.com", referer: "https://www.manganato.gg/" },
  { suffix: "waitst.com", referer: "https://www.manganato.gg/" },
  { suffix: "mkklcdnv6temp.com", referer: "https://www.natomanga.com/" },
  { suffix: "mkklcdnv6temp.xyz", referer: "https://www.natomanga.com/" },
  { suffix: "manganato.com", referer: "https://www.manganato.gg/" },
  { suffix: "natomanga.com", referer: "https://www.natomanga.com/" },
  { suffix: "nelomanga.com", referer: "https://www.nelomanga.com/" },
  { suffix: "nelomanga.net", referer: "https://www.nelomanga.net/" },
  { suffix: "manganato.gg", referer: "https://www.manganato.gg/" },
  { suffix: "comick.pictures", referer: "https://comick.dev/" },
  { suffix: "comicknew.pictures", referer: "https://comick.dev/" },
  { suffix: "comick.dev", referer: "https://comick.dev/" },
  { suffix: "comick.io", referer: "https://comick.dev/" },
  { suffix: "wsrv.nl", referer: "https://mistscans.com/" },
  { suffix: "meowing.org", referer: "https://mistscans.com/" },
  { suffix: "mistscans.com", referer: "https://mistscans.com/" },
  { suffix: "keyoapp.com", referer: "https://mistscans.com/" },
];

export function isMangaDexImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "uploads.mangadex.org" ||
    host.endsWith(".mangadex.org") ||
    host === "mangadex.network" ||
    host.endsWith(".mangadex.network")
  );
}

export function coverRefererForHost(hostname: string): string | undefined {
  const host = hostname.toLowerCase();
  return COVER_REFERERS.find(
    (entry) => host === entry.suffix || host.endsWith(`.${entry.suffix}`),
  )?.referer;
}

export function isHotlinkCoverHost(hostname: string): boolean {
  return coverRefererForHost(hostname) != null;
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

/**
 * Browser-facing cover URL. MangaDex thumbs load directly; other CDNs go through
 * the image proxy so Referer/Origin from this site cannot blank the image.
 */
export function coverSrc(
  coverUrl: string,
  size: 256 | 512 = 256,
  referer?: string,
): string {
  const display = coverDisplayUrl(coverUrl, size).trim();
  if (!display) return display;
  if (display.startsWith("/")) return display;

  try {
    const url = new URL(display);
    if (isMangaDexImageHost(url.hostname)) return display;
    const proxyReferer = referer || coverRefererForHost(url.hostname);
    if (!proxyReferer) return display;
    const params = new URLSearchParams({ u: display, r: proxyReferer });
    return `/api/reader/image?${params.toString()}`;
  } catch {
    return display;
  }
}
