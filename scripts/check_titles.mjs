// Проверка упоминаний названий произведений в тексте учебника. НИЧЕГО НЕ МЕНЯЕТ — только печатает отчёт.
//
// Для каждого упоминания названия показывает:
//   • без кавычек      — название стоит без "…";
//   • нет жанрового слова — прямо перед названием нет «поэма / произведение / стихотворение / …».
// Решение, что именно писать («поэма», «баллада», «отрывок») и как согласовать глаголы и падежи
// («смог» → «смогла»), остаётся за человеком: это нельзя надёжно сделать скриптом.
//
// Запуск:
//   node scripts/check_titles.mjs content_parts/author_akhmatova.js Реквием
//   node scripts/check_titles.mjs content_parts/author_tvardovsky.js "Василий Тёркин" "Я убит подо Ржевом"
import { readFileSync } from "node:fs";

const [file, ...titles] = process.argv.slice(2);
if (!file || !titles.length) {
  console.error('Использование: node scripts/check_titles.mjs <файл.js> <название> [<название> ...]');
  process.exit(1);
}

const GENRE = /(поэм[а-я]*|произведени[а-я]*|стихотворени[а-я]*|стих[а-я]*|баллад[а-я]*|песн[а-я]*|цикл[а-я]*|отрыв[а-я]*|роман[а-я]*|повест[а-я]*|рассказ[а-я]*|глав[а-я]*|раздел[а-я]*|сборник[а-я]*)\s*[-–—:]?\s*$/i;
const lines = readFileSync(file, "utf-8").split(/\r?\n/);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const title of titles) {
  // Окончания: Реквием, Реквиема, Реквиему… — берём основу без последней буквы, если слово одно.
  const stem = title.includes(" ") ? escape(title) : escape(title.slice(0, Math.max(4, title.length - 1)));
  const re = new RegExp(`(\\\\"|«|")?(${stem}[а-яё]*)(\\\\"|»|")?`, "g");
  let total = 0, noQuotes = 0, noGenre = 0;
  const report = [];
  lines.forEach((line, index) => {
    for (const match of line.matchAll(re)) {
      total += 1;
      const before = line.slice(Math.max(0, match.index - 30), match.index);
      const quoted = Boolean(match[1] && match[3]);
      const hasGenre = GENRE.test(before);
      if (!quoted) noQuotes += 1;
      if (!hasGenre) noGenre += 1;
      if (!quoted || !hasGenre) {
        const tags = [!quoted && "без кавычек", !hasGenre && "нет жанрового слова"].filter(Boolean).join(", ");
        report.push(`  стр. ${index + 1}: …${line.slice(Math.max(0, match.index - 45), match.index + match[0].length + 40).trim()}…  [${tags}]`);
      }
    }
  });
  console.log(`\n«${title}»: упоминаний ${total} | без кавычек ${noQuotes} | без жанрового слова ${noGenre}`);
  report.forEach((row) => console.log(row));
}
