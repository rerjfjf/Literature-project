/**
 * reorder_tvardovsky.mjs
 * Запуск: node reorder_tvardovsky.mjs
 * Переставляет главы, расширяет тренажёры до 10 вопросов, сохраняет весь текст.
 */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = "content_parts/author_tvardovsky.js";
const raw = readFileSync(FILE, "utf-8");
const match = raw.match(/window\.TEXTBOOK_TVARDOVSKY\s*=\s*(\{[\s\S]*\})\s*;\s*$/);
if (!match) { console.error("❌ Не нашёл window.TEXTBOOK_TVARDOVSKY"); process.exit(1); }
const book = JSON.parse(match[1]);
const byId = Object.fromEntries(book.chapters.map(ch => [ch.id, ch]));

// ─── Новые вопросы для тренажёров ─────────────────────────────────────────

const EXTRA_QUESTIONS_TERKIN = [
  {
    prompt: "Где создавались отдельные главы поэмы «Василий Тёркин»?",
    options: ["Непосредственно на фронте, в перерывах между боями", "В тыловом госпитале", "В редакции московской газеты", "В эвакуации в Ташкенте"],
    answer: 0,
    explanation: "А. Т. Твардовский работал военным корреспондентом и писал главы прямо на фронте."
  },
  {
    prompt: "Как называл своё произведение сам А. Т. Твардовский?",
    options: ["«Книга про бойца»", "«Народная поэма»", "«Фронтовой дневник»", "«Героическая хроника»"],
    answer: 0,
    explanation: "А.Твардовский избегал жанровых определений и называл произведение «книгой про бойца»."
  },
  {
    prompt: "Откуда Тёркин берёт гармонь в одноимённой главе?",
    options: ["Гармонь принадлежала погибшему командиру", "Тёркин нашёл её в разрушенной деревне", "Гармонь прислали из дома", "Её дал незнакомый боец"],
    answer: 0,
    explanation: "Тёркин играет на гармони погибшего командира — в этом скрыта связь радости и памяти о смерти."
  },
  {
    prompt: "Почему автор почти не описывает внешность Тёркина?",
    options: ["Чтобы каждый читатель мог узнать в нём себя", "Потому что герой второстепенен", "Чтобы скрыть прототип", "Из-за цензурных ограничений"],
    answer: 0,
    explanation: "Отсутствие описания — художественный приём: Тёркин должен быть собирательным образом."
  },
  {
    prompt: "Что удерживает Тёркина от смерти в главе «Смерть и воин»?",
    options: ["Привязанность к жизни, людям и общему делу", "Страх перед физической болью", "Приказ командира", "Обещание вернуться домой"],
    answer: 0,
    explanation: "Герой сопротивляется смерти не из страха, а из живой связи с миром людей."
  },
  {
    prompt: "Какую функцию выполняет юмор в поэме?",
    options: ["Помогает сохранить внутреннее равновесие и человеческое достоинство", "Снижает трагизм до комедии", "Разрушает серьёзность происходящего", "Служит развлечением для читателя"],
    answer: 0,
    explanation: "Юмор у Тёркина — форма психологического выживания и нравственного сопротивления."
  },
  {
    prompt: "К какому периоду относятся истоки образа Тёркина?",
    options: ["К Советско-финской войне 1939–1940 годов", "К началу Великой Отечественной войны", "К довоенным газетным фельетонам 1930-х", "К Гражданской войне"],
    answer: 0,
    explanation: "Образ начал складываться во время работы Твардовского корреспондентом на финском фронте."
  }
];

const EXTRA_QUESTIONS_RZHEV = [
  {
    prompt: "В каком году написано стихотворение «Я убит подо Ржевом»?",
    options: ["В 1946 году, после окончания войны", "В 1941 году, в начале войны", "В 1943 году, в разгар боёв", "В 1945 году, в год победы"],
    answer: 0,
    explanation: "Стихотворение написано в 1946 году — это взгляд назад, осмысление уже случившегося."
  },
  {
    prompt: "Кто является лирическим героем стихотворения?",
    options: ["Погибший солдат, говорящий из небытия", "Живой ветеран, вспоминающий войну", "Сам А. Т. Твардовский от первого лица", "Безымянная вдова солдата"],
    answer: 0,
    explanation: "Текст построен как монолог человека, который уже погиб — это создаёт особую трагическую интонацию."
  },
  {
    prompt: "О чём главным образом размышляет лирический герой?",
    options: ["О том, сохранят ли живые память о погибших и поймут ли цену победы", "О своей семье и доме", "О конкретном сражении", "О несправедливости войны"],
    answer: 0,
    explanation: "Главная мысль обращена к живым: герой беспокоится не о себе, а о будущей памяти."
  },
  {
    prompt: "Почему Ржевские сражения стали особым фоном для стихотворения?",
    options: ["Огромные потери и долгое замалчивание этой трагедии", "Близость к Москве", "Первая крупная победа советских войск", "Участие в боях известных командиров"],
    answer: 0,
    explanation: "Ржев — символ забытой, неославленной трагедии, что усиливает смысл стихотворения о памяти."
  },
  {
    prompt: "Чем отличается интонация произведения «Я убит подо Ржевом» от поэмы «Василий Тёркин»?",
    options: ["Отсутствием юмора и акцентом на трагедии утраты и памяти", "Большим количеством батальных сцен", "Использованием сатиры и иронии", "Торжественным патриотическим пафосом"],
    answer: 0,
    explanation: "Стихотворение написано после войны и обращено к теме памяти, а не фронтового выживания."
  },
  {
    prompt: "Почему герой не требует ни славы, ни жалости?",
    options: ["Его главная забота — судьба живых, а не собственное имя", "Потому что он виноват в своей гибели", "Потому что слава ему не нужна физически", "Потому что автор хотел избежать пафоса"],
    answer: 0,
    explanation: "Сдержанность героя — нравственная позиция: он думает о других, а не о себе."
  },
  {
    prompt: "Чьим голосом становится лирический герой в финале стихотворения?",
    options: ["Голосом всего поколения павших на войне", "Только своим собственным", "Голосом командования", "Голосом народа в целом"],
    answer: 0,
    explanation: "Герой говорит «мы» — его монолог превращается в коллективный голос погибших."
  }
];

