#!/usr/bin/env python3
"""Import new authors from docx files into content.js."""

from __future__ import annotations

import json
import re
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_JS = ROOT / "content.js"
W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
PLACEHOLDER = "images/placeholder.svg"

AUTHORS_META = [
    {
        "id": "rybakov",
        "name": "А. Н. Рыбаков",
        "fullName": "А. Н. Рыбаков",
        "qr": "qrcodes/rybakov.png",
        "glob": "*Рыбаков*.docx",
        "intro_title": "Война в произведениях А. Н. Рыбакова",
    },
    {
        "id": "akhmatova",
        "name": "А. А. Ахматова",
        "fullName": "А. А. Ахматова",
        "qr": "qrcodes/akhmatova.png",
        "glob": "*Ахматова*.docx",
        "intro_title": "Война в произведениях А. А. Ахматова",
    },
    {
        "id": "vasilyev",
        "name": "Б. Л. Васильев",
        "fullName": "Б. Л. Васильев",
        "qr": "qrcodes/vasilyev.png",
        "glob": "*Васильев*.docx",
        "intro_title": "Война в произведениях Б. Л. Васильева",
    },
    {
        "id": "bykov",
        "name": "В. В. Быков",
        "fullName": "В. В. Быков",
        "qr": "qrcodes/bykov.png",
        "glob": "*Быков*.docx",
        "intro_title": "Война в произведениях В. В. Быкова",
    },
]


def load_textbook() -> dict:
    raw = CONTENT_JS.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("{") : raw.rindex("}") + 1])


