"""Parse a Mihon/Tachiyomi .tachibk backup (gzip + protobuf) into JSON."""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path

# Avoid Windows console encoding crashes on manga titles/descriptions.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def read_varint(data: bytes, i: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        b = data[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, i
        shift += 7


def read_fields(data: bytes) -> dict[int, list]:
    i = 0
    n = len(data)
    fields: dict[int, list] = {}
    while i < n:
        tag, i = read_varint(data, i)
        field = tag >> 3
        wtype = tag & 7
        if wtype == 0:
            val, i = read_varint(data, i)
        elif wtype == 1:
            val = data[i : i + 8]
            i += 8
        elif wtype == 2:
            length, i = read_varint(data, i)
            val = data[i : i + length]
            i += length
        elif wtype == 5:
            val = data[i : i + 4]
            i += 4
        else:
            raise ValueError(f"unknown wire type {wtype} at field {field}")
        fields.setdefault(field, []).append(val)
    return fields


def as_str(vals: list | None, default: str = "") -> str:
    if not vals:
        return default
    return vals[0].decode("utf-8", errors="replace")


def as_int(vals: list | None, default: int = 0) -> int:
    if not vals:
        return default
    return int(vals[0])


def as_bool(vals: list | None, default: bool = False) -> bool:
    if not vals:
        return default
    return bool(vals[0])


def parse_manga(raw: bytes) -> dict:
    f = read_fields(raw)
    chapters = f.get(16, [])
    read_count = 0
    for ch in chapters:
        cf = read_fields(ch)
        if as_bool(cf.get(4), False):
            read_count += 1
    genres = [g.decode("utf-8", errors="replace") for g in f.get(7, [])]
    return {
        "source": as_int(f.get(1)),
        "url": as_str(f.get(2)),
        "title": as_str(f.get(3)),
        "artist": as_str(f.get(4)) or None,
        "author": as_str(f.get(5)) or None,
        "description": as_str(f.get(6)) or None,
        "genre": genres,
        "status": as_int(f.get(8)),
        "thumbnailUrl": as_str(f.get(9)) or None,
        "dateAdded": as_int(f.get(13)),
        "chapterCount": len(chapters),
        "chaptersRead": read_count,
        "favorite": as_bool(f.get(100), True),
        "categories": [as_int([c]) for c in f.get(17, [])],
        "notes": as_str(f.get(110)) or None,
    }


def parse_source(raw: bytes) -> dict:
    f = read_fields(raw)
    return {"name": as_str(f.get(1)), "sourceId": as_int(f.get(2))}


def parse_category(raw: bytes) -> dict:
    f = read_fields(raw)
    return {
        "name": as_str(f.get(1)),
        "order": as_int(f.get(2)),
        "id": as_int(f.get(3)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Path to .tachibk file")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Write full library JSON here",
    )
    parser.add_argument(
        "--market",
        type=Path,
        help="Write Book Walker market-ready JSON here",
    )
    args = parser.parse_args()

    with gzip.open(args.input, "rb") as fh:
        data = fh.read()

    print(f"Decompressed size: {len(data):,} bytes")
    root = read_fields(data)

    manga = [parse_manga(m) for m in root.get(1, [])]
    categories = [parse_category(c) for c in root.get(2, [])]
    sources = [parse_source(s) for s in root.get(101, [])]
    source_map = {s["sourceId"]: s["name"] for s in sources}
    # Mihon writes BackupManga.categories as category *order* values, not IDs.
    # Restore looks up BackupCategory.order. Mapping by id shifted almost every shelf.
    cat_map = {c["order"]: c["name"] for c in categories}

    for m in manga:
        m["sourceName"] = source_map.get(m["source"], f"unknown:{m['source']}")
        m["categoryNames"] = [cat_map.get(cid, str(cid)) for cid in m["categories"]]

    favorites = [m for m in manga if m["favorite"]]
    print(f"Total manga entries: {len(manga)}")
    print(f"Favorites (library): {len(favorites)}")
    print(f"Categories: {[c['name'] for c in categories]}")
    print(f"Sources ({len(sources)}):")
    for s in sorted(sources, key=lambda x: x["name"].lower()):
        count = sum(1 for m in favorites if m["source"] == s["sourceId"])
        if count:
            print(f"  - {s['name']}: {count} titles")

    print("\n--- Sample entries (first 8 favorites) ---")
    for m in favorites[:8]:
        desc = (m["description"] or "")[:80].replace("\n", " ")
        print(f"Title: {m['title']}")
        print(f"  Source: {m['sourceName']}")
        print(f"  Author: {m['author']}")
        print(f"  Cover: {m['thumbnailUrl']}")
        print(f"  Chapters: {m['chapterCount']} ({m['chaptersRead']} read)")
        print(f"  Categories: {m['categoryNames']}")
        print(f"  Genre: {m['genre'][:5]}")
        print(f"  Description: {desc}...")
        print()

    missing_title = sum(1 for m in favorites if not m["title"])
    missing_cover = sum(1 for m in favorites if not m["thumbnailUrl"])
    missing_desc = sum(1 for m in favorites if not m["description"])
    zero_chapters = sum(1 for m in favorites if m["chapterCount"] == 0)
    print("--- Field coverage (favorites) ---")
    print(f"Missing title: {missing_title}")
    print(f"Missing cover: {missing_cover}")
    print(f"Missing description: {missing_desc}")
    print(f"Zero chapters: {zero_chapters}")

    if args.output:
        payload = {
            "categories": categories,
            "sources": sources,
            "manga": favorites,
        }
        args.output.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"\nWrote library JSON: {args.output}")

    if args.market:
        market = []
        for m in favorites:
            if not m["title"] or not m["thumbnailUrl"]:
                continue
            market.append(
                {
                    "title": m["title"][:200],
                    "summary": (m["description"] or f"Imported from Mihon ({m['sourceName']}).")[
                        :5000
                    ],
                    "coverUrl": m["thumbnailUrl"],
                    "totalPages": max(m["chapterCount"], 1),
                    "category": "MANGA",
                    "artist": m["artist"],
                    "author": m["author"],
                    "sourceName": m["sourceName"],
                    "sourceUrl": (
                        f"https://mangadex.org/title/{m['url'].split('/')[-1]}"
                        if m["sourceName"] == "MangaDex"
                        and m.get("url", "").startswith("/manga/")
                        else m.get("url") if m.get("url", "").startswith("http") else None
                    ),
                    "tachiyomiStatus": m["status"],
                    "chaptersRead": m["chaptersRead"],
                    "dateAdded": m["dateAdded"],
                    "categoryNames": m["categoryNames"],
                    "genre": m["genre"],
                }
            )
        args.market.write_text(
            json.dumps(market, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"Wrote market JSON: {args.market} ({len(market)} books)")


if __name__ == "__main__":
    main()
