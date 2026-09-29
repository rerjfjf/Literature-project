// content_loader.js — собирает всех авторов в единый window.TEXTBOOK
// Подключается ПОСЛЕ всех author_*.js файлов, НО ДО app.js

(function () {
  const parts = [
    window.TEXTBOOK_PREFACE,      // 1. Предисловие 
    window.TEXTBOOK_INTRO,        // 2. Введение
    window.TEXTBOOK_AKHMATOVA,    // 3. А. А. Ахматова
    window.TEXTBOOK_RYBAKOV,      // 4. А. Н. Рыбаков
    window.TEXTBOOK_BYKOV,        // 5. В. В. Быков
    window.TEXTBOOK_VASILYEV,     // 6. Б. Л. Васильев
    window.TEXTBOOK_KONDRATYEV,   // 7. В. Л. Кондратьев
    window.TEXTBOOK_TVARDOVSKY,   // 8. А. Т. Твардовский
    window.TEXTBOOK_ZABOLOTSKY,   // 9. Н. А. Заболоцкий
    window.TEXTBOOK_OKUDZHAVA,    // 10. Б. Ш. Окуджава
    window.TEXTBOOK_VYSOTSKY,     // 11. В. С. Высоцкий 
    window.TEXTBOOK_EVTYUSHENKO,  // 12. Е. А. Евтушенко
    window.TEXTBOOK_OVERVIEW,     // 13. Итог учебника
    window.TEXTBOOK_CONCLUSION,   // 14. Заключение
    window.TEXTBOOK_APPENDICES    // 15. Приложения
  ].filter(Boolean); // .filter(Boolean) автоматически убирает undefined, если какого-то файла пока нет

  if (!parts.length) {
    console.error("content_loader: не найден ни один файл автора!");
    return;
  }

  const base = parts[0];

  window.TEXTBOOK = {
    title: base.title,
    subtitle: base.subtitle,
    authors: parts.flatMap((p) => p.authors || []),
    chapters: parts.flatMap((p) => p.chapters || []),
  };

  console.log(
    `✅ TEXTBOOK собран: ${window.TEXTBOOK.authors.length} авторов, ${window.TEXTBOOK.chapters.length} глав`
  );
})();