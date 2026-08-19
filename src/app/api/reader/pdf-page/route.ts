import { auth } from "@/lib/auth";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { canReadBook } from "@/lib/reader/access";
import { renderPdfPageJpeg } from "@/lib/reader/pdf-render";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const bookId = url.searchParams.get("bookId")?.trim() ?? "";
  const index = Number.parseInt(url.searchParams.get("n") ?? "", 10);
  const dataSaver = url.searchParams.get("dataSaver") === "1";

  if (!bookId || !Number.isInteger(index) || index < 0) {
    return new Response("Invalid page", { status: 400 });
  }

  const hideAdult = session.user.hideAdultContent ?? true;
  const [book, userBook] = await Promise.all([
    prisma.book.findUnique({ where: { id: bookId } }),
    prisma.userBook.findUnique({
      where: {
        userId_bookId: { userId: session.user.id, bookId },
      },
    }),
  ]);

  if (
    !book ||
    shouldHideAdultBook(hideAdult, book.isAdult) ||
    !userBook ||
    !canReadBook(book, true)
  ) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const jpeg = await renderPdfPageJpeg(bookId, index, dataSaver);
    return new Response(Buffer.from(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to render page";
    return Response.json({ error: message }, { status: 502 });
  }
}
