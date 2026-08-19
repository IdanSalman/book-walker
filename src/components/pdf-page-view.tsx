"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { cn } from "@/lib/utils";

const docs = new Map<string, Promise<PDFDocumentProxy>>();
const rendered = new Map<string, HTMLCanvasElement>();
const inflight = new Map<string, Promise<HTMLCanvasElement>>();
const MAX_RENDERED = 8;

let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;

function loadPdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsReady;
}

async function loadDocument(url: string): Promise<PDFDocumentProxy> {
  const existing = docs.get(url);
  if (existing) return existing;
  const pending = (async () => {
    const { getDocument } = await loadPdfjs();
    return getDocument({
      url,
      verbosity: 0,
      isOffscreenCanvasSupported: true,
    }).promise;
  })();
  docs.set(url, pending);
  pending.catch(() => {
    docs.delete(url);
  });
  return pending;
}

function documentUrlFromPage(url: string): string {
  const hash = url.indexOf("#");
  return hash >= 0 ? url.slice(0, hash) : url;
}

function viewportSize(fillWidth: boolean) {
  const availW = fillWidth
    ? Math.max(window.innerWidth, 1)
    : window.innerWidth;
  const availH = fillWidth
    ? Math.max(window.innerHeight, 1)
    : window.innerHeight;
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  return { availW, availH, dpr };
}

function renderKey(
  documentUrl: string,
  pageIndex: number,
  fillWidth: boolean,
  size = viewportSize(fillWidth),
) {
  return `${documentUrl}#${pageIndex}:${fillWidth ? "w" : "f"}:${size.availW}x${size.availH}@${size.dpr}`;
}

function rememberRendered(key: string, canvas: HTMLCanvasElement) {
  if (rendered.has(key)) rendered.delete(key);
  rendered.set(key, canvas);
  while (rendered.size > MAX_RENDERED) {
    const oldest = rendered.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    rendered.delete(oldest);
  }
}

async function renderPdfPage(
  url: string,
  pageIndex: number,
  fillWidth: boolean,
): Promise<HTMLCanvasElement> {
  const documentUrl = documentUrlFromPage(url);
  const size = viewportSize(fillWidth);
  const key = renderKey(documentUrl, pageIndex, fillWidth, size);
  const cached = rendered.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const doc = await loadDocument(documentUrl);
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(size.availW / base.width, size.availH / base.height);
    const viewport = page.getViewport({ scale: fit * size.dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Could not draw this page");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
    }).promise;
    rememberRendered(key, canvas);
    return canvas;
  })();

  inflight.set(key, work);
  try {
    return await work;
  } finally {
    inflight.delete(key);
  }
}

export function prefetchPdfPage(
  url: string | undefined,
  pageIndex: number | undefined,
  fillWidth = false,
) {
  if (!url || pageIndex == null || pageIndex < 0) return;
  void renderPdfPage(url, pageIndex, fillWidth).catch(() => {
    /* prefetch is best-effort */
  });
}

export function PdfPageView({
  url,
  pageIndex,
  className,
  fillWidth = false,
}: {
  url: string;
  pageIndex: number;
  className?: string;
  fillWidth?: boolean;
}) {
  const frontRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const showingFront = useRef(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || (!fillWidth && !back)) return;
    let cancelled = false;

    function paint(target: HTMLCanvasElement, source: HTMLCanvasElement) {
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      target.width = source.width;
      target.height = source.height;
      target.style.width = `${Math.ceil(source.width / dpr)}px`;
      target.style.height = `${Math.ceil(source.height / dpr)}px`;
      const context = target.getContext("2d", { alpha: false });
      if (!context) throw new Error("Could not draw this page");
      context.drawImage(source, 0, 0);
    }

    async function draw() {
      try {
        const source = await renderPdfPage(url, pageIndex, fillWidth);
        if (cancelled) return;
        if (fillWidth || !back) {
          paint(front, source);
          setError(null);
          return;
        }
        const hidden = showingFront.current ? back : front;
        const visible = showingFront.current ? front : back;
        paint(hidden, source);
        hidden.style.visibility = "visible";
        visible.style.visibility = "hidden";
        showingFront.current = hidden === front;
        setError(null);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Failed to render page",
          );
        }
      }
    }

    void draw();
    const onResize = () => {
      void draw();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [url, pageIndex, fillWidth]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        fillWidth ? "w-full" : "min-h-dvh w-full",
      )}
    >
      {error ? (
        <p className="px-4 text-sm text-red-300">{error}</p>
      ) : null}
      <canvas
        ref={frontRef}
        className={cn(
          "bg-white",
          fillWidth ? "w-full" : "max-h-dvh max-w-full",
          className,
        )}
      />
      {!fillWidth && (
        <canvas
          ref={backRef}
          className={cn(
            "pointer-events-none absolute bg-white",
            "max-h-dvh max-w-full",
            className,
          )}
          style={{ visibility: "hidden" }}
        />
      )}
    </div>
  );
}
