import { readFileSync, readdirSync } from "node:fs";
const files = readdirSync("content_parts").filter((x) => x.endsWith(".js") && !x.endsWith(".bak"));
// фамилия -> объединённый regex форм (без падежных окончаний, учитываем склонение)
const authors = {
  "Твардовск": { init: "А. Т.", full: "А. Т. Твардовский" },
  "Окуджава": { init: "Б. Ш.", full: "Б. Ш. Окуджава" },
  "Заболоцк": { init: "Н. А.", full: "Н. А. Заболоцкий" },
  "Высоцк": { init: "В. С.", full: "В. С. Высоцкий" },
  "Евтушенко": { init: "Е. А.", full: "Е. А. Евтушенко" },
  "Рыбаков": { init: "А. Н.", full: "А. Н. Рыбаков" },
  "Ахматов": { init: "А. А.", full: "А. А. Ахматова" },
  "Васильев": { init: "Б. Л.", full: "Б. Л. Васильев" },
  "Быков": { init: "В. В.", full: "В. В. Быков" },
  "Кондратьев": { init: "В. Л.", full: "В. Л. Кондратьев" },
};
let all = "";
for (const f of files) all += "\n" + readFileSync("content_parts/" + f, "utf8");

for (const [stem, a] of Object.entries(authors)) {
  // ищем слово, начинающееся со stem (слово целиком из букв)
  const re = new RegExp(stem + "[а-яё]*", "g");
  let m, total = 0, bare = 0, partial = 0, fullDetected = 0;
  const bareSamples = [];
  while ((m = re.exec(all)) !== null) {
    // проверим границы слова
    const left = m.index;
    if (left > 0 && /[А-Яа-яЁё]/.test(all[left - 1])) continue; // часть большего слова
    total++;
    // смотрим до 14 символов слева на инициалы
    const before = all.slice(Math.max(0, left - 14), left);
    const initRe = /(?:[А-ЯЁ]\.\s*){1,2}$/;
    const hasInit = initRe.test(before);
    if (!hasInit) {
      bare++;
      if (bareSamples.length < 4) bareSamples.push("..." + before.slice(-8) + "|" + all.slice(left, left + 14).replace(/\n/g, " ") + "...");
    } else if ((before.match(/[А-ЯЁ]\./g) || []).length === 1) { partial++; }
    else { fullDetected++; }
  }
  console.log(`${a.full}  → всего ${total} | уже с полными иниц: ${fullDetected} | с 1 инициалом: ${partial} | БЕЗ инициалов: ${bare}`);
  bareSamples.forEach((s) => console.log("      " + s));
}
