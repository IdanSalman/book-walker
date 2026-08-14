import { auth } from "@/lib/auth";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hideAdult = session.user.hideAdultContent ?? true;

  const [userBook, ratingStats] = await Promise.all([
    prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId: id,
        },
      },
    }),
    prisma.userBook.aggregate({
      where: { bookId: id, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
  ]);

  if (shouldHideAdultBook(hideAdult, book.isAdult)) {
    return Response.json({ hidden: true });
  }

  return Response.json({
    book,
    userBook,
    ratingStats,
    hidden: false,
  });
}
