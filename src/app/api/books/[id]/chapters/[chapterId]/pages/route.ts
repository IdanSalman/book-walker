import { auth } from "@/lib/auth";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { canReadBook } from "@/lib/reader/access";
import { getPageList, isChapterId } from "@/lib/reader/mangadex-source";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; chapterId: string }>;
  },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, chapterId } = await params;
  if (!isChapterId(chapterId)) {
    return Response.json({ error: "Invalid chapter" }, { status: 400 });
  }

  const hideAdult = session.user.hideAdultContent ?? true;
  const [book, userBook] = await Promise.all([
    prisma.book.findUnique({ where: { id } }),
    prisma.userBook.findUnique({
      where: {
        userId_bookId: {
          userId: session.user.id,
          bookId: id,
        },
      },
    }),
  ]);

  if (
    !book ||
    shouldHideAdultBook(hideAdult, book.isAdult) ||
    !userBook ||
    !canReadBook(book, true)
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const dataSaver =
    new URL(request.url).searchParams.get("dataSaver") === "1";

  try {
    const pages = await getPageList(chapterId, dataSaver);
    return Response.json({
      pages: pages.map((page) => ({
        index: page.index,
        url: `/api/reader/image?u=${encodeURIComponent(page.url)}`,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load pages";
    return Response.json({ error: message }, { status: 502 });
  }
}
