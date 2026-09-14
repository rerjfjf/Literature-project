/**
 * reorder2_tvardovsky.mjs
 * Запуск: node reorder2_tvardovsky.mjs
 *
 * Финальная правильная хронология:
 *
 * БИОГРАФИЯ:
 *   - Биографический след
 *   - Биография А.Т. Твардовского
 *   - Переход от биографии к произведению
 *   - Страницы биографии, которых нет в учебниках
 *   - «Новый мир» и цензура
 *   - Поэма «По праву памяти»
 *   - Один малоизвестный факт
 *   - Письменное задание
 *
 * ВАСИЛИЙ ТЁРКИН:
 *   - Обзор поэмы
 *   - «Василий Тёркин» без финала
 *   - Реакция солдат
 *   - Замысел и история создания
 *   - Жанр и структура
 *   - Образ Василия Тёркина
 *   - Переправа, Поединок, Гармонь, Юмор, Язык
 *   - Интересное
 *   - Проблемы
 *   - Раздумья
 *   - Вопросы
 *   - Тренажёры
 *
 * Я УБИТ ПОДО РЖЕВОМ:
 *   - Обзор стихотворения
 *   - Тренажёры
 *
 * ИТОГ:
 *   - Творческие приёмы
 *   - Задания из слайдов
 *   - Обобщение
 */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content_parts/author_tvardovsky.js";
const raw = readFileSync(FILE, "utf-8");
const match = raw.match(/window\.TEXTBOOK_TVARDOVSKY\s*=\s*(\{[\s\S]*\})\s*;\s*$/);
if (!match) { console.error("❌ Не нашёл window.TEXTBOOK_TVARDOVSKY"); process.exit(1); }
const book = JSON.parse(match[1]);

// Карта всех глав по id
const byId = Object.fromEntries(book.chapters.map(ch => [ch.id, ch]));

// Карта всех разделов по id (из всех глав)
const allSections = {};
for (const ch of book.chapters) {
  for (const sec of (ch.sections || [])) {
    allSections[sec.id] = sec;
  }
}

// ─── Вспомогательная функция: собрать главу из списка section id ─────────────
function makeChapter(id, number, title, authorId, sectionIds) {
  const sections = sectionIds.map(sid => allSections[sid]).filter(Boolean);
  return { id, authorId, number, title, sections };
}

// ─── БИОГРАФИЯ ────────────────────────────────────────────────────────────────
const chBio1 = makeChapter("bio-1", "Глава 1", "Биографический след А. Т. Твардовского", "tvardovsky", [
  "znakomstvo-s-avtorom",
]);

const chBio2 = makeChapter("bio-2", "Глава 2", "Биография и путь к произведению", "tvardovsky", [
  "biografiya-a-t-tvardokogo",
  "perehod-ot-biografii-k-proizvedeniyu",
]);

const chBio3 = makeChapter("bio-3", "Глава 3", "Страницы биографии, которых нет в учебниках", "tvardovsky", [
  "stranitsy-biografii-kotoryh-net-v-uchebnikah",
  "novyy-mir-i-tsenzura",
  "poema-po-pravu-pamyati",
  "odin-maloizvestnyy-fakt",
  "pismennoe-zadanie-dlya-studenta",
]);

// ─── ВАСИЛИЙ ТЁРКИН ───────────────────────────────────────────────────────────
const chTerkin1 = makeChapter("terkin-1", "Глава 4", "«Василий Тёркин» — обзор поэмы", "tvardovsky", [
  "poema-vasiliy-terkin-1941-1945",
  "vasiliy-terkin-bez-finala",
  "reaktsiya-soldat",
]);

const chTerkin2 = makeChapter("terkin-2", "Глава 5", "Замысел, жанр и образ главного героя", "tvardovsky", [
  "zamysel-i-istoriya-sozdaniya",
  "zhanr-i-struktura",
  "obraz-vasiliya-terkina",
]);

const chTerkin3 = makeChapter("terkin-3", "Глава 6", "Ключевые эпизоды и художественные особенности", "tvardovsky", [
  "pereprava-cherez-reku",
  "poedinok-so-smertyu",
  "igra-na-garmoni",
  "yumor-kak-hudozhestvennyy-priem",
  "yazyk-i-intonatsiya-poemy",
]);

