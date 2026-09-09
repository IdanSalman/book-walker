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

  for (const key of ["toonily", "mangageko"] as const) {
    const preset = builtInSource(key);
    if (!preset || !keys.has(key)) continue;
    const row = await prisma.fetchSource.findUnique({
      where: { key },
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
      (row.supportsSearch !== preset.supportsSearch ||
        row.supportsReading !== preset.supportsReading ||
        row.isAdultSource !== preset.isAdultSource ||
        row.priority !== preset.priority ||
        row.notes !== preset.notes ||
        row.baseUrl !== preset.baseUrl)
    ) {
      await prisma.fetchSource.updateMany({
        where: { key },
        data: {
          baseUrl: preset.baseUrl,
          supportsSearch: preset.supportsSearch,
          supportsReading: preset.supportsReading,
          isAdultSource: preset.isAdultSource,
          priority: preset.priority,
          notes: preset.notes,
        },
      });
    }
  }

  return missing.map((preset) => preset.name);
}
