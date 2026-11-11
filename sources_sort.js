// sources_sort.js
// Кнопки сортировки для раздела «Список использованной литературы».
// Подключается в index.html ПОСЛЕ app.js. Данные берёт из window.TEXTBOOK_APPENDICES
// (author_appendices.js), сам текст источников не меняет.
(function () {
  "use strict";

  const TARGET_TITLE = "Список использованной литературы"; // заголовок раздела, где показываем кнопки
  const BIB_CHAPTER_ID = "appendices-bibliography-chapter";
  const BIB_INTRO_SECTION_ID = "appendices-bibliography-section"; // пустой вводный раздел без списков
  const STORAGE_KEY = "sources-sort-mode";

  // ───────────────────────── Авторы и правила привязки ─────────────────────────
  // Источник относится к автору, если:
  //  1) он написан этим автором (в начале «Фамилия И. О.» совпадает), или
  //  2) в тексте встречается фамилия автора или название его произведения (match).
  // Если привязка неверная, поправьте регулярные выражения ниже.
  const AUTHOR_RULES = [
    { name: "А. Т. Твардовский", short: "Твардовский", surname: "Твардовский", initials: "А.Т.", match: [/Твардовск/, /Тёркин|Теркин/] },
    { name: "Б. Ш. Окуджава", short: "Окуджава", surname: "Окуджава", initials: "Б.Ш.", match: [/Окуджав/, /Будь здоров, школяр/] },
    { name: "Н. А. Заболоцкий", short: "Заболоцкий", surname: "Заболоцкий", initials: "Н.А.", match: [/Заболоцк/] },
    { name: "В. С. Высоцкий", short: "Высоцкий", surname: "Высоцкий", initials: "В.С.", match: [/Высоцк/, /Штрафные батальоны/] },
    { name: "Е. А. Евтушенко", short: "Евтушенко", surname: "Евтушенко", initials: "Е.А.", match: [/Евтушенк/, /Бабий Яр|Бабьем Яре|Бабьего Яра/, /Хотят ли русские войны/] },
    { name: "А. Н. Рыбаков", short: "Рыбаков", surname: "Рыбаков", initials: "А.Н.", match: [/Рыбаков/, /Дети Арбата/] },
    { name: "А. А. Ахматова", short: "Ахматова", surname: "Ахматова", initials: "А.А.", match: [/Ахматов/, /Реквием/] },
    { name: "Б. Л. Васильев", short: "Васильев", surname: "Васильев", initials: "Б.Л.", match: [/Васильев/, /А зори здесь тихие/, /В списках не значился/, /Завтра была война/] },
    { name: "В. В. Быков", short: "Быков", surname: "Быков", initials: "В.В.", match: [/Быков/, /Сотников/, /Обелиск/] },
    { name: "В. Л. Кондратьев", short: "Кондратьев", surname: "Кондратьев", initials: "В.Л.", match: [/Кондратьев/, /Сашка/] },
  ];
  const COMMON_GROUP = "Общие источники (не привязаны к одному автору)";

  const LEAD_RE = /^([А-ЯЁ][а-яё]+)\s+([А-ЯЁ])\.\s?([А-ЯЁ])\./;

  function findAuthors(text) {
    let rest = text;
    const m = text.match(LEAD_RE);
    if (m) {
      const lead = `${m[2]}.${m[3]}.`;
      const exact = AUTHOR_RULES.find((a) => a.surname === m[1] && a.initials === lead);
      if (exact) return [exact];
      rest = text.slice(m[0].length); // другой человек с той же фамилией (например, Быков Д. Л.) не считается
    }
    return AUTHOR_RULES.filter((a) => a.match.some((re) => re.test(rest)));
  }

  // ───────────────────────── Разбор источников ─────────────────────────
  function splitNote(text) {
    const i = text.lastIndexOf(". (");
    if (i > 0 && text.endsWith(")")) {
      return { main: text.slice(0, i + 1), note: text.slice(i + 3, -1) };
    }
    return { main: text, note: "" };
  }

  function findYear(text) {
    const stripped = text
      .replace(/\([^)]*\)/g, "") // годы в пояснениях в скобках не считаем
      .replace(/\d{4}-\d{4}-[ех]/g, ""); // «1950-1990-е», «1960-1970-х» — это не год издания
    const m = stripped.match(/\b(1[5-9]\d\d|20\d\d)\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  function findKind(text) {
    if (/\([a-z0-9-]+(\.[a-z0-9-]+)+\)/i.test(text)) return "Сайты, архивы и онлайн-ресурсы";
    if (/художественный фильм|документальный фильм|песня|Симфония|Аудиозапис/i.test(text)) return "Фильмы, музыка и аудиозаписи";
    if (/^Приказ/.test(text)) return "Документы и приказы";
    if (/ \/\/ /.test(text)) return "Журналы и газеты";
    return "Книги и сборники";
  }
  const KIND_ORDER = [
    "Книги и сборники",
    "Журналы и газеты",
    "Документы и приказы",
    "Фильмы, музыка и аудиозаписи",
    "Сайты, архивы и онлайн-ресурсы",
  ];

  function collectSources() {
    const data = window.TEXTBOOK_APPENDICES;
    if (!data) return [];
    const chapter = (data.chapters || []).find((c) => c.id === BIB_CHAPTER_ID);
    if (!chapter) return [];
    const list = [];
    let order = 0;
    chapter.sections.forEach((section, catIndex) => {
      if (section.id === BIB_INTRO_SECTION_ID) return;
      const category = (section.title || "").replace(/^\d+\.\s*/, "");
      (section.blocks || []).forEach((block) => {
        if (block.type !== "list") return;
        (block.items || []).forEach((text) => {
          const { main, note } = splitNote(text);
          list.push({
            order: order++,
            text,
            main,
            note,
            category,
            catIndex,
            authors: findAuthors(text),
            year: findYear(text),
            kind: findKind(text),
          });
        });
      });
    });
    return list;
  }

  // ───────────────────────── Режимы сортировки ─────────────────────────
  const MODES = [
    {
      id: "groups",
      label: "Как в учебнике",
      hint: "Шесть групп: издания, мемуары, исследования, документы, кино и музыка, онлайн-ресурсы.",
      build(items) {
        const map = new Map();
        items.forEach((it) => {
          if (!map.has(it.category)) map.set(it.category, []);
          map.get(it.category).push(it);
        });
        return [...map].map(([title, list]) => ({ title, items: list }));
      },
      tags: "authors",
    },
    {
      id: "authors",
      label: "По авторам",
      hint: "Источники сгруппированы по автора. Если источник относится к нескольким авторам, он повторяется в каждой группе.",
      build(items) {
        const groups = AUTHOR_RULES.map((a) => ({
          title: a.name,
          items: items.filter((it) => it.authors.includes(a)),
        })).filter((g) => g.items.length);
        const common = items.filter((it) => !it.authors.length);
        if (common.length) groups.push({ title: COMMON_GROUP, items: common });
        return groups;
      },
      tags: "category",
    },
    {
      id: "alpha",
      label: "По алфавиту",
      hint: "Один общий список от А до Я.",
      build(items) {
        const key = (it) => it.text.replace(/^[«"“\s]+/, "");
        const sorted = [...items].sort((a, b) => key(a).localeCompare(key(b), "ru"));
        return [{ title: "", items: sorted }];
      },
      tags: "authors",
    },
    {
      id: "year",
      label: "По году",
      hint: "От старых изданий к новым. Год берётся из описания источника, у онлайн-ресурсов года нет.",
      build(items) {
        const withYear = items.filter((it) => it.year).sort((a, b) => a.year - b.year || a.order - b.order);
        const map = new Map();
        withYear.forEach((it) => {
          const decade = Math.floor(it.year / 10) * 10;
          if (!map.has(decade)) map.set(decade, []);
          map.get(decade).push(it);
        });
        const groups = [...map].map(([decade, list]) => ({ title: `${decade}-е годы`, items: list, showYear: true }));
        const noYear = items.filter((it) => !it.year);
        if (noYear.length) groups.push({ title: "Год не указан", items: noYear });
        return groups;
      },
      tags: "authors",
    },
    {
      id: "kind",
      label: "По типу источника",
      hint: "Книги, журналы и газеты, документы, фильмы и музыка, сайты и архивы.",
      build(items) {
        return KIND_ORDER.map((kind) => ({ title: kind, items: items.filter((it) => it.kind === kind) })).filter(
          (g) => g.items.length
        );
      },
      tags: "authors",
    },
  ];

  // ───────────────────────── Отрисовка ─────────────────────────
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderItem(it, tagsMode, showYear) {
    const row = el("li", "ss-item");
    row.append(el("span", "ss-main", it.main));
    if (it.note) row.append(el("div", "ss-note", it.note));

    const tags = el("div", "ss-tags");
    if (showYear && it.year) tags.append(el("span", "ss-tag", String(it.year)));
    if (tagsMode === "authors") {
      it.authors.forEach((a) => tags.append(el("span", "ss-tag", a.short)));
    } else if (tagsMode === "category") {
      tags.append(el("span", "ss-tag", it.category));
    }
    if (tags.childNodes.length) row.append(tags);
    return row;
  }

  function renderMode(out, hint, items, mode) {
    hint.textContent = mode.hint;
    out.innerHTML = "";
    const groups = mode.build(items);
    groups.forEach((group) => {
      const section = el("section", "ss-group");
      if (group.title) section.append(el("h3", "ss-title", `${group.title} (${group.items.length})`));
      const ul = el("ul", "ss-list");
      group.items.forEach((it) => ul.append(renderItem(it, mode.tags, group.showYear)));
      section.append(ul);
      out.append(section);
    });
  }

  function injectStyles() {
    if (document.getElementById("srcSortStyles")) return;
    const style = document.createElement("style");
    style.id = "srcSortStyles";
    style.textContent = `
      .ss { margin: 8px 0 24px; }
      .ss-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .ss-btn {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 8px 14px;
        background: var(--page);
        color: var(--text);
        font: inherit;
        font-size: 0.92rem;
        cursor: pointer;
      }
      .ss-btn:hover { border-color: var(--accent); }
      .ss-btn[aria-pressed="true"] {
        border-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 14%, var(--page));
      }
      .ss-hint { margin: 0 0 18px; color: var(--muted); font-size: 0.9rem; line-height: 1.4; }
      .ss-group + .ss-group { margin-top: 22px; }
      .ss-title { font-family: var(--serif); font-size: 1.15rem; margin: 0 0 10px; }
      .ss-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
      .ss-item { padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--page-soft); line-height: 1.45; }
      .ss-note { margin-top: 4px; color: var(--muted); font-size: 0.88rem; }
      .ss-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .ss-tag { font-size: 0.78rem; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
    `;
    document.head.append(style);
  }

  function readMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (MODES.some((m) => m.id === saved)) return saved;
    } catch {
      // localStorage недоступен: используем режим по умолчанию
    }
    return MODES[0].id;
  }

  function mount(body) {
    const items = collectSources();
    if (!items.length) return;
    injectStyles();

    const box = el("div", "ss");
    box.id = "srcSort";

    const bar = el("div", "ss-bar");
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Сортировка источников");
    const hint = el("p", "ss-hint");
    const out = el("div", "ss-out");

    let current = readMode();
    const buttons = new Map();

    function apply(id) {
      current = id;
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // не страшно, если не сохранилось
      }
      buttons.forEach((btn, key) => btn.setAttribute("aria-pressed", String(key === id)));
      renderMode(out, hint, items, MODES.find((m) => m.id === id));
    }

    MODES.forEach((mode) => {
      const btn = el("button", "ss-btn", mode.label);
      btn.type = "button";
      btn.addEventListener("click", () => apply(mode.id));
      buttons.set(mode.id, btn);
      bar.append(btn);
    });

    box.append(bar, hint, out);
    body.append(box);
    apply(current);
  }

  // Раздел перерисовывается приложением при каждом переходе, поэтому следим за изменениями страницы.
  function ensure() {
    const title = document.getElementById("sectionTitle");
    const body = document.getElementById("sectionBody");
    if (!title || !body) return;
    if (title.textContent.trim() !== TARGET_TITLE) return;
    if (body.querySelector("#srcSort")) return;
    mount(body);
  }

  const page = document.getElementById("bookPage");
  if (!page) return;
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensure();
    });
  }).observe(page, { childList: true, subtree: true, characterData: true });
  ensure();
})();
