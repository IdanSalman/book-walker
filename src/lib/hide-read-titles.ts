import type { Prisma } from "@prisma/client";

/** Prisma `UserBook` filter that hides completed titles. */
export function hideReadUserBookFilter(
  hideRead: boolean,
  statusFilter?: string,
): Prisma.UserBookWhereInput {
  if (!hideRead || statusFilter) return {};
  return { status: { not: "COMPLETED" } };
}

/** Prisma `Book` filter that hides titles this user has completed. */
export function hideReadStoreBookFilter(
  userId: string,
  hideRead: boolean,
): Prisma.BookWhereInput {
  if (!hideRead) return {};
  return {
    userBooks: {
      none: { userId, status: "COMPLETED" },
    },
  };
}
