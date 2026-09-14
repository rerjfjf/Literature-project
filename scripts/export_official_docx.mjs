// scripts/export_official_docx.mjs
// Сборка официального .docx пособия для подачи на областной Экспертный совет:
// титульный лист → оборот титульного листа → содержание → введение →
// основная часть (по всем авторам) → заключение → список литературы → приложения.
//
// Оформление по техническим требованиям ЭС:
//   Times New Roman 14, одинарный интервал, поля 20/10/10/10 мм,
//   абзацный отступ 1,25 см, выравнивание по ширине,
//   заголовки глав — прописными жирным без точки,
//   нумерация страниц — низ, справа, титульные листы и содержание не нумеруются.
//
// Установка зависимостей (один раз):
//   npm install docx image-size
//
// Перед запуском поправьте блок TITLE_INFO ниже (особенно "reviewers" —
// впишите рецензентов, когда они будут известны).
//
// Запуск:
//   node scripts/export_official_docx.mjs
//
// Результат: export/textbook_official.docx

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  AlignmentType,
  ShadingType,
  PageBreak,
  TableOfContents,
  Footer,
  PageNumber,
  TabStopType,
  TabStopPosition,
} from "docx";
import { loadTextbook, ROOT } from "./load_textbook.mjs";

// ---------------------------------------------------------------------------
// РЕДАКТИРУЕМЫЙ БЛОК: данные титульного листа
// ---------------------------------------------------------------------------
const TITLE_INFO = {
  authority: "Управление образования Карагандинской области",
  center: "Учебно-методический центр развития образования Карагандинской области",
  organization: "Карагандинский высший политехнический колледж",
  directorName: "Ж.З. Рахимова",
  directorOrgShort: "КГКП «Карагандинский высший политехнический колледж»",
  umcHeadName: "Б.Х. Абдикерова",
  approvalDate: "2026 г.",

  editionType: "Электронное учебно-наглядное пособие",
  title: "«Война, ты ранишь мою душу, но память о тебе живёт в моей душе»",
  subtitle: "(литература эпохи Великой Отечественной войны)",
  city: "Караганда",
  year: "2026",

  authors: [
    {
      role: "Идея, педагогическое сопровождение и содержательная редактура:",
      line: "преподаватель русского языка и литературы КГКП «Карагандинский высший политехнический колледж» Шилин Александр Геннадьевич",
    },
    {
      role: "Разработка (Full-stack), техническая реализация, вёрстка и корректура текста:",
      line: "студент группы 9-3ПО-25 Соковых Никита Андреевич",
    },
  ],

  // Впишите рецензентов, когда они будут назначены — оставьте пустые
  // подчёркивания, если пособие подаётся до их назначения.
  reviewers: [
    "________________________________, ________________________________",
    "________________________________, ________________________________",
  ],

  councilOrg: "Рекомендовано учебно-методическим советом КГКП «Карагандинский высший политехнический колледж»",
  councilProtocol: "Протокол № _____ от «____» _____________ 2026 г.",
  councilSecretary: "Секретарь: ________________________________",

  councilRegion: "Рекомендовано Научно-методическим советом",
  regionProtocol: "Протокол № _____ от «____» _____________ 2026 г.",
  regionSecretary: "Секретарь: ________________________________",
};

// ---------------------------------------------------------------------------
// Форматирование по техническим требованиям
// ---------------------------------------------------------------------------
const FONT = "Times New Roman";
const FONT_SIZE = 28; // 14pt (docx считает в half-points)
const MARGIN_LEFT = 1134; // 20 мм
const MARGIN_OTHER = 567; // 10 мм
const FIRST_LINE_INDENT = 709; // 1.25 см

let imageSize = null;
try {
  const mod = await import("image-size");
  imageSize = mod.default || mod.imageSize || mod;
} catch {
  console.warn("⚠️  Пакет image-size не установлен — изображения вставятся с размером по умолчанию (npm install image-size).");
}

function readImageBuffer(relPath) {
  if (!relPath) return null;
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs);
  } catch {
    return null;
  }
}

