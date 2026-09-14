// scripts/load_textbook.mjs
// Собирает window.TEXTBOOK из content_parts/*.js + content_loader.js
// точно так же, как это делает браузер — просто выполняет те же файлы
// в изолированном контексте Node.js (модуль "vm"), без переписывания логики.
// Благодаря этому скрипт не нужно обновлять, если вы добавите нового автора —
// он подхватится сам, как и на сайте.

import { readFileSync, readdirSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");

const CONTENT_PARTS_DIR = join(ROOT, "content_parts");
const LOADER_PATH = join(ROOT, "content_loader.js");

export function loadTextbook() {
  const context = createContext({ window: {}, console });

  const files = readdirSync(CONTENT_PARTS_DIR)
    .filter((name) => name.endsWith(".js"))
    .sort();

  if (!files.length) {
    throw new Error(`В папке ${CONTENT_PARTS_DIR} не найдено ни одного .js файла`);
  }

  for (const file of files) {
    const code = readFileSync(join(CONTENT_PARTS_DIR, file), "utf-8");
    runInContext(code, context, { filename: file });
  }

  const loaderCode = readFileSync(LOADER_PATH, "utf-8");
  runInContext(loaderCode, context, { filename: "content_loader.js" });

  const textbook = context.window.TEXTBOOK;
  if (!textbook || !Array.isArray(textbook.chapters)) {
    throw new Error("Не удалось собрать TEXTBOOK — проверьте content_parts и content_loader.js");
  }

  console.log(
    `📚 Учебник собран: ${textbook.authors.length} авторов, ${textbook.chapters.length} глав`
  );

  return textbook;
}
