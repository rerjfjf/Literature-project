import { readFileSync } from "node:fs";

const files = [
  "content_parts/author_tvardovsky.js", "content_parts/author_okudzhava.js",
  "content_parts/author_zabolotsky.js", "content_parts/author_vysotsky.js",
  "content_parts/author_evtyushenko.js", "content_parts/author_rybakov.js",
  "content_parts/author_akhmatova.js", "content_parts/author_vasilyev.js",
  "content_parts/author_bykov.js", "content_parts/author_kondratyev.js",
  "content_parts/author_overview.js", "content_parts/author_intro.js",
  "content_parts/author_appendices.js", "content_parts/author_conclusion.js",
];

// Список фамилий авторов учебника и других известных писателей
const surnames = [
  "Твардовский", "Окуджава", "Заболоцкий", "Высоцкий", "Евтушенко",
  "Рыбаков", "Ахматова", "Васильев", "Быков", "Кондратьев",
  "Шолохов", "Симонов", "Толстой", "Пушкин", "Лермонтов",
  "Гоголь", "Чехов", "Достоевский", "Тургенев", "Горький",
  "Маяковский", "Есенин", "Блок", "Цветаева", "Пастернак",
  "Фадеев", "Некрасов", "Гумилёв", "Мандельштам", "Куприн",
  "Булгаков", "Астафьев", "Распутин", "Солженицын", "Шукшин",
  "Светлов", "Берггольц", "Друнина", "Твардовская", "Гитлер",
  "Сталин", "Ленин", "Маркс", "Энгельс", "Дзержинский", "Берия",
  "Ежов", "Ягода", "Николаев", "Киров", "Жуков", "Рокоссовский",
  "Ватутин", "Конев", "Шейпито", "Шепитько", "Платонов", "Зощенко",
];

const namePatterns = {};
for (const file of files) {
  const text = readFileSync(file, "utf8");
  // находим все вхождения фамилий (в любых падежах через основу)
  for (const s of surnames) {
    const re = new RegExp(s, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      // контекст: слово целиком
      const start = m.index;
      // ищем границу слова слева
      let left = start;
      while (left > 0 && /[А-Яа-яЁёA-Za-z]/.test(text[left - 1])) left--;
      let right = m.index + s.length;
      while (right < text.length && /[А-Яа-яЁёA-Za-z]/.test(text[right])) right++;
      const word = text.slice(left, right);
      // пропускаем уже с инициалами? нет, считаем все слова
      const before = text.slice(Math.max(0, left - 8), left);
      const after = text.slice(right, right + 8);
      const key = word;
      if (!namePatterns[key]) namePatterns[key] = { count: 0, sample: `${before}|${word}|${after}` };
      namePatterns[key].count++;
    }
  }
}

const sorted = Object.entries(namePatterns).sort((a, b) => b[1].count - a[1].count);
console.log("=== Словоформы фамилий (частота) ===");
for (const [w, info] of sorted) {
  console.log(`${w} (${info.count})  e.g. ${info.sample.replace(/\n/g, " ")}`);
}