def save_textbook(data: dict) -> None:
    CONTENT_JS.write_text(
        "window.TEXTBOOK = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def slugify(text: str, prefix: str = "sec") -> str:
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
    return f"{prefix}-{slug[:72].strip('-')}" if slug else f"{prefix}-part"


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
            if node.tail:
                parts.append(node.tail)
        line = "".join(parts).strip()
        if line:
            lines.append(line)
    return lines


def is_video_line(line: str) -> bool:
    s = line.strip()
    return s.startswith("[ВИДЕО") or s.startswith("# [ВИДЕО")


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
        if not stripped or stripped == "Источники:":
            i += 1
            continue

        if is_video_line(stripped):
            text = stripped.lstrip("#").strip()
            m = re.match(r"\[ВИДЕО(?:\s*\d+)?\s*:\s*(.+?)\]", text, re.I)
            title = m.group(1).strip() if m else text
            blocks.append({"type": "note", "title": f"Видео: {title}", "text": text})
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

        if is_subheading(stripped, i, lines):
            blocks.append({"type": "h2", "text": stripped})
            i += 1
            continue

        blocks.append({"type": "p", "text": stripped})
        i += 1

    return blocks


def is_subheading(line: str, idx: int, lines: list[str]) -> bool:
    if len(line) > 72 or line.endswith("."):
        return False
    if line.startswith("...") or line.startswith("Цитата:"):
        return False
    if re.match(r"^(Вопрос|Задание|Параметр|Оцениваются|Объём|Тема|Что )", line):
        return False
    if re.match(r"^УРОВЕНЬ\s+\d", line, re.I):
        return False
    if idx > 0 and len(lines[idx - 1]) > 100:
        return bool(re.match(r"^[А-ЯЁ«]", line))
    return False


def is_major_chapter_start(line: str, idx: int, lines: list[str], author_id: str) -> bool:
    s = line.strip()
    if idx == 0:
        return True

    if re.match(r"^Уровень\s+\d", s, re.I):
        return True
    if re.match(r"^Система ростовых", s, re.I):
        return True
    if re.match(r"^«[^»]+»\s*[-—]\s*знакомство", s, re.I):
        return True
    if re.match(r"^Повесть Василя Быкова «Сотников»", s):
        return True
    if re.match(r"^Повесть Бориса Васильева А зори", s):
        return True
    if re.match(r"^Роман «В списках", s):
        return True
    if re.match(r"^Повесть «Завтра была война»", s):
        return True
    if re.match(r"^Рассматривая творчество", s):
        return True
    if re.match(r"^Роман Анатолия.*«Дети Арбата» является", s):
        return True
    if s == "ЛИТЕРАТУРНЫЙ РАЗБОР":
        return True
    if s.startswith("Василь Быков: жизнь"):
        return True
    if re.match(r"^Подробный разбор сюжета", s):
        return True
    if re.match(r"^Детали, символы и скрытые", s):
        return True
    if re.match(r"^Человек на весах войны", s):
        return True
    if re.match(r"^Ростовые задания", s):
        return True
    if re.match(r"^Литературоведческие исследования$", s):
        return True
    if author_id == "akhmatova" and re.match(r"^Поэма «Реквием»", s) and idx == 52:
        return True

    return False


def find_first_work_index(lines: list[str], author_id: str) -> int:
    for i, line in enumerate(lines):
        s = line.strip()
        if re.match(r"^«[^»]+»\s*[-—]\s*знакомство", s, re.I):
            return i
        if re.match(r"^Повесть Василя Быкова «Сотников»", s):
            return i
        if re.match(r"^Повесть Бориса Васильева А зори", s):
            return i
        if re.match(r"^Роман Анатолия.*«Дети Арбата»", s):
            return i
        if author_id == "bykov" and s.startswith("Повесть Василя"):
            return i
    return len(lines)


def derive_chapter_title(chunk: list[str], author_id: str) -> str:
    first = chunk[0].strip()
    if re.match(r"^Уровень\s+\d", first, re.I):
        return first
    if re.match(r"^Система ростовых", first, re.I):
        return first
    if re.match(r"^«[^»]+»\s*[-—]", first):
        return first
    if len(first) < 90 and not first.endswith("."):
        return first
    m = re.search(r"«([^»]+)»", first)
    if m:
        return f"«{m.group(1)}»"
    if author_id == "bykov" and first == "ЛИТЕРАТУРНЫЙ РАЗБОР":
        return "Литературный разбор. «Сотников»"
    return first[:80] + ("…" if len(first) > 80 else "")


def split_lines_to_chapters(lines: list[str], author_id: str, intro_title: str) -> list[dict]:
    boundaries = [0]
    for i in range(1, len(lines)):
        if is_major_chapter_start(lines[i], i, lines, author_id):
            if boundaries[-1] != i:
                boundaries.append(i)

    chunks: list[tuple[str, list[str]]] = []
    for j in range(len(boundaries)):
        start = boundaries[j]
        end = boundaries[j + 1] if j + 1 < len(boundaries) else len(lines)
        chunk = lines[start:end]
        if not chunk:
            continue
        chunks.append((derive_chapter_title(chunk, author_id), chunk))

    first_work = find_first_work_index(lines, author_id)
    chapters: list[dict] = []

    bio_lines: list[str] = []
    other: list[tuple[str, list[str]]] = []
    pos = 0
    for title, chunk in chunks:
        chunk_start = pos
        pos += len(chunk)
        if chunk_start < first_work:
            bio_lines.extend(chunk)
        else:
            other.append((title, chunk))

    if bio_lines:
        bio_title = "Биография"
        if author_id == "akhmatova" and "биограф" in bio_lines[0].lower():
            bio_title = "Знакомство с автором и биография"
        elif author_id == "bykov":
            bio_title = "В. В. Быков. Жизнь и творческий путь"
        elif author_id == "rybakov":
            bio_title = "Биография А. Н. Рыбакова"
        elif author_id == "vasilyev":
            bio_title = "Биография Б. Л. Васильева"
        chapters.append(make_chapter(author_id, bio_title, bio_lines, "bio"))

    intro_chunk = None
    rest = []
    for title, chunk in other:
        low = title.lower()
        if intro_chunk is None and any(
            k in low for k in ("знакомство", "литературный разбор", "опалён", "эхо войны")
        ):
            intro_chunk = (intro_title, chunk)
        else:
            rest.append((title, chunk))

    if intro_chunk:
        chapters.append(make_chapter(author_id, intro_chunk[0], intro_chunk[1], "intro"))
    elif other and author_id != "bykov":
        chapters.append(
            make_chapter(
                author_id,
                intro_title,
                other[0][1][:3] if len(other[0][1]) > 3 else other[0][1],
                "intro",
            )
        )
        rest = other
    else:
        rest = other if not intro_chunk else rest

    for idx, (title, chunk) in enumerate(rest):
        chapters.append(make_chapter(author_id, title, chunk, f"part-{idx}"))

    return chapters


def make_chapter(author_id: str, title: str, lines: list[str], suffix: str) -> dict:
    section = make_section(slugify(title, author_id), title, lines)
    return {
        "id": slugify(title, f"{author_id}-ch"),
        "title": title,
        "sections": [section],
    }


def make_section(section_id: str, title: str, body_lines: list[str]) -> dict:
    blocks = lines_to_blocks(body_lines)
    lead = ""
    rest = blocks
    if blocks and blocks[0]["type"] == "p":
        lead = blocks[0]["text"]
        rest = blocks[1:]
    return {"id": section_id, "title": title, "lead": lead, "blocks": rest}


def add_images_to_sections(data: dict) -> None:
    authors = {a["id"]: a for a in data.get("authors", [])}
    for chapter in data.get("chapters", []):
        author_id = chapter.get("authorId", "unknown")
        author_name = authors.get(author_id, {}).get("fullName", "")
        for section in chapter.get("sections", []):
            sid = section.get("id", "section")
            alt = section.get("title", "Иллюстрация")
            if author_name and author_id != "book":
                alt = f"{author_name} — {alt}"
            section["image"] = {
                "src": f"images/{author_id}/{sid}.jpg",
                "alt": alt,
                "caption": "Иллюстрация к разделу",
                "placeholder": PLACEHOLDER,
            }
            (ROOT / "images" / author_id).mkdir(parents=True, exist_ok=True)


def reorder_new_author(chapters: list[dict], author_id: str) -> list[dict]:
    """Apply Evtyushenko-style bucket order."""
    from importlib.util import spec_from_loader, module_from_spec
    from importlib.machinery import SourceFileLoader

    spec = spec_from_loader(
        "unify",
        SourceFileLoader("unify", str(ROOT / "scripts" / "unify_structure.py")),
    )
    unify = module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(unify)

    for ch in chapters:
        ch["authorId"] = author_id
    return unify.reorder_author(chapters, author_id)


def find_docx(glob_pattern: str) -> Path:
    matches = sorted(ROOT.glob(glob_pattern))
    if not matches:
        raise FileNotFoundError(f"No file matching {glob_pattern}")
    return matches[0]


def main() -> None:
    data = load_textbook()
    existing_ids = {a["id"] for a in data["authors"]}
    new_author_entries = []
    new_chapters = []

    for meta in AUTHORS_META:
        if meta["id"] in existing_ids:
            print(f"Skip {meta['id']} — already in textbook")
            continue

        path = find_docx(meta["glob"])
        lines = extract_docx_lines(path)
        raw_chapters = split_lines_to_chapters(lines, meta["id"], meta["intro_title"])
        ordered = reorder_new_author(raw_chapters, meta["id"])

        new_author_entries.append(
            {
                "id": meta["id"],
                "name": meta["name"],
                "fullName": meta["fullName"],
                "qr": meta["qr"],
            }
        )
        new_chapters.extend(ordered)
        print(f"Imported {meta['fullName']}: {len(ordered)} chapters from {path.name}")

    if not new_author_entries:
        print("No new authors to import.")
        return

    data["authors"].extend(new_author_entries)

    title_section = None
    other_chapters = []
    for ch in data["chapters"]:
        if ch.get("id") == "title-page":
            title_section = ch
        else:
            other_chapters.append(ch)

    data["chapters"] = ([title_section] if title_section else []) + other_chapters + new_chapters

    title_ch = data["chapters"][0]
    for sec in title_ch.get("sections", []):
        for block in sec.get("blocks", []):
            if block.get("type") == "list":
                for author in data["authors"]:
                    name = author.get("fullName") or author.get("name")
                    if name not in block["items"]:
                        block["items"].append(name)

    add_images_to_sections(data)
    save_textbook(data)

    subprocess.run(
        ["node", "-e", "require('fs').readFileSync('content.js','utf8'); console.log('OK');"],
        cwd=ROOT,
        check=True,
    )
    print(f"Total authors: {len(data['authors'])}, total chapters: {len(data['chapters'])}")


if __name__ == "__main__":
    main()
