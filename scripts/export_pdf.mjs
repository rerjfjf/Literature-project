// scripts/export_pdf.mjs
// Экспорт всего учебника в один .pdf файл с оформлением сайта
// (используется тот же styles.css, что и в браузере).
//
// Установка зависимостей (один раз):
//   npm install puppeteer
//   (при первой установке скачается Chromium, ~200 МБ — это нормально)
//
// Запуск:
//   node scripts/export_pdf.mjs
//
// Результат: export/textbook.pdf

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer";
import { loadTextbook, ROOT } from "./load_textbook.mjs";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fileExists(relPath) {
  return relPath ? existsSync(join(ROOT, relPath)) : false;
}

function blockToHtml(block) {
  switch (block.type) {
    case "h2":
      return `<h2>${esc(block.text)}</h2>`;

    case "list":
      return `<ul>${(block.items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;

    case "table": {
      const [head, ...rows] = block.rows || [];
      const theadHtml = head
        ? `<thead><tr>${head.map((cell) => `<th>${esc(cell)}</th>`).join("")}</tr></thead>`
        : "";
      const tbodyHtml = `<tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      return `<div class="table-wrap"><table>${theadHtml}${tbodyHtml}</table></div>`;
    }

    case "image": {
      const missing = !fileExists(block.src);
      return `<figure class="textbook-figure${missing ? " is-missing" : ""}">
        ${!missing ? `<img src="${esc(block.src)}" alt="${esc(block.alt || "")}">` : ""}
        <figcaption>${esc(block.caption || "Иллюстрация к учебному разделу.")}</figcaption>
      </figure>`;
    }

    case "gallery": {
      const items = (block.images || [])
        .map((item) => {
          const missing = !fileExists(item.src);
          return `<figure${missing ? ' class="is-missing"' : ""}>
            ${!missing ? `<img src="${esc(item.src)}" alt="${esc(item.alt || "")}">` : ""}
            <figcaption>${esc(item.caption || "")}</figcaption>
          </figure>`;
        })
        .join("");
      return `<section class="gallery-card"><h2>${esc(block.title || "Фотоматериалы")}</h2><div class="gallery-grid">${items}</div></section>`;
    }

    case "terms": {
      const items = (block.items || [])
        .map((item) => `<span class="term-chip"><strong>${esc(item.term)}</strong><span>${esc(item.text || "")}</span></span>`)
        .join("");
      return `<section class="terms-card"><h2>${esc(block.title || "Ключевые термины")}</h2><div class="terms-grid">${items}</div></section>`;
    }

    case "video":
      return `<section class="video-card">
        <h2>${esc(block.title || "Видеоматериал")}</h2>
        <p>${esc(block.text || "")}</p>
        <p><em>Видео доступно в видеотеке учебника (videos.html).</em></p>
      </section>`;

    case "trainer": {
      const questions = (block.questions || [])
        .map(
          (question, index) => `
            <p><strong>${index + 1}. ${esc(question.prompt)}</strong></p>
            <ul>${(question.options || [])
              .map((option, optionIndex) => `<li>${String.fromCharCode(97 + optionIndex)}) ${esc(option)}</li>`)
              .join("")}</ul>`
        )
        .join("");
      return `<section class="trainer-card">
        <h2>${esc(block.title || "Тренажёр")}</h2>
        <p>${esc(block.text || "")}</p>
        ${questions}
      </section>`;
    }

    case "note": {
      const isAssignment = (block.title || "").toLowerCase().includes("задание");
      const base = `<aside class="note"><strong>${esc(block.title || "")}</strong><p>${esc(block.text || "")}</p></aside>`;
      if (!isAssignment) return base;
      return `<aside class="note">
        <strong>${esc(block.title || "")}</strong>
        <p>${esc(block.text || "")}</p>
        <div style="border:1px solid var(--line); border-radius:8px; min-height:150px; margin-top:10px; padding:8px; color:var(--muted); font-size:0.8rem;">Место для ответа</div>
      </aside>`;
    }

    case "quote":
      return `<blockquote>${esc(block.text)}</blockquote>`;

    default:
      return `<p>${esc(block.text)}</p>`;
  }
}

function buildHtml(textbook) {
  const stylesCss = readFileSync(join(ROOT, "styles.css"), "utf-8");

  const coverPage = `
    <article class="book-page">
      <h1>${esc(textbook.title)}</h1>
      <p class="lead">${esc(textbook.subtitle || "")}</p>
    </article>`;

  const pages = textbook.chapters
    .flatMap((chapter) =>
      chapter.sections.map((section) => {
        const author = (textbook.authors || []).find((a) => a.id === (chapter.authorId || textbook.authorId));
        const authorName = author ? author.fullName || author.name : "";
        const blocksHtml = (section.blocks || []).map(blockToHtml).join("\n");
        return `
        <article class="book-page">
          <div class="chapter-kicker">${esc(authorName)}${authorName ? ". " : ""}${esc(chapter.title)}</div>
          <h1>${esc(section.title)}</h1>
          ${section.lead ? `<p class="lead">${esc(section.lead)}</p>` : ""}
          <div class="section-body">${blocksHtml}</div>
        </article>`;
      })
    )
    .join("\n");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>${stylesCss}</style>
<style>
  body { background: #fff; }
  .reader-layout, .toc-panel, .topbar, .page-tools, .overlay { display: none !important; }
  .book-page { page-break-after: always; box-shadow: none; border: 1px solid var(--line); margin: 0 auto 24px; }
  .book-page:last-child { page-break-after: auto; }
</style>
</head>
<body>
${coverPage}
${pages}
</body>
</html>`;
}

async function main() {
  const textbook = loadTextbook();
  const html = buildHtml(textbook);
  const tempPath = join(ROOT, "_pdf_export_temp.html");
  writeFileSync(tempPath, html, "utf-8");

  const browser = await puppeteer.launch();

  try {
    const page = await browser.newPage();

    console.log("1️⃣ Страница создана");

    await page.goto(`file://${tempPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });

    console.log("2️⃣ HTML загружен");

    await page.emulateMediaType("print");

    console.log("3️⃣ Print mode установлен");

    const outDir = join(ROOT, "export");

    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }

    const outPath = join(outDir, "textbook.pdf");

    console.log("4️⃣ Начинаю создание PDF...");

    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "14mm",
        bottom: "16mm",
        left: "14mm",
        right: "14mm",
      },
      timeout: 120000,
    });

    console.log(`✅ PDF создан: ${outPath}`);
  } finally {
    await browser.close();

    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }
}

main().catch((error) => {
  console.error("❌ Ошибка экспорта в PDF:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("❌ Ошибка экспорта в PDF:", error);
  process.exit(1);
});
