import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampedScrollTop,
  mergeSavedView,
  parseView,
  readStoredView,
  resolveChapterRestore,
  restoreIsComplete,
  snapshotChapterView,
  tickRestore,
  viewStorageKey,
  writeStoredView,
} from "./view-restore";

describe("chapter view restore when changing pages", () => {
  it("saves the leave position and restores it after returning", () => {
    const views = new Map<string, ReturnType<typeof snapshotChapterView>>();
    views.set(
      "chapter-a",
      snapshotChapterView({ pageIndex: 0, scrollY: 4320 }),
    );

    const nextChapter = resolveChapterRestore({
      saved: views.get("chapter-b"),
      preferEnd: false,
      pageCount: 12,
    });
    assert.equal(nextChapter.scroll, 0);
    assert.equal(nextChapter.pageIndex, 0);

    const back = resolveChapterRestore({
      saved: views.get("chapter-a"),
      preferEnd: false,
      pageCount: 12,
    });
    assert.equal(back.scroll, 4320);
    assert.equal(back.pageIndex, 0);
  });

  it("keeps restoring while images load and the document is still short", () => {
    const saved = snapshotChapterView({ pageIndex: 0, scrollY: 4320 });
    const { scroll: target } = resolveChapterRestore({
      saved,
      preferEnd: false,
      pageCount: 10,
    });
    assert.equal(target, 4320);

    const viewport = 800;
    let height = 900;
    let top = 0;

    const afterFirstPaint = tickRestore(
      target,
      { scrollTop: top, scrollHeight: height, clientHeight: viewport },
      { ready: 1, total: 10 },
    );
    top = afterFirstPaint.scrollTop;
    assert.equal(top, clampedScrollTop(target, { scrollHeight: height, clientHeight: viewport }));
    assert.equal(top < 4320, true);
    assert.equal(afterFirstPaint.done, false);

    height = 2400;
    const midLoad = tickRestore(
      target,
      { scrollTop: top, scrollHeight: height, clientHeight: viewport },
      { ready: 5, total: 10 },
    );
    top = midLoad.scrollTop;
    assert.equal(midLoad.done, false);
    assert.equal(top, 1600);

    height = 5200;
    const loaded = tickRestore(
      target,
      { scrollTop: top, scrollHeight: height, clientHeight: viewport },
      { ready: 10, total: 10 },
    );
    assert.equal(loaded.scrollTop, 4320);
    assert.equal(loaded.done, true);
  });

  it("does not finish restore just because the browser clamped scroll early", () => {
    const completeTooSoon = restoreIsComplete(
      4320,
      { scrollTop: 100, scrollHeight: 900, clientHeight: 800 },
      { ready: 2, total: 10 },
    );
    assert.equal(completeTooSoon, false);
  });

  it("restores the end of the previous page when going back without a snapshot", () => {
    const restore = resolveChapterRestore({
      preferEnd: true,
      pageCount: 8,
    });
    assert.equal(restore.pageIndex, 7);
    assert.equal(restore.scroll, "end");

    const beforeImages = tickRestore(
      "end",
      { scrollTop: 0, scrollHeight: 900, clientHeight: 800 },
      { ready: 1, total: 8 },
    );
    assert.equal(beforeImages.scrollTop, 100);
    assert.equal(beforeImages.done, false);

    const afterImages = tickRestore(
      "end",
      { scrollTop: 100, scrollHeight: 6400, clientHeight: 800 },
      { ready: 8, total: 8 },
    );
    assert.equal(afterImages.scrollTop, 5600);
    assert.equal(afterImages.done, true);
  });

  it("restores the same spot after a simulated refresh", () => {
    const store = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const key = viewStorageKey("book-1", "chapter-a", false);
    const live = snapshotChapterView({ pageIndex: 0, scrollY: 3875 });
    writeStoredView(adapter, key, live);

    const afterReload = readStoredView(adapter, key);
    const restore = resolveChapterRestore({
      saved: afterReload,
      preferEnd: false,
      pageCount: 10,
    });
    assert.equal(restore.scroll, 3875);

    const unloaded = mergeSavedView(
      afterReload,
      snapshotChapterView({ pageIndex: 0, scrollY: 0 }),
      true,
    );
    assert.equal(unloaded.webtoonScrollY, 3875);
    assert.equal(parseView(null), undefined);
  });

  it("falls back to a stored page index when nothing is saved locally", () => {
    const restore = resolveChapterRestore({
      preferEnd: false,
      pageCount: 400,
      fallbackPageIndex: 149,
    });
    assert.equal(restore.pageIndex, 149);
    assert.equal(restore.scroll, 0);
  });

  it("uses server progress when the local snapshot is still on the first page", () => {
    const restore = resolveChapterRestore({
      saved: snapshotChapterView({ pageIndex: 0, scrollY: 0 }),
      preferEnd: false,
      pageCount: 400,
      fallbackPageIndex: 80,
    });
    assert.equal(restore.pageIndex, 80);
  });

  it("keeps a later local page over older server progress", () => {
    const restore = resolveChapterRestore({
      saved: snapshotChapterView({ pageIndex: 40, scrollY: 0 }),
      preferEnd: false,
      pageCount: 400,
      fallbackPageIndex: 12,
    });
    assert.equal(restore.pageIndex, 40);
  });
});