// ─── Функция: добавить вопросы до 10 в каждый trainer-блок ───────────────────
function expandTrainers(sections, extraQuestions) {
  return sections.map(section => ({
    ...section,
    blocks: section.blocks.map(block => {
      if (block.type !== "trainer") return block;
      const current = block.questions || [];
      if (current.length >= 10) return block;
      const needed = 10 - current.length;
      const additions = extraQuestions.slice(0, needed);
      return { ...block, questions: [...current, ...additions] };
    })
  }));
}

// ─── Разбиваем works на Тёркин и Ржев ────────────────────────────────────────
const worksChapter = byId["works"];
const terkinSection = worksChapter.sections.find(s => s.id === "poema-vasiliy-terkin-1941-1945");
const rzhevSection  = worksChapter.sections.find(s => s.id === "stihotvorenie-ya-ubit-podo-rzhevom-1946");

const worksTerkin = {
  ...worksChapter,
  id: "works-terkin",
  number: "Глава 4",
  title: "«Василий Тёркин» — обзор поэмы",
  sections: [terkinSection].filter(Boolean),
};

const worksRzhev = {
  ...worksChapter,
  id: "works-rzhev",
  number: "Глава 11",
  title: "«Я убит подо Ржевом» — обзор стихотворения",
  sections: [rzhevSection].filter(Boolean),
};

// ─── Разбиваем interactive на блоки ──────────────────────────────────────────
const interactive = byId["tvardovsky-interactive"];
const secById = Object.fromEntries(interactive.sections.map(s => [s.id, s]));

const interactiveTerkin = {
  ...interactive,
  id: "tvardovsky-interactive-terkin",
  number: "Глава 10",
  title: "Тренажёры по «Василию Тёркину»",
  sections: expandTrainers(
    ["tvardovsky-trainer-1","tvardovsky-trainer-3","tvardovsky-trainer-4","tvardovsky-trainer-5"]
      .map(id => secById[id]).filter(Boolean),
    EXTRA_QUESTIONS_TERKIN
  ),
};

const interactiveRzhev = {
  ...interactive,
  id: "tvardovsky-interactive-rzhev",
  number: "Глава 12",
  title: "Тренажёры по «Я убит подо Ржевом»",
  sections: expandTrainers(
    ["tvardovsky-trainer-2"].map(id => secById[id]).filter(Boolean),
    EXTRA_QUESTIONS_RZHEV
  ),
};

const interactiveMethods = {
  ...interactive,
  id: "tvardovsky-interactive-methods-chapter",
  number: "Практика",
  title: "Творческие приёмы работы с текстом",
  sections: ["tvardovsky-interactive-methods","tvardovsky-slide-tasks"]
    .map(id => secById[id]).filter(Boolean),
};

// ─── Финальный порядок ───────────────────────────────────────────────────────
const newChapters = [
  { ...byId["tvardovsky-cover"], number: "Лист автора" },
  // БИОГРАФИЯ
  { ...byId["author"],    number: "Глава 1" },
  { ...byId["biography"], number: "Глава 2" },
  { ...byId["extra"],     number: "Глава 3" },
  // ВАСИЛИЙ ТЁРКИН
  { ...worksTerkin,              number: "Глава 4" },
  { ...byId["terkin"],           number: "Глава 5" },
  { ...byId["episodes"],         number: "Глава 6" },
  { ...byId["interesting"],      number: "Глава 7" },
  { ...byId["problems"],         number: "Глава 8" },
  { ...byId["reflection"],       number: "Глава 9" },
  { ...byId["questions"],        number: "Глава 10" },
  { ...interactiveTerkin,        number: "Глава 10б" },
  // Я УБИТ ПОДО РЖЕВОМ
  { ...worksRzhev,               number: "Глава 11" },
  { ...interactiveRzhev,         number: "Глава 12" },
  // ИТОГ
  { ...interactiveMethods,       number: "Практика" },
  { ...byId["tvardovsky-summary"], number: "Итог" },
];

book.chapters = newChapters;

const totalSections = newChapters.reduce((s, ch) => s + (ch.sections?.length || 0), 0);
const author = book.authors[0];
const out = `// Автор: ${author.fullName || author.name}\n// Глав: ${newChapters.length}, разделов: ${totalSections}\nwindow.TEXTBOOK_TVARDOVSKY = ${JSON.stringify(book, null, 2)};\n`;
writeFileSync(FILE, out, "utf-8");

console.log("✅ Новый порядок глав:");
newChapters.forEach((ch, i) => {
  const secs = ch.sections || [];
  const trainers = secs.flatMap(s => (s.blocks||[]).filter(b => b.type==="trainer"));
  const qInfo = trainers.length ? ` [тренажёры: ${trainers.map(t=>(t.questions||[]).length+"q").join(", ")}]` : "";
  console.log(`  ${i+1}. [${ch.number}] ${ch.title} (${secs.length} разд.)${qInfo}`);
});
console.log(`\n✅ Сохранено: ${FILE}`);
