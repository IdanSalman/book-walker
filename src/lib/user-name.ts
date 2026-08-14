const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s._-]{1,30}$/u;

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validateDisplayName(value: string): string | null {
  const name = normalizeDisplayName(value);

  if (name.length < 2) {
    return "Name must be at least 2 characters.";
  }
  if (name.length > 32) {
    return "Name must be at most 32 characters.";
  }
  if (!NAME_PATTERN.test(name)) {
    return "Use letters, numbers, spaces, dots, hyphens, or underscores.";
  }

  return null;
}

export async function isDisplayNameTaken(
  name: string,
  excludeUserId?: string,
): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const normalized = normalizeDisplayName(name);

  const existing = await prisma.user.findFirst({
    where: {
      name: { equals: normalized, mode: "insensitive" },
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  return !!existing;
}
