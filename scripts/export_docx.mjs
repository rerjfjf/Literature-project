// scripts/export_docx.mjs

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
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
  VerticalAlign,
} from "docx";

import { loadTextbook, ROOT } from "./load_textbook.mjs";

let imageSize = null;

try {
  const mod = await import("image-size");
  imageSize = mod.default || mod.imageSize || mod;
} catch {
  console.warn("⚠️ image-size не установлен.");
  console.warn("   Установи: npm install image-size");
}

// ============================================================
// НАСТРОЙКИ
// ============================================================

// A4: 210 × 297 мм
// Поля: 18 мм слева/справа
// Доступная ширина ≈ 174 мм
//
// В DOCX размеры ImageRun задаются в пикселях.
// 1 мм ≈ 3.78 px.
//
// 174 мм ≈ 658 px
const PAGE_WIDTH_PX = 650;

const CELL_PADDING = {
  top: 100,
  bottom: 100,
  left: 120,
  right: 120,
};

// ============================================================
// ФАЙЛЫ
// ============================================================

function readImageBuffer(relPath) {
  if (!relPath) return null;

  const abs = join(ROOT, relPath);

  if (!existsSync(abs)) {
    return null;
  }

  try {
    return readFileSync(abs);
  } catch {
    return null;
  }
}

// ============================================================
// РАЗМЕРЫ ИЗОБРАЖЕНИЙ
// ============================================================

function imageDims(buffer, maxWidth = PAGE_WIDTH_PX) {
  if (!buffer) {
    return {
      width: maxWidth,
      height: Math.round(maxWidth * 0.66),
    };
  }

  if (!imageSize) {
    return {
      width: maxWidth,
      height: Math.round(maxWidth * 0.66),
    };
  }

  try {
    const dims = imageSize(buffer);

    if (!dims?.width || !dims?.height) {
      return {
        width: maxWidth,
        height: Math.round(maxWidth * 0.66),
      };
    }

    const originalWidth = Number(dims.width);
    const originalHeight = Number(dims.height);

    // Не увеличиваем маленькие изображения
    const width = Math.min(originalWidth, maxWidth);

    const height = Math.round(
      width * (originalHeight / originalWidth)
    );

    return {
      width,
      height,
    };
  } catch {
    return {
      width: maxWidth,
      height: Math.round(maxWidth * 0.66),
    };
  }
}

// ============================================================
// ИЗОБРАЖЕНИЕ
// ============================================================

function imageParagraphs(relPath, caption) {
  const buffer = readImageBuffer(relPath);

  const result = [];

  if (buffer) {
    const { width, height } = imageDims(buffer);

    result.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
          before: 160,
          after: 80,
        },
        children: [
          new ImageRun({
            data: buffer,
            transformation: {
              width,
              height,
            },
          }),
        ],
      })
    );
  } else {
    result.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
          before: 100,
          after: 80,
        },
        children: [
          new TextRun({
            text: relPath
              ? `[Изображение не найдено: ${relPath}]`
              : "[Изображение отсутствует]",
            italics: true,
            color: "9F4F35",
            size: 18,
          }),
        ],
      })
    );
  }

  if (caption) {
    result.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: {
          after: 180,
        },
        children: [
          new TextRun({
            text: caption,
            italics: true,
            size: 18,
            color: "70695F",
          }),
        ],
      })
    );
  }

  return result;
}

// ============================================================
// ОБЫЧНЫЙ ТЕКСТ
// ============================================================

function paragraphText(text, options = {}) {
  return new Paragraph({
    indent: options.indent
      ? {
          firstLine: 480,
        }
      : undefined,

    spacing: {
      after: 160,
      line: 276,
    },

    alignment: options.justify
      ? AlignmentType.JUSTIFIED
      : undefined,

    children: [
      new TextRun({
        text: text || "",
        italics: options.italic,
        bold: options.bold,
      }),
    ],
  });
}

// ============================================================
// ТАБЛИЦЫ
// ============================================================

function makeTableCell(text, isHeader, columnWidth) {
  return new TableCell({
    width: {
      size: columnWidth,
      type: WidthType.PERCENTAGE,
    },

    margins: CELL_PADDING,

    verticalAlign: VerticalAlign.CENTER,

    shading: isHeader
      ? {
          fill: "F2EFE6",
          type: ShadingType.CLEAR,
        }
      : undefined,

    children: [
      new Paragraph({
        spacing: {
          before: 40,
          after: 40,
        },

        children: [
          new TextRun({
            text: String(text ?? ""),
            bold: isHeader,
            size: 20,
          }),
        ],
      }),
    ],
  });
}

