"use server";

import { Prisma, SourceKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sourceEngine } from "@/lib/reader/resolve";
import type { CatalogCandidate } from "@/lib/reader/types";
import type { ReaderSourceEngine } from "@/lib/reader/source-engine";
import { requireAdmin } from "@/lib/session";
import { sourceBookWhere } from "@/lib/sources/catalog-stats";
import { checkSourceConnection } from "@/lib/sources/health";
import {
  existingCatalogUrls,
  importCatalogCandidate,
  isCatalogConflictError,
  type CatalogConflict,
  type ImportMode,
  type ImportOutcome,
} from "@/lib/sources/import-title";
import { importMangaDexTitle } from "@/lib/sources/mangadex-catalog";
import { withCoverFromSources } from "@/lib/sources/repair-cover";
import {
  fetchMihonCatalog,
  findMihonSourcesById,
  isMihonSourceConfigured,
  MIHON_ADD_LIMIT,
  normalizeSourceHost,
  type MihonCatalogSource,
} from "@/lib/sources/mihon-catalog";
import {
  BUILT_IN_SOURCES,
  builtInSource,
  builtInSourceData,
  canImportFromSource,
  slugifySourceKey,
} from "@/lib/sources/registry";
import { syncBookMetadata } from "@/lib/sync/book-metadata";

export type SourceActionState = {
  error?: string;
  success?: boolean;
  message?: string;
};

const IMPORT_BATCH_LIMIT = 20;
const RESYNC_LIMIT = 25;

const sourceSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  key: z
    .string()
    .min(2, "Key must be at least 2 characters")
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Key may only contain lowercase letters, numbers and dashes"),
  baseUrl: z.string().url("Website must be a valid URL"),
  kind: z.nativeEnum(SourceKind),
  language: z.string().min(2, "Language is required").max(10),
  priority: z.coerce.number().int().min(0).max(1000),
  enabled: z.boolean(),
  supportsSearch: z.boolean(),
  supportsMetadata: z.boolean(),
  supportsReading: z.boolean(),
  isAdultSource: z.boolean(),
  notes: z.string().max(1000).nullable(),
});

function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true";
}

