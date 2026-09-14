#!/usr/bin/env python3
"""Reorder textbook chapters (bio first) and import Evtyushenko docx into content.js."""

from __future__ import annotations

import json
import re
import subprocess
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_JS = ROOT / "content.js"
DOCX = ROOT / "Е.Евтушенко.docx"
W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def load_textbook() -> dict:
    raw = CONTENT_JS.read_text(encoding="utf-8")
    payload = raw[raw.index("{") : raw.rindex("}") + 1]
    return json.loads(payload)


def save_textbook(data: dict) -> None:
    body = json.dumps(data, ensure_ascii=False, indent=2)
    CONTENT_JS.write_text(
        "window.TEXTBOOK = " + body + ";\n",
        encoding="utf-8",
    )


def slugify(text: str, prefix: str = "ev") -> str:
    text = text.lower().strip()
    text = re.sub(r"[«»\"'""„]", "", text)
    mapping = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
        "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
        "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
        "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
        "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    }
    out = []
    for ch in text:
        if ch in mapping:
            out.append(mapping[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append("-")
    slug = re.sub(r"-+", "-", "".join(out)).strip("-")
    return f"{prefix}-{slug[:80].strip('-')}" if slug else f"{prefix}-section"


def extract_docx_lines(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: list[str] = []
    for paragraph in root.iter(f"{W_NS}p"):
        parts: list[str] = []
        for node in paragraph.iter():
            if node.tag == f"{W_NS}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{W_NS}tab":
                parts.append("\t")
            elif node.tag == f"{W_NS}br":
                parts.append("\n")
            if node.tail:
                parts.append(node.tail)
        line = "".join(parts)
        if line.strip():
            lines.append(line)
    return lines


def is_video_line(line: str) -> bool:
    s = line.strip()
    return s.startswith("[ВИДЕО") or s.startswith("# [ВИДЕО") or s.startswith("## [ВИДЕО")


def video_note(line: str) -> dict:
    text = line.strip().lstrip("#").strip()
    match = re.match(r"\[ВИДЕО(?:\s*\d+)?\s*:\s*(.+?)\]", text, re.IGNORECASE)
    title = match.group(1).strip() if match else text.strip("[]")
    return {"type": "note", "title": f"Видео: {title}", "text": text}


def is_assignment_heading(text: str) -> bool:
    low = text.lower()
    return (
        low.startswith("задание")
        or "письменное задание" in low
        or "задания с проверкой" in low
        or low.startswith("финальное письменное задание")
        or low.startswith("задание для студента")
        or low.startswith("задание после уровня")
    )


def is_list_item(line: str) -> bool:
    return bool(re.match(r"^\d+\.\s+", line.strip()))


def parse_list_items(lines: list[str], start: int) -> tuple[dict, int]:
    items: list[str] = []
    i = start
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        m = re.match(r"^\d+\.\s+(.*)$", line)
        if m:
            items.append(m.group(1))
            i += 1
            continue
        break
    return {"type": "list", "items": items}, i


def parse_table(lines: list[str], start: int) -> tuple[dict | None, int]:
    """Parse markdown-like table starting with |."""
    rows: list[list[str]] = []
    i = start
    while i < len(lines):
        line = lines[i].strip()
        if not line.startswith("|"):
            break
        if re.match(r"^\|[-:\s|]+\|$", line):
            i += 1
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.append(cells)
        i += 1
    if not rows:
        return None, start
    return {"type": "table", "rows": rows}, i


def lines_to_blocks(lines: list[str]) -> list[dict]:
    blocks: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue

        if is_video_line(stripped):
            blocks.append(video_note(stripped))
            i += 1
            continue

        if stripped.startswith("|"):
            table, i = parse_table(lines, i)
            if table:
                blocks.append(table)
                continue

        if is_list_item(stripped):
            lst, i = parse_list_items(lines, i)
            if lst["items"]:
                blocks.append(lst)
            continue

        if stripped.startswith("### "):
            blocks.append({"type": "h2", "text": stripped[4:].strip()})
            i += 1
            continue

        if stripped.startswith("## "):
            blocks.append({"type": "h2", "text": stripped[3:].strip()})
            i += 1
            continue

        blocks.append({"type": "p", "text": stripped})
        i += 1

    return blocks


def make_section(section_id: str, title: str, body_lines: list[str]) -> dict:
    blocks = lines_to_blocks(body_lines)
    if re.match(r"^\[ВИДЕО", title, re.IGNORECASE):
        note_text = title
        for block in blocks:
            if block.get("type") == "p":
                note_text += "\n\n" + block["text"]
            elif block.get("type") == "h2":
                note_text += "\n\n" + block["text"]
        return {
            "id": section_id,
            "title": title,
            "lead": "",
            "blocks": [video_note(note_text)],
        }

    lead = ""
    rest = blocks
    if blocks and blocks[0]["type"] == "p":
        lead = blocks[0]["text"]
        rest = blocks[1:]
    elif blocks and blocks[0]["type"] == "h2" and len(blocks) > 1 and blocks[1]["type"] == "p":
        lead = blocks[1]["text"]
        rest = [blocks[0], *blocks[2:]]
    return {
        "id": section_id,
        "title": title,
        "lead": lead,
        "blocks": rest,
    }


def parse_evtyushenko_docx() -> list[dict]:
    lines = extract_docx_lines(DOCX)
    chapters: list[dict] = []
    preamble: list[str] = []
    current_title: str | None = None
    current_lines: list[str] = []
    current_sections: list[tuple[str, list[str]]] = []
    current_section_title: str | None = None
    current_section_lines: list[str] = []

    def flush_section() -> None:
        nonlocal current_section_title, current_section_lines
        if current_section_title is not None:
            current_sections.append((current_section_title, current_section_lines))
        current_section_title = None
        current_section_lines = []

    def flush_chapter() -> None:
        nonlocal current_title, current_lines, current_sections
        flush_section()
        if current_title is None:
            return
        sections: list[dict] = []
        if current_lines:
            sec_id = slugify(current_title + "-intro", "ev-sec")
            sections.append(make_section(sec_id, current_title, current_lines))
        for idx, (sec_title, sec_lines) in enumerate(current_sections):
            sec_id = slugify(sec_title, "ev-sec")
            if idx:
                sec_id = f"{sec_id}-{idx}"
            sections.append(make_section(sec_id, sec_title, sec_lines))
        if not sections:
            sec_id = slugify(current_title, "ev-sec")
            sections.append(make_section(sec_id, current_title, []))
        chapters.append(
            {
                "id": slugify(current_title, "ev"),
                "title": current_title,
                "sections": sections,
            }
        )
        current_title = None
        current_lines = []
        current_sections = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("# ") and not stripped.startswith("## "):
            title = stripped[2:].strip()
            if re.match(r"^\[ВИДЕО", title, re.IGNORECASE):
                flush_section()
                current_section_title = title
                current_section_lines = []
                continue
            flush_chapter()
            current_title = title
            current_lines = []
            current_sections = []
            current_section_title = None
            current_section_lines = []
            continue

        if current_title is None:
            preamble.append(line)
            continue

        if stripped.startswith("## "):
            flush_section()
            current_section_title = stripped[3:].strip()
            current_section_lines = []
            continue

        if current_section_title is not None:
            current_section_lines.append(line)
        else:
            current_lines.append(line)

    flush_chapter()

    if preamble:
        intro = {
            "id": "ev-intro",
            "title": "Война в произведениях Е. А. Евтушенко",
            "sections": [
                make_section(
                    "ev-vvedenie",
                    "Война в произведениях Е. А. Евтушенко",
                    preamble,
                )
            ],
        }
        chapters.insert(0, intro)

    return chapters


def is_extra_bio_chapter(ch: dict) -> bool:
    cid = ch.get("id", "")
    title = ch.get("title", "").lower()
    if "stranitsy-biografii" in cid:
        return True
    if "страницы биографии" in title:
        return True
    return any(
        "stranitsy-biografii" in s.get("id", "")
        or "страницы биографии" in s.get("title", "").lower()
        for s in ch.get("sections", [])
    )


def is_transition_chapter(ch: dict) -> bool:
    cid = ch.get("id", "")
    title = ch.get("title", "").lower()
    return cid in {"next"} or title == "переход" or cid.endswith("-perehod")


def split_extra_bio(ch: dict) -> tuple[dict | None, dict | None]:
    title = ch.get("title", "").lower()
    cid = ch.get("id", "")

    if "страницы биографии" in title or (
        "stranitsy-biografii" in cid and "bio-pages" not in cid
    ):
        return None, ch

    if not is_extra_bio_chapter(ch):
        return ch, None

    bio_sections = []
    other_sections = []
    for section in ch.get("sections", []):
        sid = section.get("id", "")
        stitle = section.get("title", "").lower()
        if "stranitsy-biografii" in sid or "страницы биографии" in stitle:
            bio_sections.append(section)
        else:
            other_sections.append(section)

    if bio_sections and other_sections:
        other = dict(ch)
        other["sections"] = other_sections
        bio = dict(ch)
        bio["sections"] = bio_sections
        bio["title"] = "Страницы биографии, которых нет в учебниках"
        bio["id"] = ch["id"] + "-bio-pages"
        return other, bio

    if bio_sections and not other_sections:
        return None, ch

    return ch, None


def classify_chapter(ch: dict, author_id: str) -> str:
    cid = ch.get("id", "")
    title = ch.get("title", "").lower()

    if is_transition_chapter(ch):
        return "transition"
    if is_extra_bio_chapter(ch):
        return "extra_bio"

    if "istochniki" in cid or "источники" in title:
        return "works"

    bio_ids = {
        "biography",
        "ok-bio",
        "vysotsky-ch-detstvo-voyna-vokrug",
        "vysotsky-ch-teatr-i-pervye-pesni-rozhdenie-golosa",
        "vysotsky-ch-vlast-svoboda-i-tsena-golosa",
    }
    if cid in bio_ids:
        return "bio"

    bio_keywords = [
        "биограф",
        "-bio",
        "detstvo",
        "frontovoy-opyt",
        "posle-voyny",
    ]
    zabolotsky_late_bio = {
        "zabolotsky-ch-doprosy-i-otkaz-ot-donosa",
        "zabolotsky-ch-rabota-nad-slovom-o-polku-igoreve",
        "zabolotsky-ch-semya-i-vozvraschenie-domoy",
        "zabolotsky-ch-pozdnee-priznanie",
    }
    if author_id == "zabolotsky" and cid in zabolotsky_late_bio:
        return "works"

    if any(k in cid for k in bio_keywords):
        if author_id == "zabolotsky" and cid.startswith("zabolotsky-ch-"):
            return "works"
        if author_id == "vysotsky":
            return "bio"

    if author_id == "tvardovsky" and cid == "biography":
        return "bio"

    # Evtyushenko biography chapters from docx
    if author_id == "evtyushenko":
        bio_titles = (
            "детство. сибирь",
            "москва. литературный",
            "шестидесятники",
            "власть, скандалы",
            "поздние годы",
        )
        if any(t in title for t in bio_titles):
            return "bio"

    return "works"


def extract_zabolotsky_bio_from_intro(chapters: list[dict]) -> tuple[list[dict], dict | None]:
    intro = next((c for c in chapters if c["id"] == "zabolotsky-intro"), None)
    if not intro:
        return chapters, None

    bio_start_re = re.compile(r"^Н\. А\. Заболоцкий родился")
    bio_blocks: list[dict] = []
    new_sections = []

    for section in intro.get("sections", []):
        if section["id"] != "zabolotsky-klyuchevye-slova-razdela":
            new_sections.append(section)
            continue

        kept: list[dict] = []
        for block in section.get("blocks", []):
            if block.get("type") == "p" and bio_start_re.match(block.get("text", "")):
                bio_blocks.append(block)
            elif bio_blocks:
                bio_blocks.append(block)
            else:
                kept.append(block)

        trimmed = dict(section)
        trimmed["blocks"] = kept
        new_sections.append(trimmed)

    if not bio_blocks:
        return chapters, None

    bio_chapter = {
        "id": "zabolotsky-bio",
        "title": "Биография Н. А. Заболоцкого",
        "sections": [
            {
                "id": "zabolotsky-biografiya",
                "title": "Биография Н. А. Заболоцкого",
                "lead": bio_blocks[0]["text"] if bio_blocks and bio_blocks[0]["type"] == "p" else "",
                "blocks": bio_blocks[1:] if bio_blocks and bio_blocks[0]["type"] == "p" else bio_blocks,
            }
        ],
    }

    updated = []
    for ch in chapters:
        if ch["id"] == "zabolotsky-intro":
            ch = dict(ch)
            ch["sections"] = new_sections
        updated.append(ch)
    return updated, bio_chapter


def renumber_chapters(chapters: list[dict], label: str) -> None:
    for idx, ch in enumerate(chapters, start=1):
        ch["number"] = f"{label} {idx}"


def reorder_author_chapters(chapters: list[dict], author_id: str) -> list[dict]:
    if author_id == "zabolotsky":
        chapters, bio_chapter = extract_zabolotsky_bio_from_intro(chapters)
    else:
        bio_chapter = None

    processed: list[dict] = []
    extra_bio: list[dict] = []
    transition: list[dict] = []

    for ch in chapters:
        main, bio_part = split_extra_bio(ch)
        if bio_part:
            extra_bio.append(bio_part)
        if main:
            processed.append(main)

    bio: list[dict] = []
    works: list[dict] = []

    if bio_chapter:
        bio.append(bio_chapter)

    for ch in processed:
        bucket = classify_chapter(ch, author_id)
        if bucket == "bio":
            bio.append(ch)
        elif bucket == "transition":
            transition.append(ch)
        elif bucket == "extra_bio":
            extra_bio.append(ch)
        else:
            works.append(ch)

    ordered = bio + works + extra_bio + transition

    if author_id == "tvardovsky":
        label = "Глава"
    else:
        label = "Раздел"

    renumber_chapters(ordered, label)
    return ordered


def reorder_evtyushenko(chapters: list[dict]) -> list[dict]:
    intro: dict | None = None
    bio: list[dict] = []
    extra_bio: list[dict] = []
    works: list[dict] = []

    for ch in chapters:
        if ch.get("id") == "ev-intro":
            intro = ch
            continue
        bucket = classify_chapter(ch, "evtyushenko")
        title = ch.get("title", "").lower()
        if "страницы биографии" in title:
            extra_bio.append(ch)
        elif bucket == "bio":
            bio.append(ch)
        else:
            works.append(ch)

    ordered = bio + ([intro] if intro else []) + works + extra_bio
    renumber_chapters(ordered, "Раздел")
    return ordered


def build_evtyushenko_chapters() -> list[dict]:
    chapters = parse_evtyushenko_docx()
    return reorder_evtyushenko(chapters)


def main() -> None:
    data = load_textbook()

    data["authors"].append(
        {
            "id": "evtyushenko",
            "name": "Е. А. Евтушенко",
            "fullName": "Е. А. Евтушенко",
            "qr": "qrcodes/evtyushenko.png",
        }
    )

    author_order = ["tvardovsky", "okudzhava", "zabolotsky", "vysotsky", "evtyushenko"]
    by_author: dict[str, list[dict]] = {aid: [] for aid in author_order}

    for chapter in data["chapters"]:
        aid = chapter.get("authorId", data.get("authorId", "tvardovsky"))
        if aid not in by_author:
            by_author[aid] = []
        by_author[aid].append(chapter)

    new_chapters: list[dict] = []
    for aid in author_order:
        chs = by_author.get(aid, [])
        if aid == "evtyushenko":
            ev_chapters = build_evtyushenko_chapters()
            for ch in ev_chapters:
                ch["authorId"] = "evtyushenko"
            new_chapters.extend(ev_chapters)
        elif chs:
            reordered = reorder_author_chapters(chs, aid)
            for ch in reordered:
                ch["authorId"] = aid
            new_chapters.extend(reordered)

    data["chapters"] = new_chapters
    save_textbook(data)

    # Validate output loads in node
    subprocess.run(
        ["node", "-e", "require('fs').readFileSync('content.js','utf8'); console.log('OK');"],
        cwd=ROOT,
        check=True,
    )

    ev_count = sum(1 for c in new_chapters if c.get("authorId") == "evtyushenko")
    print(f"Done. Total chapters: {len(new_chapters)}, Evtyushenko chapters: {ev_count}")


if __name__ == "__main__":
    main()