function imageDims(buffer, maxWidth = 420) {
  let width = maxWidth;
  let height = Math.round(maxWidth * 0.66);
  if (imageSize) {
    try {
      const dims = imageSize(buffer);
      if (dims?.width && dims?.height) {
        height = Math.round(maxWidth * (dims.height / dims.width));
      }
    } catch {
      // используем значения по умолчанию
    }
  }
  return { width, height };
}

function imageParagraphs(relPath, caption) {
  const buffer = readImageBuffer(relPath);
  const out = [];
  if (buffer) {
    const { width, height } = imageDims(buffer);
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120 },
        children: [new ImageRun({ data: buffer, type: "jpg", transformation: { width, height } })],
      })
    );
  } else if (relPath) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `[изображение не найдено: ${relPath}]`, italics: true, color: "9F4F35" })],
      })
    );
  }
  if (caption) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: caption, italics: true, size: 22, color: "70695F" })],
      })
    );
  }
  return out;
}

function bodyParagraph(text, options = {}) {
  return new Paragraph({
    indent: options.noIndent ? undefined : { firstLine: FIRST_LINE_INDENT },
    alignment: options.noJustify ? undefined : AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 240, lineRule: "auto" },
    children: [new TextRun({ text: text || "", italics: options.italic, bold: options.bold })],
  });
}

function subheading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text: text || "", bold: true, color: "000000" })],
  });
}

function blockToParagraphs(block) {
  switch (block.type) {
    case "h2":
      return [subheading(block.text)];

    case "list":
      return (block.items || []).map(
        (item) =>
          new Paragraph({
            text: item,
            bullet: { level: 0 },
            spacing: { after: 100, line: 240, lineRule: "auto" },
          })
      );

    case "table": {
      const [head, ...rows] = block.rows || [];
      const makeRow = (cells, isHead) =>
        new TableRow({
          children: cells.map(
            (cell) =>
              new TableCell({
                shading: isHead ? { fill: "F2EFE6", type: ShadingType.CLEAR } : undefined,
                children: [new Paragraph({ children: [new TextRun({ text: String(cell), bold: isHead })] })],
              })
          ),
        });
      const tableRows = [];
      if (head) tableRows.push(makeRow(head, true));
      rows.forEach((row) => tableRows.push(makeRow(row, false)));
      return [
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
        new Paragraph({ text: "", spacing: { after: 160 } }),
      ];
    }

    case "image":
      return imageParagraphs(block.src, block.caption);

    case "gallery": {
      const heading = subheading(block.title || "Фотоматериалы");
      const images = (block.images || []).flatMap((item) => imageParagraphs(item.src, item.caption));
      return [heading, ...images];
    }

    case "terms": {
      const heading = subheading(block.title || "Ключевые термины");
      const items = (block.items || []).map(
        (item) =>
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: `${item.term}. `, bold: true }),
              new TextRun({ text: item.text || "" }),
            ],
          })
      );
      return [heading, ...items];
    }

    case "video":
      return [
        bodyParagraph(`🎬 ${block.title || "Видеоматериал"}. Видео доступно в видеотеке учебника (videos.html).`, {
          noIndent: true,
          noJustify: true,
        }),
      ];

    case "trainer": {
      const heading = subheading(block.title || "Тренажёр");
      const intro = block.text ? [bodyParagraph(block.text)] : [];
      const questions = (block.questions || []).flatMap((question, index) => {
        const qPara = new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [new TextRun({ text: `${index + 1}. ${question.prompt}`, bold: true })],
        });
        const options = (question.options || []).map(
          (option, optionIndex) =>
            new Paragraph({
              text: `${String.fromCharCode(97 + optionIndex)}) ${option}`,
              spacing: { after: 40 },
              indent: { left: 360 },
            })
        );
        return [qPara, ...options];
      });
      return [heading, ...intro, ...questions];
    }

    case "note": {
      const isAssignment = (block.title || "").toLowerCase().includes("задание");
      const title = new Paragraph({
        shading: { fill: "F8F3E9", type: ShadingType.CLEAR },
        spacing: { before: 160, after: 40 },
        children: [new TextRun({ text: block.title || "", bold: true })],
      });
      const text = new Paragraph({
        shading: { fill: "F8F3E9", type: ShadingType.CLEAR },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: isAssignment ? 60 : 160 },
        children: [new TextRun({ text: block.text || "" })],
      });
      if (!isAssignment) return [title, text];
      const answerLines = Array.from({ length: 4 }).map(
        () =>
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } },
            spacing: { after: 220 },
            children: [new TextRun({ text: " " })],
          })
      );
      return [title, text, ...answerLines];
    }

    case "quote":
      return [
        new Paragraph({
          indent: { left: 480 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: "9F4F35" } },
          spacing: { after: 160 },
          children: [new TextRun({ text: block.text || "", italics: true })],
        }),
      ];

    default:
      return [bodyParagraph(block.text)];
  }
}

function chapterHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: text || "", bold: true, allCaps: true, color: "000000" })],
  });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 100, after: 160 },
    children: [new TextRun({ text: text || "", bold: true, color: "000000" })],
  });
}

// ---------------------------------------------------------------------------
// Титульный лист и оборот
// ---------------------------------------------------------------------------
function buildTitlePages() {
  const centered = (text, opts = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: opts.after ?? 60 },
      children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? FONT_SIZE })],
    });

  const gridRow = (leftLines, rightLines) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: leftLines.map((line) => new Paragraph({ children: [new TextRun({ text: line, size: FONT_SIZE })] })),
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: rightLines.map((line) => new Paragraph({ children: [new TextRun({ text: line, size: FONT_SIZE })] })),
            }),
          ],
        }),
      ],
    });

  const titlePage = [
    centered(TITLE_INFO.authority),
    centered(TITLE_INFO.center),
    centered(TITLE_INFO.organization, { after: 400 }),

    gridRow(
      ["Согласовано", `Директор ${TITLE_INFO.directorOrgShort}`, "", `_________ ${TITLE_INFO.directorName}`, `«____» _______ ${TITLE_INFO.approvalDate}`],
      [
        "Утверждаю",
        "Руководитель",
        "учебно-методического центра",
        "развития образования",
        "Карагандинской области",
        `_______ ${TITLE_INFO.umcHeadName}`,
        `«____» _______ ${TITLE_INFO.approvalDate}`,
      ]
    ),

    new Paragraph({ text: "", spacing: { before: 600, after: 200 } }),
    centered(TITLE_INFO.editionType, { bold: true, size: 28, after: 200 }),
    centered(TITLE_INFO.title, { bold: true, size: 32, after: 100 }),
    centered(TITLE_INFO.subtitle, { size: 24, after: 600 }),
    centered(`${TITLE_INFO.city}, ${TITLE_INFO.year} г.`),

    new Paragraph({ children: [new PageBreak()] }),
  ];

  const reverseTitlePage = [
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: "Авторы:", bold: true })],
    }),
    ...TITLE_INFO.authors.flatMap((author) => [
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: author.role, italics: true })] }),
      new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: author.line })] }),
    ]),

    new Paragraph({
      spacing: { before: 200, after: 160 },
      children: [new TextRun({ text: "Рецензенты:", bold: true })],
    }),
    ...TITLE_INFO.reviewers.map((line) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: line })] })),

    new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: TITLE_INFO.councilOrg })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: TITLE_INFO.councilProtocol })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: TITLE_INFO.councilSecretary })] }),

    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: TITLE_INFO.councilRegion })] }),
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: TITLE_INFO.regionProtocol })] }),
    new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: TITLE_INFO.regionSecretary })] }),

    new Paragraph({ children: [new PageBreak()] }),
  ];

  return [...titlePage, ...reverseTitlePage];
}

