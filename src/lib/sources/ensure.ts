import { prisma } from "@/lib/prisma";
import {
  BUILT_IN_SOURCES,
  builtInSource,
  builtInSourceData,
} from "@/lib/sources/registry";

/** Insert any built-in presets that are not in the database yet. */
export async function ensureBuiltInSources(): Promise<string[]> {
  const existing = await prisma.fetchSource.findMany({ select: { key: true } });
  const keys = new Set(existing.map((source) => source.key));
  const missing = BUILT_IN_SOURCES.filter((preset) => !keys.has(preset.key));
  if (missing.length > 0) {
    await prisma.fetchSource.createMany({ data: missing.map(builtInSourceData) });
  }

  const toonily = builtInSource("toonily");
  if (toonily && keys.has("toonily")) {
    const row = await prisma.fetchSource.findUnique({
      where: { key: "toonily" },
      select: {
        supportsSearch: true,
        supportsReading: true,
        isAdultSource: true,
        priority: true,
        notes: true,
        baseUrl: true,
      },
    });
    if (
      row &&
      (row.supportsSearch !== toonily.supportsSearch ||
        row.supportsReading !== toonily.supportsReading ||
        row.isAdultSource !== toonily.isAdultSource ||
        row.priority !== toonily.priority ||
        row.notes !== toonily.notes ||
        row.baseUrl !== toonily.baseUrl)
    ) {
      await prisma.fetchSource.updateMany({
        where: { key: "toonily" },
        data: {
          baseUrl: toonily.baseUrl,
          supportsSearch: toonily.supportsSearch,
          supportsReading: toonily.supportsReading,
          isAdultSource: toonily.isAdultSource,
          priority: toonily.priority,
          notes: toonily.notes,
        },
      });
    }
  }

  return missing.map((preset) => preset.name);
}