function buildTable(rows) {
  if (!rows || !rows.length) {
    return [];
  }

  // Находим максимальное количество колонок
  const columnCount = Math.max(
    ...rows.map((row) => Array.isArray(row) ? row.length : 0),
    1
  );

  // Равномерно распределяем ширину.
  // Например:
  // 2 колонки → 50 / 50
  // 3 → 33.33 / 33.33 / 33.33
  // 4 → 25 / 25 / 25 / 25
  const columnWidth = 100 / columnCount;

  const tableRows = rows.map((row, rowIndex) => {
    const cells = [];

    for (let i = 0; i < columnCount; i++) {
      const value = row?.[i] ?? "";

      cells.push(
        makeTableCell(
          value,
          rowIndex === 0,
          columnWidth
        )
      );
    }

    return new TableRow({
      cantSplit: true,
      children: cells,
    });
  });

  return [
    new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },

      layout: "fixed",

      borders: {
        top: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: "B8B2A8",
        },
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: "B8B2A8",
        },
        left: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: "B8B2A8",
        },
        right: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: "B8B2A8",
        },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 4,
          color: "D8D3CA",
        },
        insideVertical: {
          style: BorderStyle.SINGLE,
          size: 4,
          color: "D8D3CA",
        },
      },

      rows: tableRows,
    }),

    new Paragraph({
      text: "",
      spacing: {
        after: 180,
      },
    }),
  ];
}

// ============================================================
// BLOCK → DOCX
// ============================================================

function blockToParagraphs(block) {
  switch (block.type) {
    case "h2":
      return [
        new Paragraph({
          text: block.text || "",
          heading: HeadingLevel.HEADING_3,
          spacing: {
            before: 240,
            after: 120,
          },
        }),
      ];

    // --------------------------------------------------------
    // СПИСОК
    // --------------------------------------------------------

    case "list":
      return (block.items || []).map(
        (item) =>
          new Paragraph({
            text: String(item ?? ""),
            bullet: {
              level: 0,
            },
            spacing: {
              after: 80,
            },
          })
      );

    // --------------------------------------------------------
    // ТАБЛИЦА
    // --------------------------------------------------------

    case "table":
      return buildTable(block.rows || []);

    // --------------------------------------------------------
    // ИЗОБРАЖЕНИЕ
    // --------------------------------------------------------

    case "image":
      return imageParagraphs(
        block.src,
        block.caption
      );

    // --------------------------------------------------------
    // ГАЛЕРЕЯ
    // --------------------------------------------------------

    case "gallery": {
      const heading = new Paragraph({
        text: block.title || "Фотоматериалы",
        heading: HeadingLevel.HEADING_4,
        spacing: {
          before: 240,
          after: 120,
        },
      });

      const images = (block.images || []).flatMap(
        (item) =>
          imageParagraphs(
            item.src,
            item.caption
          )
      );

      return [
        heading,
        ...images,
      ];
    }

    // --------------------------------------------------------
    // ТЕРМИНЫ
    // --------------------------------------------------------

    case "terms": {
      const heading = new Paragraph({
        text: block.title || "Ключевые термины",
        heading: HeadingLevel.HEADING_4,
        spacing: {
          before: 240,
          after: 120,
        },
      });

      const items = (block.items || []).map(
        (item) =>
          new Paragraph({
            spacing: {
              after: 100,
            },

            children: [
              new TextRun({
                text: `${item.term}. `,
                bold: true,
              }),

              new TextRun({
                text: item.text || "",
              }),
            ],
          })
      );

      return [
        heading,
        ...items,
      ];
    }

    // --------------------------------------------------------
    // VIDEO
    // --------------------------------------------------------

    case "video":
      return [
        new Paragraph({
          spacing: {
            after: 160,
          },

          children: [
            new TextRun({
              text: `🎬 ${block.title || "Видеоматериал"}. `,
              bold: true,
            }),

            new TextRun({
              text: "Видео доступно в видеотеке учебника (videos.html).",
            }),
          ],
        }),
      ];

    // --------------------------------------------------------
    // ТРЕНАЖЁР
    // --------------------------------------------------------

    case "trainer": {
      const heading = new Paragraph({
        text: block.title || "Тренажёр",
        heading: HeadingLevel.HEADING_4,
        spacing: {
          before: 240,
          after: 120,
        },
      });

      const intro = block.text
        ? [paragraphText(block.text)]
        : [];

      const questions = (
        block.questions || []
      ).flatMap((question, index) => {
        const qPara = new Paragraph({
          spacing: {
            before: 120,
            after: 60,
          },

          children: [
            new TextRun({
              text: `${index + 1}. ${question.prompt}`,
              bold: true,
            }),
          ],
        });

        const options = (
          question.options || []
        ).map(
          (option, optionIndex) =>
            new Paragraph({
              text: `${String.fromCharCode(
                97 + optionIndex
              )}) ${option}`,

              spacing: {
                after: 40,
              },

              indent: {
                left: 360,
              },
            })
        );

        return [
          qPara,
          ...options,
        ];
      });

      return [
        heading,
        ...intro,
        ...questions,
      ];
    }

    // --------------------------------------------------------
    // NOTE
    // --------------------------------------------------------

    case "note": {
      const isAssignment =
        (block.title || "")
          .toLowerCase()
          .includes("задание");

      const title = new Paragraph({
        shading: {
          fill: "F8F3E9",
          type: ShadingType.CLEAR,
        },

        spacing: {
          before: 160,
          after: 40,
        },

        children: [
          new TextRun({
            text: block.title || "",
            bold: true,
          }),
        ],
      });

      const text = new Paragraph({
        shading: {
          fill: "F8F3E9",
          type: ShadingType.CLEAR,
        },

        spacing: {
          after: isAssignment
            ? 60
            : 160,
        },

        children: [
          new TextRun({
            text: block.text || "",
          }),
        ],
      });

      if (!isAssignment) {
        return [
          title,
          text,
        ];
      }

      const answerLines =
        Array.from({ length: 4 }).map(
          () =>
            new Paragraph({
              border: {
                bottom: {
                  style: BorderStyle.SINGLE,
                  size: 4,
                  color: "CCCCCC",
                },
              },

              spacing: {
                after: 220,
              },

              children: [
                new TextRun({
                  text: " ",
                }),
              ],
            })
        );

      return [
        title,
        text,
        ...answerLines,
      ];
    }

    // --------------------------------------------------------
    // ЦИТАТА
    // --------------------------------------------------------

    case "quote":
      return [
        new Paragraph({
          indent: {
            left: 480,
          },

          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 12,
              color: "9F4F35",
            },
          },

          spacing: {
            after: 160,
          },

          children: [
            new TextRun({
              text: block.text || "",
              italics: true,
            }),
          ],
        }),
      ];

    // --------------------------------------------------------
    // ОБЫЧНЫЙ ТЕКСТ
    // --------------------------------------------------------

    default:
      return [
        paragraphText(
          block.text,
          {
            indent: true,
            justify: true,
          }
        ),
      ];
  }
}

