const METADATA_HOSTS = [
  "anilist.co",
  "myanimelist.net",
  "kitsu.app",
  "kitsu.io",
];

export function isReadingSourceUrl(
  url: string | null | undefined,
): url is string {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return !METADATA_HOSTS.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}
