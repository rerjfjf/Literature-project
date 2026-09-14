#!/usr/bin/env python3
"""Unify all authors to Evtyushenko-style narrative order and add title page."""

from __future__ import annotations

import json
import re
import subprocess
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT_JS = ROOT / "content.js"

# Evtyushenko order: bio → intro → works → context → problems → reflection →
# assignments → supplementary → extra_bio → transition
BUCKET_ORDER = [
    "bio",
    "works_intro",
    "why_war",
    "works",
    "context",
    "problems",
    "reflection",
    "assignments",
    "supplementary",
    "extra_bio",
    "transition",
]


def load_textbook() -> dict:
    raw = CONTENT_JS.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("{") : raw.rindex("}") + 1])


def save_textbook(data: dict) -> None:
    CONTENT_JS.write_text(
        "window.TEXTBOOK = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def bucket_index(name: str) -> int:
    try:
        return BUCKET_ORDER.index(name)
    except ValueError:
        return len(BUCKET_ORDER)


def classify(ch: dict, author_id: str) -> str:
    cid = ch.get("id", "").lower()
    title = ch.get("title", "").lower()

    if author_id == "zabolotsky":
        z_map = {
            "zabolotsky-bio": "bio",
            "zabolotsky-intro": "works_intro",
            "zabolotsky-ch-ya-ne-ischu-garmonii-v-prirode": "works",
            "zabolotsky-ch-mozhzhevelovyy-kust": "works",
            "zabolotsky-ch-proschanie-s-druzyami": "works",
            "zabolotsky-ch-gde-to-v-pole-vozle-magadana": "works",
            "zabolotsky-ch-nekrasivaya-devochka": "works",
            "zabolotsky-ch-obschiy-vyvod": "works",
            "zabolotsky-ch-stihi-sohranennye-tolko-pamyatyu": "context",
            "zabolotsky-ch-istoriya-mozhzhevelovogo-kusta": "context",
            "zabolotsky-ch-perevody-kak-sposob-vyzhit": "context",
            "zabolotsky-ch-kak-sovremenniki-vosprinimali-n-a-zabolotskogo": "context",
            "zabolotsky-ch-uteryannye-rukopisi-i-vosstanovlennye-teksty": "context",
            "zabolotsky-ch-neozhidannaya-istoriya-o-nekrasivoy-devochke": "context",
            "zabolotsky-ch-stihi-sohranennye-tolko-pamyatyu-2": "context",
            "zabolotsky-ch-neozhidannyy-fakt": "context",
            "zabolotsky-ch-priroda-i-chelovek": "problems",
            "zabolotsky-ch-gosudarstvo-i-lichnost": "problems",
            "zabolotsky-ch-pamyat-i-utrata": "problems",
            "zabolotsky-ch-krasota-kak-nravstvennaya-kategoriya": "problems",
            "zabolotsky-ch-molchanie-kak-forma-vyskazyvaniya": "problems",
            "zabolotsky-ch-uroven-1-ponimanie-teksta": "reflection",
            "zabolotsky-ch-uroven-2-analiz-i-interpretatsiya": "reflection",
            "zabolotsky-ch-uroven-3-suzhdenie-i-pozitsiya": "reflection",
            "zabolotsky-ch-itog": "supplementary",
            "zabolotsky-ch-doprosy-i-otkaz-ot-donosa": "extra_bio",
            "zabolotsky-ch-rabota-nad-slovom-o-polku-igoreve": "extra_bio",
            "zabolotsky-ch-semya-i-vozvraschenie-domoy": "extra_bio",
            "zabolotsky-ch-pozdnee-priznanie": "extra_bio",
        }
        if cid in z_map:
            return z_map[cid]

    if author_id == "vysotsky":
        v_map = {
            "vysotsky-ch-detstvo-voyna-vokrug": "bio",
            "vysotsky-ch-teatr-i-pervye-pesni-rozhdenie-golosa": "bio",
            "vysotsky-ch-vlast-svoboda-i-tsena-golosa": "bio",
            "vysotsky-intro": "works_intro",
            "vysotsky-ch-pochemu-voyna-ego-glazami": "why_war",
            "vysotsky-ch-opisanie-proizvedeniy": "works",
            "vysotsky-ch-chelovek-epohi-dva-vzglyada": "context",
            "vysotsky-ch-kak-eto-sozdavalos": "context",
            "vysotsky-ch-problemy-proizvedeniy": "problems",
            "vysotsky-ch-informatsiya-dlya-razdumiy": "reflection",
            "vysotsky-ch-voprosy-po-proizvedeniyam": "reflection",
            "vysotsky-ch-uroven-2-analiz-i-interpretatsiya": "reflection",
            "vysotsky-ch-uroven-3-suzhdenie-i-pozitsiya": "reflection",
            "vysotsky-ch-zadaniya": "assignments",
            "vysotsky-ch-zadanie-2-pismo-domoy": "assignments",
            "vysotsky-ch-zadanie-3-reportazh-s-bratskoy-mogily": "assignments",
            "vysotsky-ch-zadanie-4-tekst-dlya-pamyatnoy-tablichki": "assignments",
            "vysotsky-ch-zadaniya-s-proverkoy-iskusstvennogo-intellekta": "assignments",
            "vysotsky-ch-zadanie-2-emotsionalnyy-portret-geroya": "assignments",
            "vysotsky-ch-zadanie-3-otzyv-ot-litsa-veterana": "assignments",
            "vysotsky-ch-zadanie-4-sravnitelnyy-otzyv": "assignments",
            "vysotsky-ch-videomaterialy-razdela": "supplementary",
            "vysotsky-ch-istochniki-i-literatura": "supplementary",
            "vysotsky-ch-pervichnye-istochniki": "supplementary",
            "vysotsky-ch-biograficheskie-istochniki": "supplementary",
            "vysotsky-ch-nauchnye-i-kriticheskie-raboty": "supplementary",
            "vysotsky-ch-dokumentalnye-materialy": "supplementary",
            "vysotsky-ch-onlayn-resursy": "supplementary",
            "vysotsky-ch-itog": "supplementary",
            "vysotsky-ch-mesto-v-s-vysotskogo-v-literature-o-voyne": "supplementary",
            "vysotsky-ch-itogovye-tezisy": "supplementary",
            "vysotsky-ch-finalnoe-pismennoe-zadanie": "assignments",
            "vysotsky-ch-video-finalnyy-akkord-razdela-zhivoe-ispolnenie": "supplementary",
            "vysotsky-ch-stranitsy-biografii-kotoryh-net-v-uchebnikah": "extra_bio",
        }
        if cid in v_map:
            return v_map[cid]

    if author_id == "tvardovsky":
        t_map = {
            "biography": "bio",
            "author": "works_intro",
            "works": "works",
            "terkin": "works",
            "episodes": "context",
            "interesting": "context",
            "extra": "supplementary",
            "extra-bio-pages": "extra_bio",
            "problems": "problems",
            "reflection": "reflection",
            "questions": "reflection",
            "next": "transition",
        }
        if cid in t_map:
            return t_map[cid]

    if author_id == "okudzhava":
        o_map = {
            "ok-bio": "bio",
            "ok-intro": "works_intro",
            "ok-works": "works",
            "ok-context": "context",
            "ok-extra-materials": "context",
            "ok-problems": "problems",
            "ok-reflection": "reflection",
            "ok-questions": "reflection",
            "ok-final": "supplementary",
            "ok-extra-bio-pages": "extra_bio",
        }
        if cid in o_map:
            return o_map[cid]

    if author_id == "rybakov":
        if "биография" in title:
            return "bio"
        if "война в произведениях" in title:
            return "works_intro"
        if "уровень" in title:
            return "reflection"
        return "works"

    if author_id == "akhmatova":
        if "знакомство с автором" in title or "биограф" in title:
            return "bio"
        if "война в произведениях" in title:
            return "works_intro"
        if "ростовых" in title or "уровень" in title:
            return "reflection"
        return "works"

    if author_id == "vasilyev":
        if "биография" in title:
            return "bio"
        if "война в произведениях" in title:
            return "works_intro"
        if "уровень" in title:
            return "reflection"
        if "литературовед" in title:
            return "supplementary"
        return "works"

    if author_id == "bykov":
        if "жизнь и творческий" in title:
            return "bio"
        if "война в произведениях" in title:
            return "works_intro"
        if "уровень" in title or "ростовые задания" in title:
            return "assignments"
        if "человек на весах" in title:
            return "supplementary"
        return "works"

    if author_id == "evtyushenko":
        if cid == "ev-intro":
            return "works_intro"
        bio_titles = (
            "детство",
            "москва",
            "шестидесятники",
            "власть, скандалы",
            "поздние годы",
        )
        if any(t in title for t in bio_titles):
            return "bio"
        if "страницы биографии" in title:
            return "extra_bio"
        if "почему война" in title:
            return "why_war"
        if "описание произведений" in title or title.startswith("общий вывод"):
            return "works"
        if any(k in title for k in ("человек эпохи", "как это создавалось")):
            return "context"
        if "проблем" in title:
            return "problems"
        if any(k in title for k in ("раздумий", "вопросы по", "уровень", "итоговое размышление")):
            return "reflection"
        if any(k in title for k in ("задани", "рекомендации", "оцениваться", "сравнительная таблица")):
            return "assignments"
        if any(k in title for k in ("видеоматериалы", "источники")):
            return "supplementary"
        if title == "письменное задание":
            return "assignments"

    if title == "переход" or cid in {"next"} or cid.endswith("-perehod"):
        return "transition"
    if "страницы биографии" in title or "stranitsy-biografii" in cid:
        return "extra_bio"

    if re.search(r"видео\s*\d|^\[видео", title, re.I) or (
        "video-" in cid and "videomaterialy" not in cid
    ):
        return "supplementary"

    if any(k in cid for k in ("istochniki", "pervichnye", "nauchnye", "dokumentalnye", "onlayn")):
        return "supplementary"

    if any(
        k in title
        for k in (
            "источники",
            "литература",
            "онлайн-ресурс",
            "видеоматериалы",
            "итоговые тезисы",
            "место ",
            " в литературе",
        )
    ):
        return "supplementary"

    if any(
        k in title
        for k in (
            "задания с проверкой",
            "как будет оцениваться",
            "общие рекомендации",
            "сравнительная таблица",
        )
    ):
        return "assignments"
    if re.match(r"^задание\s+\d", title) or title.startswith("задание "):
        return "assignments"
    if title == "задания":
        return "assignments"

    if "итог" in title and "итоговое размышление" not in title:
        return "supplementary"

    if any(k in title for k in ("уровень 1", "уровень 2", "уровень 3", "вопросы по")):
        return "reflection"
    if "раздумий" in title:
        return "reflection"

    if "проблем" in title:
        return "problems"
    if "почему война" in title:
        return "why_war"

    if any(
        k in title
        for k in (
            "как это создавалось",
            "история создания",
            "человек эпохи",
            "дополнительные материалы",
            "интересное из",
            "ключевые эпизоды",
        )
    ):
        return "context"

    if any(
        k in title
        for k in (
            "война в произведениях",
            "эхо войны",
            "фронтовая лирика",
            "опалённые войной",
        )
    ):
        return "works_intro"

    if "описание произведен" in title or title == "произведения" or "«" in title:
        return "works"

    if "биограф" in title and "страницы" not in title:
        return "bio"

    return "works"


VYSOTSKY_SUPPLEMENTARY_ORDER = [
    "vysotsky-ch-videomaterialy-razdela",
    "vysotsky-ch-istochniki-i-literatura",
    "vysotsky-ch-pervichnye-istochniki",
    "vysotsky-ch-biograficheskie-istochniki",
    "vysotsky-ch-nauchnye-i-kriticheskie-raboty",
    "vysotsky-ch-dokumentalnye-materialy",
    "vysotsky-ch-onlayn-resursy",
    "vysotsky-ch-itog",
    "vysotsky-ch-mesto-v-s-vysotskogo-v-literature-o-voyne",
    "vysotsky-ch-itogovye-tezisy",
    "vysotsky-ch-video-finalnyy-akkord-razdela-zhivoe-ispolnenie",
]


def sort_bucket(chapters: list[dict], author_id: str, bucket: str) -> list[dict]:
    if author_id == "vysotsky" and bucket == "supplementary":
        order = {cid: idx for idx, cid in enumerate(VYSOTSKY_SUPPLEMENTARY_ORDER)}
        return sorted(chapters, key=lambda ch: order.get(ch.get("id", ""), 999))
    return chapters


def move_tvardovsky_perehod(chapters: list[dict]) -> list[dict]:
    bio = next((c for c in chapters if c["id"] == "biography"), None)
    intro = next((c for c in chapters if c["id"] == "author"), None)
    if not bio or not intro:
        return chapters

    perehod = None
    kept_sections = []
    for section in bio.get("sections", []):
        if section["id"] == "perehod-ot-biografii-k-proizvedeniyu":
            perehod = section
        else:
            kept_sections.append(section)
    if not perehod:
        return chapters

    bio["sections"] = kept_sections
    intro.setdefault("sections", []).append(perehod)
    return chapters


def merge_vysotsky_videos(chapters: list[dict]) -> list[dict]:
    video_parent = next((c for c in chapters if c["id"] == "vysotsky-ch-videomaterialy-razdela"), None)
    if not video_parent:
        return chapters

    merged = []
    for ch in chapters:
        title = ch.get("title", "")
        cid = ch.get("id", "")
        if cid == video_parent["id"]:
            merged.append(ch)
            continue
        if re.search(r"^видео\s*\d|^\[видео", title, re.I) or (
            "video-" in cid and "videomaterialy" not in cid and cid != "vysotsky-ch-video-finalnyy-akkord-razdela-zhivoe-ispolnenie"
        ):
            if title.startswith("[") or title.upper().startswith("ВИДЕО"):
                section = {
                    "id": cid.replace("vysotsky-ch-", "vysotsky-"),
                    "title": title,
                    "lead": "",
                    "blocks": [],
                }
                for sec in ch.get("sections", []):
                    section["lead"] = sec.get("lead", "") or section["lead"]
                    section["blocks"].extend(sec.get("blocks", []))
                if not section["blocks"] and section["lead"]:
                    section["blocks"] = [{"type": "p", "text": section["lead"]}]
                    section["lead"] = ""
                video_parent.setdefault("sections", []).append(section)
            continue
        merged.append(ch)
    return merged


def split_okudzhava_extra(chapters: list[dict]) -> list[dict]:
    extra = next((c for c in chapters if c["id"] == "ok-extra"), None)
    if not extra:
        return chapters

    bio_sections = []
    other_sections = []
    for section in extra.get("sections", []):
        sid = section.get("id", "")
        if "stranitsy-biografii" in sid:
            bio_sections.append(section)
        else:
            other_sections.append(section)

    result = [c for c in chapters if c["id"] != "ok-extra"]
    if other_sections:
        supp = dict(extra)
        supp["id"] = "ok-extra-materials"
        supp["title"] = "Дополнительные материалы"
        supp["sections"] = other_sections
        result.append(supp)
    if bio_sections:
        bio_ch = dict(extra)
        bio_ch["id"] = "ok-extra-bio-pages"
        bio_ch["title"] = "Страницы биографии, которых нет в учебниках"
        bio_ch["sections"] = bio_sections
        result.append(bio_ch)
    return result


def split_tvardovsky_extra(chapters: list[dict]) -> list[dict]:
    extra = next((c for c in chapters if c["id"] == "extra"), None)
    if not extra:
        return chapters

    bio_sections = []
    other_sections = []
    for section in extra.get("sections", []):
        sid = section.get("id", "")
        if "stranitsy-biografii" in sid:
            bio_sections.append(section)
        else:
            other_sections.append(section)

    result = [c for c in chapters if c["id"] != "extra"]
    if other_sections:
        supp = dict(extra)
        supp["title"] = "Дополнительные материалы"
        supp["sections"] = other_sections
        result.append(supp)
    if bio_sections:
        bio_ch = dict(extra)
        bio_ch["id"] = "extra-bio-pages"
        bio_ch["title"] = "Страницы биографии, которых нет в учебниках"
        bio_ch["sections"] = bio_sections
        result.append(bio_ch)
    return result


def reorder_author(chapters: list[dict], author_id: str) -> list[dict]:
    chapters = deepcopy(chapters)

    if author_id == "tvardovsky":
        chapters = move_tvardovsky_perehod(chapters)
        chapters = split_tvardovsky_extra(chapters)
    if author_id == "okudzhava":
        chapters = split_okudzhava_extra(chapters)
    if author_id == "vysotsky":
        chapters = merge_vysotsky_videos(chapters)

    buckets: dict[str, list[dict]] = {name: [] for name in BUCKET_ORDER}
    for ch in chapters:
        bucket = classify(ch, author_id)
        buckets.setdefault(bucket, []).append(ch)

    ordered: list[dict] = []
    for name in BUCKET_ORDER:
        ordered.extend(sort_bucket(buckets.get(name, []), author_id, name))

    label = "Глава" if author_id == "tvardovsky" else "Раздел"
    for idx, ch in enumerate(ordered, start=1):
        ch["number"] = f"{label} {idx}"
    return ordered


def build_title_page(data: dict) -> dict:
    author_names = [a["fullName"] or a["name"] for a in data.get("authors", [])]
    return {
        "id": "title-page",
        "authorId": "book",
        "isTitlePage": True,
        "number": "",
        "title": data.get("title", "Литература эпохи Великой Отечественной войны"),
        "sections": [
            {
                "id": "title-page-main",
                "isTitlePage": True,
                "title": data.get("title", "Литература эпохи Великой Отечественной войны"),
                "lead": data.get("subtitle", "Электронный учебник по литературе"),
                "blocks": [
                    {
                        "type": "p",
                        "text": "Учебное пособие для изучения русской литературы о Великой Отечественной войне через биографию авторов, анализ произведений, проблемные вопросы и творческие задания.",
                    },
                    {
                        "type": "list",
                        "items": author_names,
                    },
                ],
            }
        ],
    }


def main() -> None:
    data = load_textbook()
    author_order = [
        "tvardovsky",
        "okudzhava",
        "zabolotsky",
        "vysotsky",
        "evtyushenko",
        "rybakov",
        "akhmatova",
        "vasilyev",
        "bykov",
    ]
    by_author: dict[str, list[dict]] = {aid: [] for aid in author_order}

    for chapter in data.get("chapters", []):
        aid = chapter.get("authorId", data.get("authorId", "tvardovsky"))
        if aid in by_author:
            by_author[aid].append(chapter)

    new_chapters = [build_title_page(data)]
    for aid in author_order:
        chs = by_author.get(aid, [])
        if not chs:
            continue
        reordered = reorder_author(chs, aid)
        for ch in reordered:
            ch["authorId"] = aid
        new_chapters.extend(reordered)

    data["titlePage"] = {
        "enabled": True,
        "sectionId": "title-page-main",
    }
    data["chapters"] = new_chapters
    save_textbook(data)

    subprocess.run(
        ["node", "-e", "require('fs').readFileSync('content.js','utf8'); console.log('OK');"],
        cwd=ROOT,
        check=True,
    )
    print(f"Unified {len(new_chapters)} chapters (incl. title page)")


if __name__ == "__main__":
    main()