// ============================================================
// ДОКУМЕНТ
// ============================================================

function buildDocument(textbook) {
  const children = [];

  // ----------------------------------------------------------
  // ОБЛОЖКА
  // ----------------------------------------------------------

  children.push(
    new Paragraph({
      text: textbook.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 200,
      },
    }),

    new Paragraph({
      text: textbook.subtitle || "",
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400,
      },
    }),

    new Paragraph({
      children: [
        new PageBreak(),
      ],
    })
  );

  // ----------------------------------------------------------
  // ГЛАВЫ
  // ----------------------------------------------------------

  textbook.chapters.forEach(
    (chapter) => {
      chapter.sections.forEach(
        (section, sectionIndex) => {
          children.push(
            new Paragraph({
              text: chapter.title,
              heading: HeadingLevel.HEADING_1,

              pageBreakBefore:
                sectionIndex === 0,

              spacing: {
                after: 80,
              },
            })
          );

          if (
            section.title !==
            chapter.title
          ) {
            children.push(
              new Paragraph({
                text:
                  section.title,
                heading:
                  HeadingLevel.HEADING_2,

                spacing: {
                  after: 120,
                },
              })
            );
          }

          if (section.lead) {
            children.push(
              paragraphText(
                section.lead,
                {
                  italic: true,
                  justify: true,
                }
              )
            );
          }

          (
            section.blocks || []
          ).forEach(
            (block) => {
              children.push(
                ...blockToParagraphs(
                  block
                )
              );
            }
          );
        }
      );
    }
  );

  // ----------------------------------------------------------
  // DOCUMENT
  // ----------------------------------------------------------

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
            },

            margin: {
              top: 1000,
              bottom: 1000,
              left: 1020,
              right: 1020,
            },
          },
        },

        children,
      },
    ],

    styles: {
      default: {
        document: {
          run: {
            font: "Georgia",
            size: 22,
          },
        },
      },
    },
  });
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("📚 Загружаю учебник...");

  const textbook = loadTextbook();

  console.log(
    `📖 ${textbook.authors?.length || 0} авторов, ${textbook.chapters?.length || 0} глав`
  );

  const document =
    buildDocument(textbook);

  const outDir =
    join(ROOT, "export");

  if (!existsSync(outDir)) {
    mkdirSync(outDir, {
      recursive: true,
    });
  }

  const outPath =
    join(
      outDir,
      "textbook.docx"
    );

  const buffer =
    await Packer.toBuffer(
      document
    );

  writeFileSync(
    outPath,
    buffer
  );

  console.log(
    `✅ DOCX создан: ${outPath}`
  );
}

main().catch(
  (error) => {
    console.error(
      "❌ Ошибка экспорта в DOCX:",
      error
    );

    process.exit(1);
  }
);