// ---------------------------------------------------------------------------
// Основной документ
// ---------------------------------------------------------------------------
function buildDocument(textbook) {
  const authors = textbook.authors || [];
  const findAuthor = (id) => authors.find((a) => a.id === id);

  const introChapter = textbook.chapters.find((c) => c.authorId === "intro");
  const conclusionChapter = textbook.chapters.find((c) => c.authorId === "conclusion");
  const appendicesChapters = textbook.chapters.filter((c) => c.authorId === "appendices");
  const bibliographyChapter = appendicesChapters.find((c) => c.id === "appendices-bibliography-chapter");
  const otherAppendices = appendicesChapters.filter((c) => c.id !== "appendices-bibliography-chapter");

  const mainChapters = textbook.chapters.filter(
    (c) => !["intro", "conclusion", "appendices"].includes(c.authorId)
  );

  const renderSectionBlocks = (section) => {
    const out = [];
    if (section.lead) out.push(bodyParagraph(section.lead, { italic: true }));
    (section.blocks || []).forEach((block) => out.push(...blockToParagraphs(block)));
    return out;
  };

  const children = [];

  // --- ВВЕДЕНИЕ ---
  if (introChapter) {
    children.push(chapterHeading("Введение"));
    introChapter.sections.forEach((section) => children.push(...renderSectionBlocks(section)));
  }

  // --- ОСНОВНАЯ ЧАСТЬ ---
  children.push(chapterHeading("Основная часть"));
  mainChapters.forEach((chapter, chapterIndex) => {
    const author = findAuthor(chapter.authorId);
    const authorName = author ? author.fullName || author.name : "";
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: chapterIndex > 0,
        spacing: { after: 160 },
        children: [new TextRun({ text: `${chapter.title}${authorName ? ` — ${authorName}` : ""}`, bold: true, color: "000000" })],
      })
    );
    chapter.sections.forEach((section) => {
      if (section.title !== chapter.title) children.push(sectionHeading(section.title));
      children.push(...renderSectionBlocks(section));
    });
  });

  // --- ЗАКЛЮЧЕНИЕ ---
  if (conclusionChapter) {
    children.push(chapterHeading("Заключение"));
    conclusionChapter.sections.forEach((section) => children.push(...renderSectionBlocks(section)));
  }

  // --- СПИСОК ИСПОЛЬЗОВАННОЙ ЛИТЕРАТУРЫ ---
  if (bibliographyChapter) {
    children.push(chapterHeading("Список использованной литературы"));
    bibliographyChapter.sections.forEach((section) => children.push(...renderSectionBlocks(section)));
  }

  // --- ПРИЛОЖЕНИЯ ---
  if (otherAppendices.length) {
    children.push(chapterHeading("Приложения"));
    otherAppendices.forEach((chapter) => {
      chapter.sections.forEach((section) => {
        children.push(sectionHeading(`${chapter.number ? chapter.number + ". " : ""}${section.title}`));
        children.push(...renderSectionBlocks(section));
      });
    });
  }

  const pageProps = {
    page: {
      size: { width: 11906, height: 16838 }, // A4 в DXA
      margin: { top: MARGIN_OTHER, bottom: MARGIN_OTHER, left: MARGIN_LEFT, right: MARGIN_OTHER },
    },
  };

  const footerWithPageNumber = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 20 })],
      }),
    ],
  });

  return new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: FONT_SIZE } },
      },
    },
    sections: [
      {
        // Раздел 1: титульный лист + оборот — без нумерации страниц
        properties: { ...pageProps, titlePage: true },
        children: buildTitlePages(),
      },
      {
        // Раздел 2: содержание — без нумерации страниц
        properties: { ...pageProps, titlePage: true },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: "СОДЕРЖАНИЕ", bold: true, color: "000000" })],
          }),
          new TableOfContents("Содержание", {
            hyperlink: true,
            headingStyleRange: "1-2",
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: "(Чтобы содержание отобразило номера страниц — в Word: правой кнопкой по содержанию → «Обновить поле» → «обновить целиком».)",
                italics: true,
                size: 20,
                color: "70695F",
              }),
            ],
          }),
          new Paragraph({ children: [new PageBreak()] }),
        ],
      },
      {
        // Раздел 3: основной текст — нумерация страниц с 1
        properties: {
          ...pageProps,
          page: { ...pageProps.page, pageNumbers: { start: 1 } },
        },
        footers: { default: footerWithPageNumber },
        children,
      },
    ],
  });
}

async function main() {
  const textbook = loadTextbook();
  const doc = buildDocument(textbook);
  const buffer = await Packer.toBuffer(doc);
  const outDir = join(ROOT, "export");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "textbook_official.docx");
  writeFileSync(outPath, buffer);
  console.log(`✅ Официальный Word-файл создан: ${outPath}`);
  console.log(`   Не забудьте открыть его и обновить поле "Содержание" (F9 или правый клик → Обновить поле).`);
}

main().catch((error) => {
  console.error("❌ Ошибка экспорта:", error);
  process.exit(1);
});
