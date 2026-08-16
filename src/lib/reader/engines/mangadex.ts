import {
  getMangaWithChapters,
  getPageList,
} from "@/lib/reader/mangadex-source";
import type { ReaderSourceEngine } from "@/lib/reader/source-engine";
import {
  browseMangaDex,
  mangaDexCategories,
  searchMangaDexCatalog,
} from "@/lib/sources/mangadex-catalog";

export const mangaDexEngine: ReaderSourceEngine = {
  key: "mangadex",
  name: "MangaDex",
  aliases: ["Manga Dex"],
  hosts: ["mangadex.org"],
  imageHosts: ["mangadex.org", "mangadex.network"],
  search: searchMangaDexCatalog,
  browse: browseMangaDex,
  categories: mangaDexCategories,
  async getById(id) {
    const [candidate] = await searchMangaDexCatalog(id, 1);
    if (!candidate) throw new Error("MangaDex title not found");
    return candidate;
  },
  resolveManga: getMangaWithChapters,
  getPageList,
};
