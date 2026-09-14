#!/usr/bin/env node
/**
 * convert-textbook.mjs
 * -----------------------------------------------------------------------
 * Конвертация author_*.js (window.TEXTBOOK_<AUTHOR> = {...}) в набор .docx
 * файлов по требованиям ОЭС + отчёт по содержанию/шаблонности тестов.
 *
 * ЗАПУСК:
 *   node convert-textbook.mjs content_parts/author_vasilyev.js
 *   node convert-textbook.mjs content_parts/author_vasilyev.js --out=out --per-file=3
 *
 * НИЧЕГО не пишет обратно в исходный .js — только читает.
 * -----------------------------------------------------------------------
 * ДОПУЩЕНИЯ, которые стоит проверить на первом же реальном прогоне:
 *  - буквы вариантов ответа: кириллица а) б) в) г) д) е) — поменяйте LETTERS,
 *    если нужен другой алфавит/латиница.
 *  - оформление врезки "note" = таблица 1x1, заливка F2F2F2, как в эталоне
 *    (там же был тип "Источники информации"). Для смысловых "Заданий" тот же
 *    стиль — при желании можно развести на два разных вида врезок.
 *  - формат тестового вопроса (нумерация, "Ответ:", "Пояснение:") — рабочий
 *    вариант для печатного пособия, не найден в эталонных файлах напрямую,
 *    т.к. там тренажёры не встретились "как есть". Проверьте первый
 *    сгенерированный файл глазами перед массовым прогоном.
 *  - блок "video" полностью пропускается (веб-only), с пометкой в отчёте.
 *  - блок "terms" рендерится как список "Термин — текст", отступ как список.
 * -----------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, HeadingLevel,
  PageNumber, Header, Footer, convertMillimetersToTwip,
} from "docx";

// ============================== КОНФИГ ===================================

const CHAPTERS_PER_FILE = 3;     // как в эталоне (Файл 4 = обложка + 3 главы)
const LETTERS = ["а", "б", "в", "г", "д", "е", "ж"];
const DUP_OPTION_THRESHOLD = 3;  // сколько раз должен повториться дословно
                                  // один и тот же дистрактор, чтобы попасть в отчёт

const FONT = "Times New Roman";
const SZ_BODY = 28;   // half-points = 14pt
const SZ_FOOTER = 20; // half-points = 10pt

const MARGIN_TOP = convertMillimetersToTwip(10);
const MARGIN_BOTTOM = convertMillimetersToTwip(10);
const MARGIN_LEFT = convertMillimetersToTwip(20);
const MARGIN_RIGHT = convertMillimetersToTwip(10);
const FIRST_LINE_INDENT = convertMillimetersToTwip(12.5); // 1.25 см

// space_after в твипах (взято из разбора эталона: 15pt/10pt/7.5pt/5pt)
const SPACE_CHAPTER = 300;
const SPACE_SUBTITLE = 200;
const SPACE_NORMAL = 150;
const SPACE_LISTITEM = 100;

// ============================ ПАРСИНГ JS ==================================

function loadTextbook(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Не нашёл границы объекта в ${filePath}`);
  }
  const jsonLike = raw.slice(start, end + 1);
  return JSON.parse(jsonLike);
}

// ========================== СИД-ШАФЛ (детерминированный) =================

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffleIndices(n, seedStr) {
  const rnd = mulberry32(hashString(seedStr));
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx; // idx[newPos] = oldPos
}

// ============================ DOCX-СТИЛИ ===================================

function chapterTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: SPACE_CHAPTER, line: 240, lineRule: "auto" },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, font: FONT, size: SZ_BODY })],
  });
}

function subTitle(text, italic = false) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: SPACE_SUBTITLE, line: 240, lineRule: "auto" },
    children: [new TextRun({ text, bold: true, italics: italic, font: FONT, size: SZ_BODY })],
  });
}

function normal(text, { indent = true } = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: SPACE_NORMAL, line: 240, lineRule: "auto" },
    indent: indent ? { firstLine: FIRST_LINE_INDENT } : undefined,
    children: [new TextRun({ text, font: FONT, size: SZ_BODY })],
  });
}

function photoPlaceholder(caption) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: SPACE_NORMAL, line: 240, lineRule: "auto" },
    children: [
      new TextRun({
        text: `ФОТО: ${caption || "без подписи — проверить исходник"}`,
        bold: true, font: FONT, size: SZ_BODY, highlight: "yellow",
      }),
    ],
  });
}

function listBlock(items) {
  return items.map((it, i) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: SPACE_LISTITEM, line: 240, lineRule: "auto" },
      indent: { left: FIRST_LINE_INDENT },
      children: [new TextRun({ text: `${i + 1}. ${it}`, font: FONT, size: SZ_BODY })],
    })
  );
}

function termsBlock(title, items) {
  const paras = [subTitle(title, true)];
  for (const it of items) {
    paras.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: SPACE_NORMAL, line: 240, lineRule: "auto" },
      indent: { firstLine: FIRST_LINE_INDENT },
      children: [
        new TextRun({ text: `${it.term} — `, bold: true, font: FONT, size: SZ_BODY }),
        new TextRun({ text: it.text || "", font: FONT, size: SZ_BODY }),
      ],
    }));
  }
  return paras;
}

function noteBox(title, text) {
  const cellParas = [];
  if (title) cellParas.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text: title, bold: true, font: FONT, size: SZ_BODY })],
  }));
  cellParas.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text: text || "", font: FONT, size: SZ_BODY })],
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: 100, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" },
        children: cellParas,
      })],
    })],
  });
}

// ---- тестовый вопрос (тренажёр -> печатное задание, формат по эталону Файл_7) ----
// Эталон: вопрос жирным без отступа, варианты без жирного с отступом 17.8мм,
// БЕЗ пояснения построчно — вместо этого один "Ключ: 1-а, 2-б, ..." в конце
// блока (курсив, серая заливка, левое выравнивание).

const OPTION_INDENT = convertMillimetersToTwip(17.8);

function trainerQuestionParas(q, qNumber, seedPrefix, report, keyAccumulator) {
  const options = q.options || [];
  const originalCorrectIdx = q.answer;

  report.answerPositionsBefore.push(originalCorrectIdx);

  const order = seededShuffleIndices(options.length, `${seedPrefix}::${q.prompt}`);
  const shuffledOptions = order.map((oldIdx) => options[oldIdx]);
  const newCorrectIdx = order.indexOf(originalCorrectIdx);

  report.answerPositionsAfter.push(newCorrectIdx);

  const normPrompt = (q.prompt || "").trim().toLowerCase().replace(/\s+/g, " ");
  report.allQuestionPrompts.push({ prompt: normPrompt, raw: q.prompt, seedPrefix });
  for (const opt of options) {
    const normOpt = (opt || "").trim().toLowerCase().replace(/\s+/g, " ");
    report.optionCounts.set(normOpt, (report.optionCounts.get(normOpt) || 0) + 1);
  }

  const letter = LETTERS[newCorrectIdx] || `${newCorrectIdx + 1}`;
  keyAccumulator.push(`${qNumber}-${letter}`);
  // explanation теряется при печати (эталон её не показывает) — но сохраняем
  // в отчёт, вдруг пригодится для проверки содержания/пропуска смысла
  if (q.explanation) report.droppedExplanations = (report.droppedExplanations || 0) + 1;

  const paras = [];
  paras.push(new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: SPACE_LISTITEM, line: 240, lineRule: "auto" },
    children: [new TextRun({ text: `${qNumber}. ${q.prompt}`, bold: true, font: FONT, size: SZ_BODY })],
  }));
  shuffledOptions.forEach((opt, i) => {
    const optLetter = LETTERS[i] || `${i + 1}`;
    paras.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 40, line: 240, lineRule: "auto" },
      indent: { left: OPTION_INDENT },
      children: [new TextRun({ text: `${optLetter}) ${opt}`, font: FONT, size: SZ_BODY })],
    }));
  });
  return paras;
}

function answerKeyPara(keyAccumulator) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: SPACE_NORMAL, line: 240, lineRule: "auto" },
    children: [new TextRun({
      text: `Ключ: ${keyAccumulator.join(", ")}`,
      italics: true, font: FONT, size: SZ_BODY, highlight: "lightGray",
    })],
  });
}

// ============================ ОБХОД БЛОКОВ =================================

// walkBlocks: превращает blocks[] в docx-элементы. Блоки type=trainer
// извлекаются и складываются в trainerSink (для отдельного файла), а НЕ
// вставляются инлайн — согласно правилу "тренажёры в отдельный файл".
function walkBlocks(blocks, ctx, out, trainerSink, report) {
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    switch (b.type) {
      case "p":
        out.push(normal(b.text || ""));
        report.counts.p = (report.counts.p || 0) + 1;
        break;
      case "h2":
        out.push(subTitle(b.text || ""));
        report.counts.h2 = (report.counts.h2 || 0) + 1;
        break;
      case "terms":
        out.push(...termsBlock(b.title, b.items || []));
        report.counts.terms = (report.counts.terms || 0) + 1;
        break;
      case "gallery":
        for (const img of b.images || []) out.push(photoPlaceholder(img.caption || img.alt));
        report.counts.gallery = (report.counts.gallery || 0) + 1;
        report.counts.galleryImages = (report.counts.galleryImages || 0) + (b.images || []).length;
        break;
      case "image":
        out.push(photoPlaceholder(b.caption || b.alt));
        report.counts.image = (report.counts.image || 0) + 1;
        break;
      case "list":
        out.push(...listBlock(b.items || []));
        report.counts.list = (report.counts.list || 0) + 1;
        break;
      case "note":
        out.push(noteBox(b.title, b.text));
        report.counts.note = (report.counts.note || 0) + 1;
        break;
      case "video":
        report.counts.videoSkipped = (report.counts.videoSkipped || 0) + 1;
        report.skippedVideo.push(`${ctx.author} / ${ctx.chapterTitle} / ${b.title || b.url || "(без названия)"}`);
        break; // веб-only, не выводим в печать
      case "trainer":
        trainerSink.push({ block: b, ctx });
        report.counts.trainer = (report.counts.trainer || 0) + 1;
        report.counts.trainerQuestions = (report.counts.trainerQuestions || 0) + (b.questions || []).length;
        break;
      default:
        report.unknownTypes.add(b.type);
        report.counts.unknown = (report.counts.unknown || 0) + 1;
    }
  }
}

// ============================ ФУТЕР/СЕКЦИЯ ==================================

function makeFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SZ_FOOTER })],
    })],
  });
}

function makeSection(children) {
  return {
    properties: {
      page: {
        margin: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: MARGIN_RIGHT },
      },
    },
    footers: { default: makeFooter() },
    children,
  };
}

async function saveDocx(children, outPath) {
  const doc = new Document({ sections: [makeSection(children)] });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buf);
}

// ============================== ОСНОВНОЙ ПРОЦЕСС ============================

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildReport(authorId) {
  return {
    author: authorId,
    counts: {},
    unknownTypes: new Set(),
    skippedVideo: [],
    allQuestionPrompts: [],
    optionCounts: new Map(),
    answerPositionsBefore: [],
    answerPositionsAfter: [],
  };
}

function histogram(arr, n) {
  const h = new Array(n).fill(0);
  for (const v of arr) if (v >= 0 && v < n) h[v]++;
  return h;
}

function findDuplicateQuestions(prompts) {
  const seen = new Map();
  const dups = [];
  for (const p of prompts) {
    if (seen.has(p.prompt)) {
      dups.push({ prompt: p.raw, where: [seen.get(p.prompt), `${p.seedPrefix}`] });
    } else {
      seen.set(p.prompt, p.seedPrefix);
    }
  }
  return dups;
}

function writeReportFile(report, outDir) {
  const lines = [];
  lines.push(`ОТЧЁТ ПО АВТОРУ: ${report.author}`);
  lines.push(`Сгенерировано: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("== Количество блоков по типам (источник) ==");
  for (const [k, v] of Object.entries(report.counts)) lines.push(`  ${k}: ${v}`);
  lines.push("");
  if (report.unknownTypes.size) {
    lines.push("== ВНИМАНИЕ: встречены НЕИЗВЕСТНЫЕ типы блоков (не обработаны!) ==");
    lines.push("  " + [...report.unknownTypes].join(", "));
    lines.push("  -> добавьте обработчик в walkBlocks(), иначе контент теряется молча.");
    lines.push("");
  }
  if (report.skippedVideo.length) {
    lines.push("== Пропущенные video-блоки (веб-only, не в печать) ==");
    for (const v of report.skippedVideo) lines.push(`  - ${v}`);
    lines.push("");
  }

  const dups = findDuplicateQuestions(report.allQuestionPrompts);
  lines.push(`== Повторяющиеся вопросы (дословно, после нормализации): ${dups.length} ==`);
  for (const d of dups.slice(0, 50)) lines.push(`  - "${d.prompt}"`);
  lines.push("");

  const repeatedOptions = [...report.optionCounts.entries()]
    .filter(([, c]) => c >= DUP_OPTION_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);
  lines.push(`== Дистракторы, повторяющиеся ${DUP_OPTION_THRESHOLD}+ раз дословно по всем тестам автора ==`);
  for (const [opt, c] of repeatedOptions.slice(0, 50)) lines.push(`  [${c}x] "${opt}"`);
  lines.push("");

  const n = Math.max(1, ...report.answerPositionsBefore.map((x) => x + 1), 1);
  const before = histogram(report.answerPositionsBefore, Math.max(n, 5));
  const after = histogram(report.answerPositionsAfter, Math.max(n, 5));
  lines.push("== Распределение позиции правильного ответа ДО перемешивания ==");
  lines.push("  " + before.map((c, i) => `${LETTERS[i] || i}:${c}`).join("  "));
  lines.push("== Распределение позиции правильного ответа ПОСЛЕ (seeded shuffle) ==");
  lines.push("  " + after.map((c, i) => `${LETTERS[i] || i}:${c}`).join("  "));
  lines.push("");
  lines.push(`Всего вопросов обработано: ${report.allQuestionPrompts.length}`);
  if (report.droppedExplanations) {
    lines.push(`Пояснений (explanation) НЕ напечатано (формат эталона их не показывает): ${report.droppedExplanations}`);
  }

  const outPath = path.join(outDir, `Отчёт_${report.author}.txt`);
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  return outPath;
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--"));
  const outDirArg = args.find((a) => a.startsWith("--out="));
  const perFileArg = args.find((a) => a.startsWith("--per-file="));
  const outDir = outDirArg ? outDirArg.split("=")[1] : "out";
  const perFile = perFileArg ? parseInt(perFileArg.split("=")[1], 10) : CHAPTERS_PER_FILE;

  if (!files.length) {
    console.error("Использование: node convert-textbook.mjs <author_*.js> [--out=DIR] [--per-file=N]");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    console.log(`\n=== Обработка: ${file} ===`);
    const data = loadTextbook(file);
    const authorId = data.authorId || path.basename(file, ".js");
    const authorName = (data.authors && data.authors[0] && data.authors[0].fullName) || authorId;
    const chapters = data.chapters || [];

    const report = buildReport(authorId);
    const trainerSink = [];

    // --- обычные главы, по perFile штук в файл ---
    const groups = chunk(chapters, perFile);
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const out = [];
      for (const ch of group) {
        const chNumber = ch.number && ch.number !== ch.title ? `${ch.number}. ` : "";
        out.push(chapterTitle(`${chNumber}${ch.title || ""}`));
        for (const sec of ch.sections || []) {
          if (sec.title && sec.title !== ch.title) out.push(subTitle(sec.title));
          walkBlocks(sec.blocks || [], { author: authorName, chapterTitle: ch.title }, out, trainerSink, report);
          // одиночное section-level "image" (встречается отдельно от blocks[])
          if (sec.image && sec.image.src) {
            out.push(photoPlaceholder(sec.image.caption));
            report.counts.sectionImage = (report.counts.sectionImage || 0) + 1;
          }
        }
      }
      const outPath = path.join(outDir, `Файл_${gi + 1}_${authorId}.docx`);
      await saveDocx(out, outPath);
      console.log(`  -> ${outPath} (глав: ${group.length})`);
    }

    // --- отдельный файл с тестами ---
    if (trainerSink.length) {
      const out = [chapterTitle(`Контрольные задания — ${authorName}`)];
      let totalQuestions = 0;
      for (const { block, ctx } of trainerSink) {
        out.push(subTitle(block.title || "Задания", true));
        if (block.text) out.push(normal(block.text));
        let qCounter = 0;
        const keyAccumulator = [];
        for (const q of block.questions || []) {
          qCounter++;
          totalQuestions++;
          out.push(...trainerQuestionParas(q, qCounter, `${authorId}::${ctx.chapterTitle}::${block.title}`, report, keyAccumulator));
        }
        if (keyAccumulator.length) out.push(answerKeyPara(keyAccumulator));
      }
      const outPath = path.join(outDir, `Файл_Тесты_${authorId}.docx`);
      await saveDocx(out, outPath);
      console.log(`  -> ${outPath} (вопросов: ${totalQuestions})`);
    }

    const reportPath = writeReportFile(report, outDir);
    console.log(`  -> ${reportPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
