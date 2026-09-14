import { readFileSync } from "node:fs";
const src = readFileSync("/Users/nikitasokovyh/Book/.add_initials.mjs", "utf8");
// извлекаем только функции через eval-обёртку
const code = src.split("const files = readdirSync")[0];
const mod = { exports: {} };
const fn = new Function(code + "\nreturn { AUTHORS, scanBackInitials, transformInitials };");
const { transformInitials } = fn();

const tests = [
  "Писатель Твардовский создал поэму.",
  "В произведениях Твардовского главный герой.",
  "Твардовскому удалось передать голос солдата.",
  "и А. Т. Твардовский написал.",
  "и А. Твардовский написал.",
  "стихи А.Т.Твардовского.",
  "Быков В. В. Сотников. Обелиск. — М.: Эксмо.",
  "Прозаик Быкова, автор повестей.",
  "Быковская проза глубока.",
  "семья Быковых жила.",
  "поэт Евтушенко писал.",
  "Е. Евтушенко писал.",
  "Е. А. Евтушенко писал.",
  "Ахматовская улица, где жила Ахматова.",
  "Заболоцкий Н. А. и Заболоцкого разбирали.",
  "заставка_Твардовский.jpg",
  "Рыбаков А. Н. Дети Арбата.",
  "как Пушкин и Гоголь.",
  "Л. Толстой, Ф. Достоевский.",
  "Васильевна осталась в тылу.",
];

for (const t of tests) {
  console.log("IN : " + t);
  console.log("OUT: " + transformInitials(t));
  console.log("");
}
