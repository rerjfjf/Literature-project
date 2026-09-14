#!/usr/bin/env python3
"""Add image placeholders to every section in content.js."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_JS = ROOT / "content.js"
IMAGES_DIR = ROOT / "images"
PLACEHOLDER = "images/placeholder.svg"


def load_textbook() -> dict:
    raw = CONTENT_JS.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("{") : raw.rindex("}") + 1])


def save_textbook(data: dict) -> None:
    CONTENT_JS.write_text(
        "window.TEXTBOOK = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def image_path(author_id: str, section_id: str) -> str:
    return f"images/{author_id}/{section_id}.jpg"


def main() -> None:
    data = load_textbook()
    authors = {a["id"]: a for a in data.get("authors", [])}
    count = 0

    for chapter in data.get("chapters", []):
        author_id = chapter.get("authorId", data.get("authorId", "unknown"))
        author_name = authors.get(author_id, {}).get("fullName") or authors.get(author_id, {}).get("name") or ""

        for section in chapter.get("sections", []):
            section_id = section.get("id", "section")
            alt = section.get("title", "Иллюстрация")
            if author_name and author_id != "book":
                alt = f"{author_name} — {alt}"

            section["image"] = {
                "src": image_path(author_id, section_id),
                "alt": alt,
                "caption": "Иллюстрация к разделу",
                "placeholder": PLACEHOLDER,
            }
            count += 1
            (IMAGES_DIR / author_id).mkdir(parents=True, exist_ok=True)

    save_textbook(data)
    print(f"Added image placeholders to {count} sections")


if __name__ == "__main__":
    main()
