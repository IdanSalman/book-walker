import { readFile, stat } from "node:fs/promises";

import { auth } from "@/lib/auth";
import { shouldHideAdultBook } from "@/lib/adult-content";
import { prisma } from "@/lib/prisma";
import { canReadBook } from "@/lib/reader/access";
import { pdfFilePath } from "@/lib/reader/pdf-store";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const bookId = new URL(request.url).searchParams.get("bookId")?.trim() ?? "";
  if (!bookId) {
    return new Response("Invalid book", { status: 400 });
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
    const file = pdfFilePath(bookId);
    const [bytes, info] = await Promise.all([readFile(file), stat(file)]);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("No PDF is stored for this title", { status: 404 });
  }
}
