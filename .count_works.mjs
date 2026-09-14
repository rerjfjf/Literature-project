import { readFileSync, readdirSync } from "node:fs";
const files = readdirSync("content_parts").filter((x) => x.endsWith(".js") && !x.endsWith(".bak"));
const works = ["Василий Тёркин", "Я убит подо Ржевом", "Дети Арбата", "Реквием", "Сотников", "А зори здесь тихие", "В списках не значился", "Сашка", "Бабий Яр", "Альпийская баллада", "Завтра была война", "Обелиск", "Дожить до рассвета", "Кортик", "Бронзовая птица", "Не стреляйте в белых лебедей"];
let all = "";
for (const f of files) all += "\n" + readFileSync("content_parts/" + f, "utf8");

// Слова-маркеры жанра/типа (которые уже стоят перед названием)
const genreWords = ["поэма", "поэме", "поэмы", "поэму", "поэмой", "роман", "романе", "романа", "роману", "романом", "повесть", "повести", "повестью", "повесть-", "рассказ", "рассказе", "рассказа", "рассказу", "стихотворение", "стихотворении", "стихотворения", "стихотворению", "стихотворением", "песня", "песне", "песни", "песню", "баллада", "балладе", "баллады", "глава", "главе", "главы", "главу", "произведение", "произведении", "произведения", "произведению", "произведением", "книга", "книге", "книги", "книгу", "отрывок", "отрывке", "отрывка", "цикл", "цикле", "цикла", "тетралогия", "трилогия", "дилогия", "фильм", "фильме", "фильма", "текст", "тексте", "текста", "эпизод", "эпизоде", "эпизода", "картина", "картине", "главы", "главах", "фрагмент", "фрагменте", "фрагмента", "экспозиция", "экспозиции", "мотив", "мотиве", "мотива"];

for (const w of works) {
  const re = new RegExp(w, "g");
  let m, total = 0, withGenre = 0, withoutGenre = 0;
  const noGenreSamples = [];
  while ((m = re.exec(all)) !== null) {
    total++;
    const before = all.slice(Math.max(0, m.index - 60), m.index).replace(/\n/g, " ");
    const after = all.slice(m.index, m.index + 40).replace(/\n/g, " ");
    // последнее слово перед названием
    const words = before.split(/[ ,.:;!?()[\]"'«»]+/).filter(Boolean);
    const last = words[words.length - 1] || "";
    const hasGenre = genreWords.includes(last.toLowerCase()) || before.match(/«[^»]{2,40}»$/);
    if (hasGenre) withGenre++;
    else {
      withoutGenre++;
      if (noGenreSamples.length < 3) noGenreSamples.push(`[${last}] ...${before.slice(-40)}|${after}...`);
    }
  }
  console.log(`«${w}» → всего ${total} | с жанром: ${withGenre} | БЕЗ жанра: ${withoutGenre}`);
  noGenreSamples.forEach((s) => console.log("   " + s));
}