function optionalString(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formToSource(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const key = optionalString(formData, "key") ?? slugifySourceKey(name);

  return {
    name,
    key: key.toLowerCase(),
    baseUrl: String(formData.get("baseUrl") ?? "").trim(),
    kind: formData.get("kind") as SourceKind,
    language: String(formData.get("language") ?? "en").trim(),
    priority: formData.get("priority") ?? 0,
    enabled: checkbox(formData, "enabled"),
    supportsSearch: checkbox(formData, "supportsSearch"),
    supportsMetadata: checkbox(formData, "supportsMetadata"),
    supportsReading: checkbox(formData, "supportsReading"),
    isAdultSource: checkbox(formData, "isAdultSource"),
    notes: optionalString(formData, "notes"),
  };
}

function revalidateSources(sourceId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/sources");
  revalidatePath("/admin/sources/browse");
  if (sourceId) revalidatePath(`/admin/sources/${sourceId}`);
}

function duplicateKey(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function createSource(
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  await requireAdmin();

  const parsed = sourceSchema.safeParse(formToSource(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let sourceId: string;
  try {
    const created = await prisma.fetchSource.create({
      data: parsed.data,
      select: { id: true },
    });
    sourceId = created.id;
  } catch (err) {
    if (duplicateKey(err)) {
      return { error: `A source with the key “${parsed.data.key}” already exists` };
    }
    throw err;
  }

  revalidateSources();
  redirect(`/admin/sources/${sourceId}`);
}

export async function updateSource(
  sourceId: string,
  _prev: SourceActionState,
  formData: FormData,
): Promise<SourceActionState> {
  await requireAdmin();

  const parsed = sourceSchema.safeParse(formToSource(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await prisma.fetchSource.update({
      where: { id: sourceId },
      data: parsed.data,
    });
  } catch (err) {
    if (duplicateKey(err)) {
      return { error: `A source with the key “${parsed.data.key}” already exists` };
    }
    throw err;
  }

  revalidateSources(sourceId);
  return { success: true, message: "Source saved" };
}

export async function deleteSource(sourceId: string): Promise<SourceActionState> {
  await requireAdmin();

  await prisma.fetchSource.delete({ where: { id: sourceId } });
  revalidateSources();
  redirect("/admin/sources");
}

export async function setSourceEnabled(
  sourceId: string,
  enabled: boolean,
): Promise<SourceActionState> {
  await requireAdmin();

  await prisma.fetchSource.update({
    where: { id: sourceId },
    data: { enabled },
  });

  revalidateSources(sourceId);
  return { success: true, message: enabled ? "Source enabled" : "Source disabled" };
}

export async function addBuiltInSource(key: string): Promise<SourceActionState> {
  await requireAdmin();

  const preset = builtInSource(key);
  if (!preset) return { error: "Unknown built-in source" };

  const existing = await prisma.fetchSource.findUnique({
    where: { key: preset.key },
    select: { id: true },
  });
  if (existing) return { error: `${preset.name} is already configured` };

  await prisma.fetchSource.create({ data: builtInSourceData(preset) });

  revalidateSources();
  return { success: true, message: `${preset.name} added` };
}

function uniqueSourceKey(desired: string, taken: Set<string>, baseUrl: string): string {
  if (!taken.has(desired)) return desired;
  const hostKey = slugifySourceKey(normalizeSourceHost(baseUrl));
  const withHost = `${desired}-${hostKey}`.slice(0, 40);
  if (withHost && !taken.has(withHost)) return withHost;
  let index = 2;
  while (taken.has(`${desired}-${index}`.slice(0, 40))) index += 1;
  return `${desired}-${index}`.slice(0, 40);
}

function mihonSourceCreateData(
  source: MihonCatalogSource,
  taken: Set<string>,
) {
  const preset = BUILT_IN_SOURCES.find(
    (item) =>
      item.key === source.suggestedKey ||
      item.name.toLowerCase() === source.name.toLowerCase() ||
      normalizeSourceHost(item.baseUrl) === normalizeSourceHost(source.baseUrl),
  );
  if (preset) {
    return builtInSourceData(preset);
  }

  const key = uniqueSourceKey(source.suggestedKey, taken, source.baseUrl);
  return {
    key,
    name: source.name,
    baseUrl: source.baseUrl,
    kind: "SCRAPER" as const,
    language: source.language,
    priority: 40,
    supportsSearch: true,
    supportsMetadata: false,
    supportsReading: true,
    isAdultSource: source.isAdult,
    notes: `Mihon / Keiyoushi source (${source.packageName} ${source.versionName}).`,
  };
}

export async function addMihonSources(
  ids: string[],
): Promise<SourceActionState> {
  await requireAdmin();

  const selected = [...new Set(ids)].slice(0, MIHON_ADD_LIMIT);
  if (selected.length === 0) return { error: "Select at least one source" };

  const [catalog, existing] = await Promise.all([
    fetchMihonCatalog(),
    prisma.fetchSource.findMany({
      select: { key: true, name: true, baseUrl: true, language: true },
    }),
  ]);

  const sources = findMihonSourcesById(catalog, selected);
  if (sources.length === 0) {
    return { error: "None of the selected sources were found in the Mihon catalog" };
  }

  const taken = new Set(existing.map((row) => row.key));
  const toCreate = sources.filter(
    (source) => !isMihonSourceConfigured(source, existing),
  );
  if (toCreate.length === 0) {
    return { error: "Those sources are already configured" };
  }

  const createdNames: string[] = [];
  for (const source of toCreate) {
    const data = mihonSourceCreateData(source, taken);
    if (taken.has(data.key)) continue;
    await prisma.fetchSource.create({ data });
    taken.add(data.key);
    createdNames.push(data.name);
  }

  if (createdNames.length === 0) {
    return { error: "Those sources are already configured" };
  }

  revalidateSources();
  const skipped = sources.length - createdNames.length;
  const extra =
    skipped > 0
      ? ` Skipped ${skipped} already configured.`
      : "";
  return {
    success: true,
    message:
      createdNames.length === 1
        ? `Added ${createdNames[0]}.${extra}`
        : `Added ${createdNames.length} sources.${extra}`,
  };
}

export async function testSourceConnection(
  sourceId: string,
): Promise<SourceActionState> {
  await requireAdmin();

  const source = await prisma.fetchSource.findUnique({
    where: { id: sourceId },
    select: { id: true, key: true, name: true, baseUrl: true },
  });
  if (!source) return { error: "Source not found" };

  const result = await checkSourceConnection(source);

  await prisma.fetchSource.update({
    where: { id: source.id },
    data: {
      health: result.health,
      lastCheckedAt: new Date(),
      lastLatencyMs: result.latencyMs,
      lastError: result.error,
    },
  });

  revalidateSources(sourceId);

  if (result.health === "ONLINE") {
    return {
      success: true,
      message: `${source.name} responded in ${result.latencyMs} ms`,
    };
  }

  return { error: `${source.name}: ${result.error ?? "unreachable"}` };
}

export async function testAllSources(): Promise<SourceActionState> {
  await requireAdmin();

  const sources = await prisma.fetchSource.findMany({
    select: { id: true, key: true, baseUrl: true },
    orderBy: { priority: "desc" },
  });
  if (sources.length === 0) return { error: "No sources configured yet" };

  const results = await Promise.all(
    sources.map(async (source) => {
      const result = await checkSourceConnection(source);
      await prisma.fetchSource.update({
        where: { id: source.id },
        data: {
          health: result.health,
          lastCheckedAt: new Date(),
          lastLatencyMs: result.latencyMs,
          lastError: result.error,
        },
      });
      return result;
    }),
  );

  const online = results.filter((result) => result.health === "ONLINE").length;
  revalidateSources();

  return {
    success: true,
    message: `Tested ${results.length} source${results.length === 1 ? "" : "s"}: ${online} online`,
  };
}

export type SourceSearchResult = CatalogCandidate & { inCatalog: boolean };

export type SourceSearchState = {
  error?: string;
  results?: SourceSearchResult[];
};

export async function searchSourceCatalog(
  sourceId: string,
  query: string,
): Promise<SourceSearchState> {
  await requireAdmin();

  const source = await prisma.fetchSource.findUnique({
    where: { id: sourceId },
    select: { key: true, name: true, enabled: true, supportsSearch: true, kind: true },
  });
  if (!source) return { error: "Source not found" };
  if (!canImportFromSource(source)) {
    return { error: `${source.name} has no importer yet` };
  }
  if (!source.enabled) {
    return { error: `${source.name} is disabled — enable it to fetch titles` };
  }

  try {
    const engine = await sourceEngine(source.key);
    if (!engine) {
      return { error: `${source.name} has no importer yet` };
    }
    const candidates = await engine.search(query.slice(0, 200));
    const existing = await existingCatalogUrls(
      candidates.map((candidate) => candidate.url),
    );
    return {
      results: candidates.map((candidate) => ({
        ...candidate,
        inCatalog: existing.has(candidate.url),
      })),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Search failed",
    };
  }
}

export async function importSourceTitles(
  sourceId: string,
  mangaIds: string[],
): Promise<SourceActionState> {
  await requireAdmin();

  const source = await prisma.fetchSource.findUnique({
    where: { id: sourceId },
    select: { id: true, key: true, name: true, enabled: true, supportsSearch: true, kind: true },
  });
  if (!source) return { error: "Source not found" };
  if (!canImportFromSource(source)) {
    return { error: `${source.name} has no importer yet` };
  }
  if (!source.enabled) {
    return { error: `${source.name} is disabled — enable it to import` };
  }

  const engine = await sourceEngine(source.key);
  if (!engine) {
    return { error: `${source.name} has no importer yet` };
  }

  const ids = [...new Set(mangaIds)].slice(0, IMPORT_BATCH_LIMIT);
  if (ids.length === 0) return { error: "Select at least one title" };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const mangaId of ids) {
    try {
      const outcome = await importOneTitle(source, mangaId, engine);
      if (outcome.status === "created") created += 1;
      else updated += 1;
    } catch (err) {
      if (isCatalogConflictError(err)) {
        skipped += 1;
        continue;
      }
      errors.push(err instanceof Error ? err.message : "Import failed");
    }
  }

  if (created + updated === 0) {
    if (skipped > 0 && errors.length === 0) {
      return {
        error: `${skipped} selected title${skipped === 1 ? " is" : "s are"} already in the store from another source. Add them one at a time to migrate or save a duplicate.`,
      };
    }
    return { error: errors[0] ?? "Nothing was imported" };
  }

  await prisma.fetchSource.update({
    where: { id: source.id },
    data: {
      lastImportAt: new Date(),
      importedCount: { increment: created },
    },
  });

  revalidateSources(sourceId);
  revalidatePath("/admin/books");
  revalidatePath("/library/add");
  revalidatePath(`/library/add/source/${source.key}`);

  const failed = errors.length > 0 ? ` (${errors.length} failed)` : "";
  const already =
    skipped > 0
      ? ` Skipped ${skipped} already in the store from another source.`
      : "";
  return {
    success: true,
    message: `Imported ${created} new and refreshed ${updated} existing title${
      updated === 1 ? "" : "s"
    }${failed}.${already}`.replace("..", "."),
  };
}

export async function resyncSourceBooks(
  sourceId: string,
): Promise<SourceActionState> {
  await requireAdmin();

  const source = await prisma.fetchSource.findUnique({
    where: { id: sourceId },
    select: { id: true, key: true, name: true },
  });
  if (!source) return { error: "Source not found" };

  const books = await prisma.book.findMany({
    where: {
      AND: [
        sourceBookWhere(source),
        { publicationStatus: { in: ["ONGOING", "HIATUS", "UNKNOWN"] } },
      ],
    },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: RESYNC_LIMIT,
    select: { id: true, title: true, externalId: true, sourceUrl: true },
  });

  if (books.length === 0) {
    return { error: `No unfinished titles from ${source.name} to refresh` };
  }

  let synced = 0;
  const errors: string[] = [];

  for (const book of books) {
    try {
      const result = await syncBookMetadata(book);
      await prisma.book.update({
        where: { id: book.id },
        data: {
          totalPages: result.totalPages,
          publicationStatus: result.publicationStatus,
          sourceUrl: result.sourceUrl ?? book.sourceUrl,
          externalId: result.externalId ?? book.externalId,
          lastSyncedAt: result.lastSyncedAt,
        },
      });
      synced += 1;
    } catch (err) {
      errors.push(
        `${book.title}: ${err instanceof Error ? err.message : "sync failed"}`,
      );
    }
  }

  revalidateSources(sourceId);
  revalidatePath("/admin/books");

  if (synced === 0) {
    return { error: errors[0] ?? "Could not refresh any titles" };
  }

  const failed = errors.length > 0 ? ` (${errors.length} failed)` : "";
  return {
    success: true,
    message: `Refreshed ${synced} of ${books.length} title${
      books.length === 1 ? "" : "s"
    }${failed}`,
  };
}

export async function addMissingBuiltInSources(): Promise<SourceActionState> {
  await requireAdmin();

  const existing = await prisma.fetchSource.findMany({ select: { key: true } });
  const keys = new Set(existing.map((source) => source.key));
  const missing = BUILT_IN_SOURCES.filter((preset) => !keys.has(preset.key));

  if (missing.length === 0) {
    return { error: "All built-in sources are already configured" };
  }

  await prisma.fetchSource.createMany({ data: missing.map(builtInSourceData) });

  revalidateSources();
  return {
    success: true,
    message: `Added ${missing.map((preset) => preset.name).join(", ")}`,
  };
}

export type AddToStoreState = SourceActionState & {
  bookId?: string;
  conflict?: {
    title: string;
    sourceName: string;
    existing: CatalogConflict[];
  };
};

export type AddToStoreOptions = {
  mode?: ImportMode;
  migrateBookId?: string;
};

function storeMessage(outcome: ImportOutcome, sourceName: string): string {
  if (outcome.status === "created") {
    return `Added ${outcome.title} to the store`;
  }
  if (outcome.status === "migrated") {
    return `Moved ${outcome.title} to ${sourceName}`;
  }
  return `Refreshed ${outcome.title} in the store`;
}

export async function addTitleToStore(
  sourceKey: string,
  titleId: string,
  options?: AddToStoreOptions,
): Promise<AddToStoreState> {
  await requireAdmin();

  const source = await prisma.fetchSource.findUnique({
    where: { key: sourceKey },
    select: { id: true, key: true, name: true, enabled: true, supportsSearch: true, kind: true },
  });
  if (!source) {
    const engine = await sourceEngine(sourceKey);
    if (!engine) return { error: "Unknown source" };
    return addTitleToStoreFromEngine(engine.key, engine.name, titleId, options);
  }
  if (!canImportFromSource(source)) {
    return { error: `${source.name} has no importer yet` };
  }
  if (!source.enabled) {
    return { error: `${source.name} is disabled — enable it to import` };
  }

  const engine = await sourceEngine(source.key);
  if (!engine) return { error: `${source.name} has no importer yet` };

  try {
    const outcome = await importOneTitle(source, titleId, engine, options);
    await prisma.fetchSource.update({
      where: { id: source.id },
      data: {
        lastImportAt: new Date(),
        importedCount: { increment: outcome.status === "created" ? 1 : 0 },
      },
    });
    revalidateSources(source.id);
    revalidatePath("/admin/books");
    revalidatePath("/library/add");
    revalidatePath(`/library/add/source/${source.key}`);
    return {
      success: true,
      bookId: outcome.id,
      message: storeMessage(outcome, source.name),
    };
  } catch (err) {
    if (isCatalogConflictError(err)) {
      return {
        conflict: {
          title: err.candidateTitle,
          sourceName: err.incomingSourceName,
          existing: err.existing,
        },
      };
    }
    return { error: err instanceof Error ? err.message : "Import failed" };
  }
}

async function addTitleToStoreFromEngine(
  key: string,
  name: string,
  titleId: string,
  options?: AddToStoreOptions,
): Promise<AddToStoreState> {
  const engine = await sourceEngine(key);
  if (!engine) return { error: "Unknown source" };
  try {
    const outcome = await importOneTitle({ key, name }, titleId, engine, options);
    revalidatePath("/admin/books");
    revalidatePath("/library/add");
    revalidatePath(`/library/add/source/${key}`);
    return {
      success: true,
      bookId: outcome.id,
      message: storeMessage(outcome, name),
    };
  } catch (err) {
    if (isCatalogConflictError(err)) {
      return {
        conflict: {
          title: err.candidateTitle,
          sourceName: err.incomingSourceName,
          existing: err.existing,
        },
      };
    }
    return { error: err instanceof Error ? err.message : "Import failed" };
  }
}

async function importOneTitle(
  source: { key: string; name: string },
  mangaId: string,
  engine: ReaderSourceEngine,
  options?: AddToStoreOptions,
): Promise<ImportOutcome> {
  if (source.key === "mangadex") {
    try {
      return await importMangaDexTitle(mangaId, source.name, options);
    } catch (error) {
      if (isCatalogConflictError(error)) throw error;
      if (!(error instanceof Error) || !/no cover/i.test(error.message)) {
        throw error;
      }
      const candidate = await withCoverFromSources(
        await candidateForImport(engine, mangaId),
        source.key,
      );
      if (!candidate.coverUrl) throw error;
      return importCatalogCandidate(candidate, source.name, options);
    }
  }

  return importCatalogCandidate(
    await withCoverFromSources(
      await candidateForImport(engine, mangaId),
      source.key,
    ),
    source.name,
    {
      ...options,
      externalId: options?.externalId ?? (engine.key === "comick" ? mangaId : null),
    },
  );
}

async function candidateForImport(
  engine: ReaderSourceEngine,
  mangaId: string,
): Promise<CatalogCandidate> {
  if (engine.getById) return engine.getById(mangaId);
  const found = (await engine.search(mangaId))[0];
  if (!found) throw new Error("Title not found");
  return found;
}
