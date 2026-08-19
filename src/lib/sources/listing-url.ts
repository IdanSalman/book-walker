const ASURA_HOSTS = ["asurascans.com", "asuracomic.net"];
const ASURA_PATH = /^(comics|series|manga)$/i;
const ASURA_HASH_SUFFIX = /-[a-z0-9]{8}$/i;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isAsuraHost(host: string): boolean {
  return ASURA_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function asuraCanonicalSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url, "https://asurascans.com").pathname;
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2 || !ASURA_PATH.test(parts[0] ?? "")) return null;
    const slug = (parts[1] ?? "").replace(ASURA_HASH_SUFFIX, "").toLowerCase();
    return slug || null;
  } catch {
    return null;
  }
}

/** Stable identity for a source listing URL (host + path, Asura hash ignored). */
export function listingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = hostnameOf(url);
  if (!host) return null;

  if (isAsuraHost(host)) {
    const slug = asuraCanonicalSlug(url);
    return slug ? `asurascans:${slug}` : null;
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

export function listingsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = listingKey(left);
  const b = listingKey(right);
  return a != null && a === b;
}

export function equivalentListingUrls(url: string): string[] {
  const urls = new Set<string>([url]);
  const slug = asuraCanonicalSlug(url);
  if (!slug) return [...urls];

  for (const host of ASURA_HOSTS) {
    for (const kind of ["comics", "series", "manga"]) {
      urls.add(`https://${host}/${kind}/${slug}`);
    }
  }
  return [...urls];
}
