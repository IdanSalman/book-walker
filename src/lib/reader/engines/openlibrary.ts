import {
  getBookPageList,
  OPEN_LIBRARY_KEY,
  OPEN_LIBRARY_NAME,
  resolveBookScan,
  searchOpenLibraryCatalog,
} from "@/lib/reader/openlibrary-source";
import type { ReaderSourceEngine } from "@/lib/reader/source-engine";

export const openLibraryEngine: ReaderSourceEngine = {
  key: OPEN_LIBRARY_KEY,
  name: OPEN_LIBRARY_NAME,
  aliases: ["Internet Archive", "Archive.org"],
  hosts: ["openlibrary.org", "archive.org"],
  imageHosts: ["archive.org"],
  imageReferer: "https://archive.org/",
  search: searchOpenLibraryCatalog,
  resolveManga: resolveBookScan,
  getPageList: getBookPageList,
};
