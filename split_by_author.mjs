/**
 * split_by_author.mjs
 * Запуск: node split_by_author.mjs
 *
 * Читает content.js из текущей папки, разбивает по авторам,
 * сохраняет в папку content_parts/ — по одному файлу на автора.
 * Также создаёт content_index.js — лёгкий файл с метаданными.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── 1. Читаем content.js ────────────────────────────────────────────────────
const raw = readFileSync("content.js", "utf-8");

// Вырезаем JSON из "window.TEXTBOOK = { ... };"
const match = raw.match(/window\.TEXTBOOK\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
if (!match) {
  console.error("❌ Не нашёл window.TEXTBOOK = {...} в content.js");
  process.exit(1);
}

let book;
try {
  book = JSON.parse(match[1]);
} catch (err) {
  console.error("❌ Ошибка парсинга JSON:", err.message);
  process.exit(1);
}

console.log(`✅ Книга загружена: "${book.title}"`);
console.log(`   Авторов: ${book.authors?.length ?? 0}`);
console.log(`   Глав: ${book.chapters?.length ?? 0}`);

// ─── 2. Группируем главы по authorId ────────────────────────────────────────
const chaptersByAuthor = {};

for (const chapter of book.chapters ?? []) {
  const authorId = chapter.authorId ?? book.authorId ?? "unknown";
  if (!chaptersByAuthor[authorId]) chaptersByAuthor[authorId] = [];
  chaptersByAuthor[authorId].push(chapter);
}

// ─── 3. Создаём папку content_parts/ ────────────────────────────────────────
const outDir = "content_parts";
if (!existsSync(outDir)) mkdirSync(outDir);

// ─── 4. Пишем файл для каждого автора ───────────────────────────────────────
const index = []; // для content_index.js

for (const author of book.authors ?? []) {
  const chapters = chaptersByAuthor[author.id] ?? [];
  const sectionCount = chapters.reduce((sum, ch) => sum + (ch.sections?.length ?? 0), 0);

  const authorBook = {
    title: book.title,
    subtitle: book.subtitle,
    authorId: author.id,
    authors: [author],          // только этот автор
    chapters,
  };

  const filename = `author_${author.id}.js`;
  const filepath = join(outDir, filename);
  const content = `// Автор: ${author.fullName || author.name}\n// Глав: ${chapters.length}, разделов: ${sectionCount}\nwindow.TEXTBOOK_${author.id.replace(/-/g, "_").toUpperCase()} = ${JSON.stringify(authorBook, null, 2)};\n`;

  writeFileSync(filepath, content, "utf-8");

  index.push({
    id: author.id,
    name: author.fullName || author.name,
    file: filename,
    chapters: chapters.length,
    sections: sectionCount,
  });

  console.log(`   ✍️  ${author.fullName || author.name} → ${filename} (${chapters.length} глав, ${sectionCount} разделов)`);
}

// ─── 5. Пишем content_index.js ──────────────────────────────────────────────
const indexContent = `// Индекс авторов учебника\n// Сгенерирован: ${new Date().toISOString()}\nwindow.TEXTBOOK_INDEX = ${JSON.stringify(index, null, 2)};\n`;
writeFileSync(join(outDir, "content_index.js"), indexContent, "utf-8");

// ─── 6. Итог ─────────────────────────────────────────────────────────────────
console.log(`\n✅ Готово! Файлы сохранены в папку ./${outDir}/`);
console.log(`   Авторов: ${index.length}`);
console.log(`   Файлов: ${index.length + 1} (включая content_index.js)`);

const totalLines = index.reduce((sum, a) => {
  const path = join(outDir, a.file);
  const lines = readFileSync(path, "utf-8").split("\n").length;
  console.log(`   ${a.name}: ~${lines.toLocaleString()} строк`);
  return sum + lines;
}, 0);

console.log(`\n   Было: ~28 000 строк в одном файле`);
console.log(`   Стало: ${index.length} файлов, ~${Math.round(totalLines / index.length).toLocaleString()} строк в среднем`);
