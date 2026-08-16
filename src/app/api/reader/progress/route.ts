import { auth } from "@/lib/auth";
import { saveReaderProgress } from "@/lib/reader/save-progress";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid progress" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid progress" }, { status: 400 });
  }

  const {
    bookId,
    chapterIndex,
    chapterCount,
    completedChapter,
    progressPage,
  } = body as Record<string, unknown>;

  if (typeof bookId !== "string" || bookId.length === 0) {
    return Response.json({ error: "Invalid progress" }, { status: 400 });
  }

  const result = await saveReaderProgress(session.user.id, {
    bookId,
    chapterIndex: Number(chapterIndex),
    chapterCount: Number(chapterCount),
    completedChapter: completedChapter === true,
    progressPage: Number(progressPage),
  });

  if (result.error) {
    const status = result.error === "This title is not in your library" ? 404 : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ ok: true });
}