const chTerkin4 = makeChapter("terkin-4", "Глава 7", "Интересное из произведения", "tvardovsky", [
  "interesnoe-iz-proizvedeniya",
]);

const chTerkin5 = makeChapter("terkin-5", "Глава 8", "Проблемы произведения", "tvardovsky", [
  "nratvennyy-vybor-na-voyne",
  "tsena-pobedy",
  "chelovek-i-sistema",
  "pamyat-kak-dolg",
]);

const chTerkin6 = makeChapter("terkin-6", "Глава 9", "Информация для раздумий", "tvardovsky", [
  "informatsiya-dlya-razdumiy",
  "voprosy-dlya-pismennogo-razmyshleniya",
]);

const chTerkin7 = makeChapter("terkin-7", "Глава 10", "Вопросы по «Василию Тёркину»", "tvardovsky", [
  "uroven-1-ponimanie-teksta",
  "uroven-2-analiz-i-interpretatsiya",
  "uroven-3-suzhdenie-i-pozitsiya",
]);

// Тренажёры Тёркина — берём из текущего файла
const interactiveCh = byId["tvardovsky-interactive"] || byId["tvardovsky-interactive-terkin"];
const interactiveSecById = Object.fromEntries((interactiveCh?.sections || []).map(s => [s.id, s]));

const chTerkin8 = {
  id: "terkin-8",
  authorId: "tvardovsky",
  number: "Глава 11",
  title: "Тренажёры по «Василию Тёркину»",
  sections: ["tvardovsky-trainer-1","tvardovsky-trainer-3","tvardovsky-trainer-4","tvardovsky-trainer-5"]
    .map(id => interactiveSecById[id] || allSections[id]).filter(Boolean),
};

// ─── Я УБИТ ПОДО РЖЕВОМ ──────────────────────────────────────────────────────
const chRzhev1 = makeChapter("rzhev-1", "Глава 12", "«Я убит подо Ржевом» (1946)", "tvardovsky", [
  "stihotvorenie-ya-ubit-podo-rzhevom-1946",
]);

const chRzhev2 = {
  id: "rzhev-2",
  authorId: "tvardovsky",
  number: "Глава 13",
  title: "Тренажёры по «Я убит подо Ржевом»",
  sections: ["tvardovsky-trainer-2"]
    .map(id => interactiveSecById[id] || allSections[id]).filter(Boolean),
};

// ─── ИТОГ ─────────────────────────────────────────────────────────────────────
const chFinal = {
  id: "tvardovsky-final",
  authorId: "tvardovsky",
  number: "Итог",
  title: "Обобщение по автору",
  sections: [
    ...["tvardovsky-interactive-methods","tvardovsky-slide-tasks"]
      .map(id => interactiveSecById[id] || allSections[id]).filter(Boolean),
    ...(byId["tvardovsky-summary"]?.sections || []),
  ],
};

// ─── Лист автора ──────────────────────────────────────────────────────────────
const chCover = { ...byId["tvardovsky-cover"], number: "Лист автора" };

// ─── Финальная сборка ─────────────────────────────────────────────────────────
const newChapters = [
  chCover,
  chBio1, chBio2, chBio3,
  chTerkin1, chTerkin2, chTerkin3, chTerkin4, chTerkin5, chTerkin6, chTerkin7, chTerkin8,
  chRzhev1, chRzhev2,
  chFinal,
];

book.chapters = newChapters;

const totalSections = newChapters.reduce((s, ch) => s + (ch.sections?.length || 0), 0);
const author = book.authors[0];
const out = `// Автор: ${author.fullName || author.name}\n// Глав: ${newChapters.length}, разделов: ${totalSections}\nwindow.TEXTBOOK_TVARDOVSKY = ${JSON.stringify(book, null, 2)};\n`;
writeFileSync(FILE, out, "utf-8");

console.log("✅ Новый порядок:");
newChapters.forEach((ch, i) => {
  const secs = ch.sections || [];
  console.log(`  ${i+1}. [${ch.number}] ${ch.title} (${secs.length} разд.)`);
  secs.forEach(s => console.log(`       · ${s.title}`));
});
console.log(`\n✅ Сохранено: ${FILE} | Глав: ${newChapters.length}, разделов: ${totalSections}`);
