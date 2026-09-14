import { readFileSync, writeFileSync } from "node:fs";
const files = [
  "content_parts/author_tvardovsky.js", "content_parts/author_okudzhava.js",
  "content_parts/author_zabolotsky.js", "content_parts/author_vysotsky.js",
  "content_parts/author_evtyushenko.js", "content_parts/author_rybakov.js",
  "content_parts/author_akhmatova.js", "content_parts/author_vasilyev.js",
  "content_parts/author_bykov.js", "content_parts/author_kondratyev.js",
  "content_parts/author_overview.js", "content_parts/author_intro.js",
  "content_parts/author_appendices.js", "content_parts/author_conclusion.js",
];
let all = "";
for (const f of files) all += "\n" + readFileSync(f, "utf8");

// 1) Все названия в «...» и "..." с частотой
const works = {};
const reQuotes = /[«"]([^»"]{2,60})[»"]/g;
let m;
while ((m = reQuotes.exec(all)) !== null) {
  const t = m[1].trim();
  if (!works[t]) works[t] = 0;
  works[t]++;
}
const sorted = Object.entries(works).sort((a, b) => b[1] - a[1]);
console.log("=== Названия в кавычках (частота) ===");
for (const [t, c] of sorted) {
  if (c >= 2) console.log(`${c}\t${t}`);
}
console.log("\n=== Всего уникальных: ", Object.keys(works).length);

// 2) "по произведению" без названия следом
console.log("\n=== 'по произведению' контексты (если после нет «...» ) ===");
const reBy = /по произведению/g;
let n = 0;
while ((m = reBy.exec(all)) !== null) {
  const after = all.slice(m.index, m.index + 40).replace(/\n/g, " ");
  const before = all.slice(Math.max(0, m.index - 60), m.index).replace(/\n/g, " ");
  const tail = after.split(/[.,;?)»"]/)[0];
  const hasTitle = tail.includes("«") || tail.includes('"');
  console.log(`[${hasTitle ? "есть назв" : "БЕЗ назв"}] ...${before}|${after}...`);
  n++;
  if (n > 25) break;
}
