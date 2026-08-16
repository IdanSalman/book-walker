"use server";

import { saveReaderProgress } from "@/lib/reader/save-progress";
import { requireUser } from "@/lib/session";

export async function updateReaderProgress(input: {
  bookId: string;
  chapterIndex: number;
  chapterCount: number;
  completedChapter: boolean;
  progressPage: number;
}): Promise<{ error?: string }> {
  const session = await requireUser();
  return saveReaderProgress(session.user.id, input);
}
