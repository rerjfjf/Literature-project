const book = window.TEXTBOOK;
const authors = book.authors || [
  {
    id: book.authorId || "main-author",
    name: book.title,
    fullName: book.title,
  },
];

const flatSections = book.chapters.flatMap((chapter) =>
  chapter.sections.map((section) => ({
    ...section,
    chapter,
    authorId: chapter.authorId || book.authorId || authors[0].id,
  }))
);

const state = {
  activeId: location.hash.replace("#", "") || flatSections[0].id,
  selectedAuthorId: null,
  query: "",
  token: localStorage.getItem("reader-token") || "",
  user: null,
  submissions: [],
  groups: [],
  users: [],
};

const elements = {
  bookTitle: document.querySelector("#bookTitle"),
  tocTitle: document.querySelector("#tocTitle"),
  toc: document.querySelector("#toc"),
  bookPage: document.querySelector("#bookPage"),
  chapterKicker: document.querySelector("#chapterKicker"),
  sectionTitle: document.querySelector("#sectionTitle"),
  sectionLead: document.querySelector("#sectionLead"),
  sectionBody: document.querySelector("#sectionBody"),
  progressLabel: document.querySelector("#progressLabel"),
  progressBar: document.querySelector("#progressBar"),
  prevSection: document.querySelector("#prevSection"),
  nextSection: document.querySelector("#nextSection"),
  searchInput: document.querySelector("#searchInput"),
  accountToggle: document.querySelector("#accountToggle"),
  aiDialogToggle: document.querySelector("#aiDialogToggle"),
  accountPanel: document.querySelector("#accountPanel"),
  accountClose: document.querySelector("#accountClose"),
  dashboard: document.querySelector("#dashboard"),
  dashboardBody: document.querySelector("#dashboardBody"),
  userName: document.querySelector("#userName"),
  roleLabel: document.querySelector("#roleLabel"),
  logoutButton: document.querySelector("#logoutButton"),
  themeToggle: document.querySelector("#themeToggle"),
  tocToggle: document.querySelector("#tocToggle"),
  tocClose: document.querySelector("#tocClose"),
  tocPanel: document.querySelector("#tocPanel"),
  overlay: document.querySelector("#overlay"),
};

const scrollTurn = {
  bottomArmed: false,
  topArmed: false,
  atBottom: false,
  atTop: true,
  bottomReadyAt: 0,
  topReadyAt: 0,
  lastAt: 0,
};

function init() {
  elements.bookTitle.textContent = book.title;
  elements.tocTitle.textContent = book.subtitle;
  state.selectedAuthorId = getActiveSection().authorId;

  renderToc();
  renderSection();
  bindEvents();
  restoreSession();

  if (localStorage.getItem("reader-theme") === "dark") {
    document.documentElement.classList.add("theme-dark");
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderToc();
  });

  elements.prevSection.addEventListener("click", () => moveSection(-1));
  elements.nextSection.addEventListener("click", () => moveSection(1));
  elements.aiDialogToggle.addEventListener("click", openAiDialog);

  // Кнопка "Войти / Кабинет" в шапке
  elements.accountToggle.addEventListener("click", () => {
    if (state.user) {
      openAccount();
    } else {
      window.location.href = "login.html";
    }
  });

  elements.accountClose.addEventListener("click", closeAccount);
  elements.logoutButton.addEventListener("click", logout);
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.tocToggle.addEventListener("click", openToc);
  elements.tocClose.addEventListener("click", closeToc);

  // Кнопка «Открыть платформу LitFair» в панели кабинета (адрес из конфигурации портала)
  const litfairLink = document.querySelector("#openLitfairLink");
  if (litfairLink) {
    litfairLink.href =
      (window.PORTAL_CONFIG && window.PORTAL_CONFIG.litfairUrl) || "http://localhost:5002";
  }
  elements.overlay.addEventListener("click", () => {
    closeToc();
    closeAccount();
  });

  // window.addEventListener("wheel", handlePageWheel, { passive: false }); 
  // window.addEventListener("scroll", updateScrollTurnEdges, { passive: true }); 

  window.addEventListener("hashchange", () => {
    const hashId = location.hash.replace("#", "");
    if (flatSections.some((section) => section.id === hashId)) {
      state.activeId = hashId;
      state.selectedAuthorId = getActiveSection().authorId;
      renderToc();
      renderSection();
    }
  });
}

function renderToc() {
  elements.toc.innerHTML = "";

  authors.forEach((author) => {
    const authorSections = flatSections.filter((section) => section.authorId === author.id);
    const matchingSections = authorSections.filter((section) => sectionMatches(section, section.chapter));

    if (state.query && matchingSections.length === 0) return;

    const authorNode = document.createElement("section");
    authorNode.className = "toc-author";

    const authorButton = document.createElement("button");
    authorButton.type = "button";
    authorButton.className = author.id === state.selectedAuthorId ? "author-button is-active" : "author-button";
    authorButton.innerHTML = `<span></span><strong>${author.fullName || author.name}</strong>`;
    
    authorButton.addEventListener("click", () => {
      state.selectedAuthorId = author.id;
      const firstMatch = matchingSections[0] || authorSections[0];
      if (firstMatch) {
        state.activeId = firstMatch.id;
        history.pushState(null, "", `#${firstMatch.id}`);
        renderToc();
        renderSection();
      }
    });

    authorNode.append(authorButton);

    if (author.id === state.selectedAuthorId || state.query) {
      const list = document.createElement("div");
      list.className = "toc-links";

      matchingSections.forEach((section) => {
        const link = document.createElement("a");
        link.href = `#${section.id}`;
        link.className = section.id === state.activeId ? "toc-link is-active" : "toc-link";
        link.innerHTML = `<span>${section.chapter.title}</span><strong>${section.title}</strong>`;
        
        link.addEventListener("click", () => {
          state.selectedAuthorId = author.id;
          closeToc();
        });

        list.append(link);
      });

      authorNode.append(list);
    }

    elements.toc.append(authorNode);
  });

  if (!elements.toc.children.length) {
    const empty = document.createElement("p");
    empty.className = "toc-empty";
    empty.textContent = "Ничего не найдено. Попробуйте другой запрос.";
    elements.toc.append(empty);
  }
}

function sectionMatches(section, chapter) {
  if (!state.query) return true;
  const blockText = section.blocks.map((block) => block.text || block.title || (block.items || []).join(" ") || (block.rows || []).flat().join(" ")).join(" ");
  return `${chapter.title} ${section.title} ${section.lead} ${blockText}`.toLowerCase().includes(state.query);
}

function renderSection() {
  const section = getActiveSection();
  const index = getActiveIndex();
  const percent = Math.round(((index + 1) / flatSections.length) * 100);

  document.title = `${section.title} | ${book.title}`;
  state.selectedAuthorId = section.authorId;

  elements.chapterKicker.textContent = `${getAuthor(section.authorId).fullName || getAuthor(section.authorId).name}. ${section.chapter.title}`;
  elements.sectionTitle.textContent = section.title;
  elements.sectionLead.textContent = section.lead;
  elements.sectionBody.innerHTML = "";

  const skipExtras = ["intro", "conclusion", "appendices", "preface"].includes(section.authorId);
    if (!skipExtras) {
      elements.sectionBody.append(renderSectionQr(section));
      elements.sectionBody.append(renderSectionAiPrompt(section));
    }

  section.blocks.forEach((block, index) => elements.sectionBody.append(renderBlock(block, section, index)));

  elements.progressLabel.textContent = `${percent}%`;
  elements.progressBar.style.width = `${percent}%`;
  elements.prevSection.disabled = index === 0;
  elements.nextSection.disabled = index === flatSections.length - 1;

  elements.bookPage.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });

  scrollTurn.bottomArmed = false;
  scrollTurn.topArmed = false;
  scrollTurn.atBottom = false;
  scrollTurn.atTop = true;
  scrollTurn.bottomReadyAt = 0;
  scrollTurn.topReadyAt = 0;
  scrollTurn.lastAt = Date.now();

  function renderSection() {
    const section = getActiveSection();
    const index = getActiveIndex();
    // ... весь существующий код без изменений ...

    scrollTurn.bottomArmed = false;
    scrollTurn.topArmed = false;
    scrollTurn.atBottom = false;
    scrollTurn.atTop = true;
    scrollTurn.bottomReadyAt = 0;
    scrollTurn.topReadyAt = 0;
    scrollTurn.lastAt = Date.now();

    // ─── Трекинг просмотра раздела ───────────────────────────────
    if (window.hubTrack) {
      window.hubTrack('page_view', {
        entityId: section.id,
        label: `${getAuthor(section.authorId).fullName || getAuthor(section.authorId).name} — ${section.title}`,
      });
    }
  }
}

async function restoreSession() {
  // Всегда спрашиваем сервер: он сам поймёт, есть ли общий портал-токен в cookie
  // (т.е. вошёл ли пользователь уже на другой платформе).
  try {
    const data = await api("/api/me");
    state.user = data.user;
    if (data.token) {
      state.token = data.token;
      localStorage.setItem("reader-token", state.token);
    }
    await refreshDashboardData();
    renderAuth();
    renderSection();
  } catch {
    logout();
  }
}

function logout() {
  // Чистим общий cookie, чтобы выйти на всех платформах сразу.
  fetch("/api/logout", { method: "POST" }).catch(() => {});
  state.token = "";
  state.user = null;
  state.submissions = [];
  state.groups = [];
  state.users = [];
  localStorage.removeItem("reader-token");
  renderAuth();
  closeAccount();
  renderSection();
}

function renderAuth() {
  const loggedIn = Boolean(state.user);
  elements.accountToggle.textContent = loggedIn ? "Кабинет" : "Войти";
  elements.dashboard.hidden = !loggedIn;

  if (!loggedIn) return;

  elements.userName.textContent = state.user.fullName;
  elements.roleLabel.textContent = roleName(state.user.role);
  renderDashboard();
}

async function refreshDashboardData() {
  if (!state.user) return;

  const requests = [api("/api/submissions/my").catch(() => ({ submissions: [] }))];

  if (["teacher", "admin"].includes(state.user.role)) {
    requests.push(api("/api/groups").catch(() => ({ groups: [] })));
    requests.push(api("/api/users").catch(() => ({ users: [] })));
    requests.push(api("/api/submissions/teacher").catch(() => ({ submissions: [] })));
  }

  const results = await Promise.all(requests);
  state.submissions = results[0].submissions || [];
  if (results[1]) state.groups = results[1].groups || [];
  if (results[2]) state.users = results[2].users || [];
  if (results[3]) state.teacherSubmissions = results[3].submissions || [];
}

function renderDashboard() {
  elements.dashboardBody.innerHTML = "";

  if (state.user.role === "student") {
    elements.dashboardBody.append(renderStudentPanel());
    return;
  }
  if (state.user.role === "teacher") {
    elements.dashboardBody.append(renderTeacherPanel(false));
    return;
  }
  elements.dashboardBody.append(renderTeacherPanel(true));
}

function renderStudentPanel() {
  const panel = document.createElement("div");
  panel.className = "panel-card";
  panel.innerHTML = `<h2>Мои оценки</h2>`;

  const list = document.createElement("div");
  list.className = "data-list";

  if (!state.submissions.length) {
    list.innerHTML = `<p class="toc-empty">Пока нет проверенных ответов. Откройте задание в учебнике и отправьте ответ.</p>`;
  } else {
    state.submissions.forEach((item) => list.append(renderSubmissionItem(item)));
  }

  panel.append(list);
  return panel;
}

function renderTeacherPanel(isAdmin) {
  const wrap = document.createElement("div");
  wrap.className = "panel-grid";

  const groupsCard = document.createElement("div");
  groupsCard.className = "panel-card";
  groupsCard.innerHTML = `<h2>${isAdmin ? "Панель администратора" : "Панель преподавателя"}</h2><h3>Классы и группы</h3>`;

  const groupForm = document.createElement("form");
  groupForm.className = "auth-card";
  groupForm.innerHTML = `<label>Название класса<input name="name" placeholder="10 А" required /></label><button class="text-button" type="submit">Создать группу</button>`;

  groupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = new FormData(groupForm).get("name");
    await api("/api/groups", { method: "POST", body: { name } });
    await refreshDashboardData();
    renderDashboard();
  });

  groupsCard.append(groupForm, renderGroupsList());

  const usersCard = document.createElement("div");
  usersCard.className = "panel-card";
  usersCard.innerHTML = `<h3>Пользователи</h3>`;
  usersCard.append(renderUsersList(isAdmin));

  const submissionsCard = document.createElement("div");
  submissionsCard.className = "panel-card";
  submissionsCard.innerHTML = `<h3>Работы учеников</h3>`;

  const subList = document.createElement("div");
  subList.className = "data-list";
  const submissions = state.teacherSubmissions || [];

  if (!submissions.length) subList.innerHTML = `<p class="toc-empty">Работ пока нет.</p>`;
  submissions.forEach((item) => subList.append(renderSubmissionItem(item, true)));

  submissionsCard.append(subList);
  wrap.append(groupsCard, usersCard, submissionsCard);
  return wrap;
}

function renderGroupsList() {
  const list = document.createElement("div");
  list.className = "data-list";

  if (!state.groups.length) list.innerHTML = `<p class="toc-empty">Группы ещё не созданы.</p>`;

  state.groups.forEach((group) => {
    const item = document.createElement("div");
    item.className = "data-item";
    item.innerHTML = `<strong>${group.name}</strong><small>ID: ${group.id}</small>`;
    list.append(item);
  });

  return list;
}

function renderUsersList(isAdmin) {
  const list = document.createElement("div");
  list.className = "data-list";

  if (!state.users.length) list.innerHTML = `<p class="toc-empty">Пользователи не найдены.</p>`;

  state.users.forEach((user) => {
    const item = document.createElement("div");
    item.className = "data-item";
    const groupOptions = [`<option value="">Без группы</option>`]
      .concat(state.groups.map((group) => `<option value="${group.id}" ${user.groupId === group.id ? "selected" : ""}>${group.name}</option>`))
      .join("");

    item.innerHTML = `
      <strong>${user.fullName}</strong>
      <small>${user.email} · ${roleName(user.role)}</small>
      <label>Группа<select data-action="group" data-user="${user.id}">${groupOptions}</select></label>
      ${
        isAdmin
          ? `<label>Роль<select data-action="role" data-user="${user.id}">
              <option value="student" ${user.role === "student" ? "selected" : ""}>Студент</option>
              <option value="teacher" ${user.role === "teacher" ? "selected" : ""}>Преподаватель</option>
              <option value="admin" ${user.role === "admin" ? "selected" : ""}>Администратор</option>
            </select></label>`
          : ""
      }
    `;

    item.querySelectorAll("select").forEach((select) => {
      select.addEventListener("change", async () => {
        const payload = select.dataset.action === "group" ? { groupId: select.value } : { role: select.value };
        await api(`/api/users/${select.dataset.user}`, { method: "PATCH", body: payload });
        await refreshDashboardData();
        renderDashboard();
      });
    });

    list.append(item);
  });

  return list;
}

function renderSubmissionItem(item, showStudent = false) {
  const node = document.createElement("div");
  node.className = "data-item";
  const score = item.finalScore ?? item.ai?.score ?? "-";

  node.innerHTML = `
    <strong>${item.topic || item.sectionId}</strong>
    <span class="status-pill">Оценка: ${score}</span>
    <small>${showStudent && item.student ? `${item.student.fullName} · ` : ""}${item.author || ""}</small>
    <small>${item.ai?.comment || item.error || "Ожидает проверки"}</small>
  `;

  return node;
}

function renderBlock(block, section, blockIndex) {
  if (block.type === "h2") {
    const heading = document.createElement("h2");
    heading.textContent = block.text;
    return heading;
  }

  if (block.type === "list") {
    const list = document.createElement("ul");
    block.items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    });
    return list;
  }

  if (block.type === "table") {
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrap";
    const table = document.createElement("table");
    const [head, ...rows] = block.rows;

    if (head) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      head.forEach((cell) => {
        const th = document.createElement("th");
        th.textContent = cell;
        tr.append(th);
      });
      thead.append(tr);
      table.append(thead);
    }

    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.append(td);
      });
      tbody.append(tr);
    });

    table.append(tbody);
    wrapper.append(table);
    return wrapper;
  }

  if (block.type === "image") {
    const figure = document.createElement("figure");
    figure.className = "textbook-figure";
    const img = document.createElement("img");
    img.src = block.src;
    img.alt = block.alt || block.caption || "";
    img.addEventListener("error", () => figure.classList.add("is-missing"));

    const caption = document.createElement("figcaption");
    caption.textContent = block.caption || "Иллюстрация к учебному разделу.";
    figure.append(img, caption);
    return figure;
  }

  if (block.type === "terms") {
    const wrapper = document.createElement("section");
    wrapper.className = "terms-card";
    const title = document.createElement("h2");
    title.textContent = block.title || "Ключевые термины";

    const list = document.createElement("div");
    list.className = "terms-grid";

    (block.items || []).forEach((item) => {
      const link = document.createElement(item.href ? "a" : "span");
      link.className = "term-chip";
      if (item.href) link.href = item.href;
      link.innerHTML = `<strong>${item.term}</strong><span>${item.text || ""}</span>`;
      list.append(link);
    });

    wrapper.append(title, list);
    return wrapper;
  }

if (block.type === "video") {
  const card = document.createElement("section");
  card.className = "video-card";
  const title = document.createElement("h2");
  title.textContent = block.title || "Видеоматериал";
  const text = document.createElement("p");
  text.textContent = block.text || "Видео находится в общей видеотеке учебника.";
  const videoId = `${section.authorId}:${section.id}:${blockIndex}`;
  const link = document.createElement("a");
  link.className = "text-button";
  link.href = `videos.html#${videoId.replace(/:/g, "--")}`;
  link.textContent = "Смотреть видео";
  card.append(title, text, link);
  return card;
}

  if (block.type === "gallery") {
    const wrapper = document.createElement("section");
    wrapper.className = "gallery-card";

    const title = document.createElement("h2");
    title.textContent = block.title || "Фотоматериалы";

    const grid = document.createElement("div");
    grid.className = "gallery-grid";

    (block.images || []).forEach((item) => {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.alt || item.caption || "";
      img.addEventListener("error", () => figure.classList.add("is-missing"));

      const caption = document.createElement("figcaption");
      caption.textContent = item.caption || "Иллюстрация к авторскому разделу.";
      figure.append(img, caption);
      grid.append(figure);
    });

    wrapper.append(title, grid);
    return wrapper;
  }

  if (block.type === "trainer") {
    return renderTrainer(block, section, blockIndex);
  }

  if (block.type === "note") {
    const note = document.createElement("aside");
    const isAssignment = block.title.toLowerCase().includes("задание");
    note.className = isAssignment ? "note assignment-card" : "note";

    if (!isAssignment) {
      note.innerHTML = `<strong>${block.title}</strong><p>${block.text}</p>`;
      return note;
    }

    note.append(renderAssignment(block, section, blockIndex));
    return note;
  }

  if (block.type === "quote") {
    const quote = document.createElement("blockquote");
    quote.textContent = block.text;
    return quote;
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = block.text;
  return paragraph;
}

function renderSectionQr(section) {
  const author = getAuthor(section.authorId);
  const qr = document.createElement("figure");
  qr.className = "section-qr";

  const img = document.createElement("img");
  img.src = author.qr || `qrcodes/${author.id}.png`;
  img.alt = `QR-код материалов раздела ${section.title}`;
  img.addEventListener("error", () => {
    img.hidden = true;
    qr.classList.add("is-missing");
  });

  const caption = document.createElement("figcaption");
  caption.textContent = "QR к материалам автора и раздела";
  qr.append(img, caption);
  return qr;
}

function renderSectionAiPrompt(section) {
  const author = getAuthor(section.authorId);
  const wrapper = document.createElement("aside");
  wrapper.className = "section-ai-card";

  const question = document.createElement("strong");
  question.textContent = getSectionAiQuestion(section);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "text-button";
  button.textContent = "Получить ответ";

  const output = document.createElement("div");
  output.className = "section-ai-answer";

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "ИИ готовит ответ...";
    output.textContent = "";

    try {
      const result = await api("/api/ai/dialog", {
        method: "POST",
        auth: false,
        body: {
          prompt: `${question.textContent} Дай четкий, содержательный ответ на 8-10 предложений. Свяжи раздел с современным читателем, военным контекстом, авторской позицией и конкретными образами. Не используй сленг, неопределенные слова и технические комментарии.`,
          author: author.fullName || author.name,
          topic: section.title,
          context: sectionContext(section),
          history: [],
        },
      });

      output.textContent = result.answer;
      button.textContent = "Обновить ответ";
    } catch (error) {
      output.textContent = error.message;
      button.textContent = "Попробовать снова";
    } finally {
      button.disabled = false;
    }
  });

  wrapper.append(question, button, output);
  return wrapper;
}
function getSectionAiQuestion(section) {
  // 1. Очистка заголовка от лишних пробелов
  const cleanTitle = (section.title || "")
    .replace(/\s+/g, " ")
    .replace(/\s+"/g, '"')
    .replace(/"\s+/g, '"')
    .trim();

  const id = section.id.toLowerCase();
  const title = cleanTitle.toLowerCase();
  const lead = (section.lead || "").toLowerCase();
  const text = `${title} ${lead}`;

  const author = getAuthor(section.authorId);
  const authorName = author.fullName || author.name || "автор";

  // ==========================================
  // СЛОВАРЬ СКЛОНЕНИЙ (100% грамматическая точность)
  // ==========================================
  const declensions = {
    "akhmatova":  { gen: "А. А. Ахматовой", inst: "А. А. Ахматовой" },
    "rybakov":    { gen: "А. Н. Рыбакова", inst: "А. Н. Рыбаковым" },
    "bykov":      { gen: "В. В. Быкова", inst: "В. В. Быковым" },
    "vasilyev":   { gen: "Б. Л. Васильева", inst: "Б. Л. Васильевым" },
    "kondratyev": { gen: "В. Л. Кондратьева", inst: "В. Л. Кондратьевым" },
    "tvardovsky": { gen: "А. Т. Твардовского", inst: "А. Т. Твардовским" },
    "zabolotsky": { gen: "Н. А. Заболоцкого", inst: "Н. А. Заболоцким" },
    "okudzhava":  { gen: "Б. Ш. Окуджавы", inst: "Б. Ш. Окуджавой" },
    "vysotsky":   { gen: "В. С. Высоцкого", inst: "В. С. Высоцким" },
    "evtyushenko":{ gen: "Е. А. Евтушенко", inst: "Е. А. Евтушенко" }, // Фамилия не склоняется!
    "preface":    { gen: "автора", inst: "автором" },
    "intro":      { gen: "автора", inst: "автором" },
    "overview":   { gen: "авторов", inst: "авторами" },
    "conclusion": { gen: "авторов", inst: "авторами" }
  };

  const decl = declensions[section.authorId] || { gen: authorName, inst: authorName };
  const authorGen = decl.gen;   // Родительный падеж (кого? чего?)
  const authorInst = decl.inst; // Творительный падеж (кем? чем?)

  // ==========================================
  // ТОЧЕЧНЫЕ УНИКАЛЬНЫЕ ВОПРОСЫ (с правильным склонением)
  // ==========================================
  if (id.includes("pereprava") || text.includes("переправа")) {
    return `Как образ ледяной реки в главе «Переправа» становится метафорой исторического испытания, и почему ${authorName} избегает здесь пафоса, показывая войну через физические ощущения?`;
  }
  if (id.includes("garmon") || text.includes("гармонь")) {
    return `Почему игра на гармони погибшего командира в поэме «Василий Тёркин» становится актом сохранения памяти и духовной эстафеты, а не просто бытовым эпизодا?`;
  }
  if (id.includes("smert") && id.includes("voin")) {
    return `Как народный юмор и почти сказочная форма диалога со Смертью помогают ${authorName} показать победу жизни и человеческого достоинства над небытием?`;
  }
  if (id.includes("rzhev") || title.includes("я убит подо ржевом")) {
    return `Почему монолог от лица погибшего солдата в стихотворении «Я убит подо Ржевом» звучит не как жалоба, а как строгое нравственное завещание живым?`;
  }
  if (id.includes("po-pravu-pamyati") || title.includes("по праву памяти")) {
    return `Как тема семейного раскулачивания в поэме «По праву памяти» раскрывает цену молчания и личную ответственность поэта перед исторической правдой?`;
  }
  // if (id.includes("biografi") || id.includes("znakomstvo") || title.includes("биограф")) {
  //   return `Как конкретный эпизод биографии ${authorName} предопределил его отказ от парадного, приукрашенного изображения войны?`;
  // }
  if (id.includes("zamysel") || title.includes("замысел")) {
    return `Почему ${authorName} сознательно отказался от создания исключительного, «плакатного» героя в пользу образа обычного, уставшего солдата?`;
  }
  if (id.includes("terkin") && title.includes("василий тёркин")) {
    return `Как поэма «Василий Тёркин» стала не просто литературным произведением, а живой частью фронтовой жизни, которую солдаты переписывали от руки и носили с собой?`;
  }
  if (id.includes("novy-mir") || title.includes("новый мир")) {
    return `Как редакторская деятельность ${authorName} в журнале «Новый мир» стала формой гражданского мужества и борьбы за литературную честность?`;
  }
  // if (id.includes("akhmatova") && title.includes("реквием")) {
  //   return `Как в поэме «Реквием» личное материнское горе А.А. Ахматовой превращается в голос целого народа, стоящего в тюремных очередях, и почему это важно сегодня?`;
  // }
  if (id.includes("akhmatova") && title.includes("мужество")) {
    return `Почему в стихотворении «Мужество» A.A.Ахматова говорит о спасении русской речи как о главном акте гражданского сопротивления и сохранения идентичности?`;
  }
  if (id.includes("rybakov") || title.includes("дети арбата")) {
    return `Как роман «Дети Арбата» показывает механизм разрушения человеческих судеб и дружбы через призму страха и идеологического давления 1930-х годов?`;
  }
  if (id.includes("bykov") && title.includes("сотников")) {
    return `В чём трагическая разница между физическим выживанием Рыбака и нравственной гибелью Сотникова, и как этот выбор отражается на современном читателе?`;
  }
  if (id.includes("bykov") && title.includes("обелиск")) {
    return `Почему поиск правды о погибшем учителе в повести «Обелиск» становится для Мороза способом искупления собственной душевной черствости?`;
  }
  if (id.includes("vasilyev") || title.includes("зори здесь тихие")) {
    return `Как контраст между хрупкостью женских судеб и механической жестокостью войны в повести Васильева усиливает трагизм их гибели и обесценивание жизни?`;
  }
  if (id.includes("kondratyev") || title.includes("сашка")) {
    return `Почему решение Сашки сохранить жизнь пленному немцу в повести Кондратьева является высшим проявлением человечности посреди хаоса и дегуманизации войны?`;
  }
  if (id.includes("zabolotsky") && title.includes("лениться")) {
    return `Как призыв «не позволять душе лениться» в стихотворении Заболоцкого соотносится с его личным опытом преодоления лагерных испытаний и сохранения достоинства?`;
  }
  if (id.includes("zabolotsky") && title.includes("березовой")) {
    return `Почему пейзажная лирика Заболоцкого о природе пронизана ощущением хрупкости жизни и ценности каждого мгновения после пережитых репрессий?`;
  }
  if (id.includes("okudzhava")) {
    return `Как авторская песня Окуджавы демифологизирует войну, возвращая ей человеческое, интимное и трагическое измерение в противовес парадной риторике?`;
  }
  if (id.includes("vysotsky") && title.includes("не вернулся")) {
    return `Почему в песне Высоцкого «Он не вернулся из боя» мотив вины выжившего становится центральным нервным узлом, понятным каждому, кто потерял близких?`;
  }
  if (id.includes("vysotsky") && title.includes("братских могилах")) {
    return `Как строчка «на братских могилах не ставят крестов» отражает уникальный, внеконфессиональный и всенародный характер памяти о войне?`;
  }
  if (id.includes("evtyushenko") || title.includes("бабий яр")) {
    return `Как стихотворение Евтушенко «Бабий Яр» превращает конкретную историческую трагедию в универсальный крик против антисемитизма, равнодушия и забвения?`;
  }
  if (id.includes("preface") || title.includes("предисловие") || title.includes("аннотация")) {
    return `Почему интеграция цифровой дидактики и классического филологического анализа важна для формирования исторической памяти у современного студента?`;
  }
  if (id.includes("intro") || title.includes("введение")) {
    return `Какую главную цель преследует этот учебник, соединяя литературу о войне с инструментами критического мышления и цифровой среды?`;
  }
  if (id.includes("overview") || title.includes("итог") || title.includes("заключение") || title.includes("обобщение")) {
    return `Как обобщение творчества  Анны Андреевны Ахматовой меняет понимание цены победы и нашей ответственности за сохранение памяти о ней?`;
  }
  if (id.includes("critic") || title.includes("критик") || title.includes("мнение")) {
    return `Как через судьбу и слово Анны Ахматовой раскрывается вечный разговор читателя с историей о личной ответственности человека?`;
  }
  if (id.includes("trainer") || title.includes("тренаж") || title.includes("задание") || title.includes("шаг")) {
    return `Как предложенный здесь интерактивный формат помогает перевести сухое знание текста в личное нравственное переживание и самостоятельный вывод?`;
  }

  // ==========================================
  // КОМБИНАТОРНЫЙ ГЕНЕРАТОР (с правильными падежами!)
  // ==========================================
  const starters = [
    `Зачем в разделе "${cleanTitle}" показана`,
    `Почему в разделе "${cleanTitle}" так важна`,
    `Какую роль в разделе "${cleanTitle}"  играет`,
    `Каким образом в разделе "${cleanTitle}" раскрывается`,
    `Почему анализ раздела "${cleanTitle}" помогает понять`,
    `Как в разделе "${cleanTitle}" проявляется`,
    `Какую связь с современностью устанавливает раздел "${cleanTitle}" через`,
    `Почему для понимания раздела "${cleanTitle}" ключевым является`,
    `Каким образом контекст раздела "${cleanTitle}" иллюстрирует`,
    `Почему в центре внимания раздела "${cleanTitle}" оказывается`
  ];

  const middles = [
    `тема нравственного выбора человека в экстремальных условиях`,
    `способность обычного человека сохранять достоинство в нечеловеческих условиях`,
    `цену Великой Победы и личную ответственность каждого человека за сохранение и преемственность исторической памяти, хранящей в себе уроки прошлого и судьбу народа`,
    `отказ ${authorGen} от парадного изображения войны в пользу суровой правды`,
    `внутреннее состояние человека на войне и его борьбу со страхом`,
    `связь между личной судьбой героя и историческими катаклизмами XX века`,
    `важность сохранения человечности и взаимовыручки среди хаоса и разрушений`,
    `трагизм утрат и ответственность живых перед памятью погибших`,
    `сложность человеческого выбора, когда на кону стоит сама жизнь`,
    `роль народного юмора и простой речи как формы духовного сопротивления`,
    `противостояние личности системе и стремление остаться собой`,
    `влияние фронтового опыта на мировоззрение и творческий метод ${authorGen}`,
    `хрупкость мирной жизни и ценность каждого мгновения перед лицом смерти`,
    `мысль о том, что настоящий героизм часто скрыт в повседневных поступках`,
    `необходимость честного, без приукрашиваний, разговора о трагических страницах истории`
  ];

  const endings = [
    ` и почему этот аспект остаётся критически важным для современного читателя?`,
    `? Как через человеческие судьбы мы видим суровую правду военного времени в произведениях ${authorGen}?`,
    ` и какой урок это несёт для формирования исторической памяти нового поколения?`,
    `? Как это отражает глубину художественного замысла ${authorGen}?`,
    ` и почему именно такой подход делает произведение таким пронзительным?`,
    `? Как это помогает современному студенту осмыслить ценность мирной жизни?`,
    ` и в чём заключается главная гуманистическая мысль данного материала?`,
    `? Как это демонстрирует эволюцию взглядов ${authorGen} на природу человека?`,
    ` и почему эта тема не теряет своей остроты спустя десятилетия?`,
    `? Как это подтверждает мысль о том, что война проверяет человека на прочность?`
  ];

  // Вычисляем детерминированный хэш из ID раздела
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash; 
  }
  const absHash = Math.abs(hash);

  // Выбираем индексы на основе хэша. 10 * 15 * 10 = 1500 уникальных комбинаций!
  const startIdx = absHash % starters.length;
  const midIdx = ((absHash >> 4) % middles.length + startIdx) % middles.length; 
  const endIdx = ((absHash >> 8) % endings.length + midIdx) % endings.length;

  return starters[startIdx] + " " + middles[midIdx] + endings[endIdx];
}


function renderTrainer(block, section, blockIndex) {
  const trainerId = `${section.authorId}:${section.id}:trainer:${blockIndex}`;
  const saved = JSON.parse(localStorage.getItem(`reader-trainer:${trainerId}`) || "null");

  const wrapper = document.createElement("section");
  wrapper.className = "trainer-card";

  const title = document.createElement("h2");
  title.textContent = block.title || "Тренажёр";

  const intro = document.createElement("p");
  intro.textContent = block.text || "Выберите ответы и проверьте результат сразу.";

  wrapper.append(title, intro);

  const form = document.createElement("form");
  form.className = "trainer-form";

  (block.questions || []).forEach((question, questionIndex) => {
    const field = document.createElement("fieldset");
    field.className = "trainer-question";

    const legend = document.createElement("legend");
    legend.textContent = `${questionIndex + 1}. ${question.prompt}`;
    field.append(legend);

    question.options.forEach((option, optionIndex) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="radio" name="q${questionIndex}" value="${optionIndex}" ${saved?.answers?.[questionIndex] === optionIndex ? "checked" : ""}> <span>${option}</span>`;
      field.append(label);
    });

    form.append(field);
  });

  const actions = document.createElement("div");
  actions.className = "assignment-actions";

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "text-button";
  button.textContent = "Проверить тренажёр";

  const output = document.createElement("output");
  output.className = "grade-status";
  if (saved) output.textContent = trainerSummary(saved, block.questions || []);

  actions.append(button, output);
  form.append(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const questions = block.questions || [];
    const formData = new FormData(form);

    const answers = questions.map((_, index) => {
      const value = formData.get(`q${index}`);
      return value === null ? -1 : Number(value);
    });

    if (answers.some((answer) => answer < 0)) {
      output.textContent = "Ответьте на все вопросы тренажёра, затем нажмите проверку.";
      renderTrainerExplanations(wrapper, questions, answers);
      return;
    }

    const correct = questions.reduce((sum, question, index) => sum + (answers[index] === question.answer ? 1 : 0), 0);
    const result = {
      answers,
      correct,
      total: questions.length,
      checkedAt: new Date().toISOString(),
    };

    localStorage.setItem(`reader-trainer:${trainerId}`, JSON.stringify(result));
    output.textContent = trainerSummary(result, questions);
    renderTrainerExplanations(wrapper, questions, answers);
  });

  wrapper.append(form);
  if (saved) renderTrainerExplanations(wrapper, block.questions || [], saved.answers || []);

  return wrapper;
}

function trainerSummary(result, questions) {
  const total = result.total || questions.length || 1;
  const score = Math.round((result.correct / total) * 100);
  return `Результат: ${result.correct}/${total}, ${score} баллов.`;
}

function renderTrainerExplanations(wrapper, questions, answers) {
  wrapper.querySelector(".trainer-feedback")?.remove();
  const feedback = document.createElement("div");
  feedback.className = "trainer-feedback";

  questions.forEach((question, index) => {
    const item = document.createElement("p");
    const isCorrect = answers[index] === question.answer;
    item.textContent = `${index + 1}. ${isCorrect ? "Верно" : "Нужно исправить"}: ${question.explanation || "Сверьте ответ с текстом раздела."}`;
    feedback.append(item);
  });

  wrapper.append(feedback);
}

function renderAssignment(block, section, blockIndex) {
  const author = getAuthor(section.authorId);
  const assignmentId = `${section.authorId}:${section.id}:${blockIndex}`;
  const answerKey = `reader-answer:${assignmentId}`;
  const savedAnswer = localStorage.getItem(answerKey) || "";
  const savedSubmission = state.submissions.find((item) => item.assignmentId === assignmentId);
  const savedGrade = savedSubmission?.ai || null;

  const wrapper = document.createElement("div");
  wrapper.className = "assignment-layout";

  const qr = document.createElement("figure");
  qr.className = "qr-box";

  const qrImage = document.createElement("img");
  qrImage.src = author.qr || `qrcodes/${author.id}.png`;
  qrImage.alt = `QR-код для автора ${author.name}`;
  qrImage.addEventListener("error", () => {
    qrImage.hidden = true;
    qr.classList.add("is-missing");
  });

  const caption = document.createElement("figcaption");
  caption.textContent = "QR для материалов автора";
  qr.append(qrImage, caption);

  const content = document.createElement("div");
  content.className = "assignment-content";

  const title = document.createElement("strong");
  title.textContent = block.title;

  const text = document.createElement("p");
  text.textContent = block.text;

  const answer = document.createElement("label");
  answer.className = "answer-field";
  answer.innerHTML = `<span>Ответ студента</span>`;

  const textarea = document.createElement("textarea");
  textarea.value = savedSubmission?.answer || savedAnswer;
  textarea.placeholder = "Введите ответ здесь. ИИ проверит работу и сохранит оценку в личном кабинете.";
  textarea.rows = 7;
  textarea.disabled = Boolean(savedGrade);
  textarea.addEventListener("input", () => localStorage.setItem(answerKey, textarea.value));
  answer.append(textarea);

  const actions = document.createElement("div");
  actions.className = "assignment-actions";

  const checkButton = document.createElement("button");
  checkButton.type = "button";
  checkButton.className = "text-button";
  checkButton.textContent = savedGrade ? "Оценка сохранена" : "Проверить с ИИ";
  checkButton.disabled = Boolean(savedGrade);


    checkButton.addEventListener("click", async () => {
    if (!state.user) {
      window.location.href = "login.html";
      return;
    }

    // ─── Трекинг клика по заданию ───────────────────────────────
    if (window.hubTrack) {
      window.hubTrack('task_click', {
        entityId: assignmentId,
        label: block.title,
        payload: { author: author.fullName || author.name, topic: section.title },
      });
    }

    checkButton.disabled = true;
    checkButton.textContent = "ИИ проверяет...";
    localStorage.setItem(answerKey, textarea.value);

    try {
      const result = await api("/api/submissions", {
        method: "POST",
        body: {
          assignmentId,
          sectionId: section.id,
          blockIndex,
          author: author.fullName || author.name,
          topic: section.title,
          question: block.text,
          answer: textarea.value,
          context: sectionContext(section),
        },
      });

      await refreshDashboardData();
      status.textContent = formatEvaluation(result.submission.ai);
      textarea.disabled = true;
      checkButton.textContent = "Оценка сохранена";
    } catch (error) {
      checkButton.disabled = false;
      checkButton.textContent = "Проверить с ИИ";
      status.textContent = error.message;
    }
  });


  const status = document.createElement("output");
  status.className = "grade-status";
  status.textContent = savedGrade ? formatEvaluation(savedGrade) : "Оценка появится здесь после проверки ИИ и сохранится в кабинете.";

  actions.append(checkButton, status);
  content.append(title, text, answer, actions);
  wrapper.append(qr, content);

  return wrapper;
}

function formatEvaluation(ai) {
  if (!ai) return "Оценка пока не готова.";
  return `Оценка: ${ai.score}/100 (${ai.mark}). ${ai.comment}`;
}

function sectionContext(section) {
  return [section.lead]
    .concat(section.blocks.map((block) => block.text || (block.items || []).join(" ") || (block.rows || []).flat().join(" ")))
    .join("\n")
    .slice(0, 8000);
}

function moveSection(direction) {
  const next = flatSections[getActiveIndex() + direction];
  if (!next) return;

  state.activeId = next.id;
  history.pushState(null, "", `#${next.id}`);
  renderToc();
  renderSection();
}

function updateScrollTurnEdges() {
  const atBottom = isNearPageBottom();
  const atTop = isNearPageTop();

  if (atBottom && !scrollTurn.atBottom) {
    scrollTurn.bottomArmed = true;
    scrollTurn.topArmed = false;
    scrollTurn.bottomReadyAt = Date.now() + 850;
  }
  if (atTop && !scrollTurn.atTop) {
    scrollTurn.topArmed = true;
    scrollTurn.bottomArmed = false;
    scrollTurn.topReadyAt = Date.now() + 850;
  }
  if (!atBottom) {
    scrollTurn.bottomArmed = false;
    scrollTurn.bottomReadyAt = 0;
  }
  if (!atTop) {
    scrollTurn.topArmed = false;
    scrollTurn.topReadyAt = 0;
  }

  scrollTurn.atBottom = atBottom;
  scrollTurn.atTop = atTop;
}

function handlePageWheel(event) {
  if (!elements.accountPanel.hidden || elements.tocPanel.classList.contains("is-open")) return;
  if (Date.now() - scrollTurn.lastAt < 900) return;

  if (event.deltaY > 0 && isNearPageBottom()) {
    event.preventDefault();
    const index = getActiveIndex();
    if (Date.now() < scrollTurn.bottomReadyAt) return;
    if (index < flatSections.length - 1 && scrollTurn.bottomArmed) {
      scrollTurn.lastAt = Date.now();
      moveSection(1);
      return;
    }
    scrollTurn.bottomArmed = true;
    scrollTurn.topArmed = false;
    scrollTurn.bottomReadyAt = Date.now() + 850;
    return;
  }

  if (event.deltaY < 0 && isNearPageTop()) {
    event.preventDefault();
    const index = getActiveIndex();
    if (Date.now() < scrollTurn.topReadyAt) return;
    if (index > 0 && scrollTurn.topArmed) {
      scrollTurn.lastAt = Date.now();
      moveSection(-1);
      return;
    }
    scrollTurn.topArmed = true;
    scrollTurn.bottomArmed = false;
    scrollTurn.topReadyAt = Date.now() + 850;
  }
}

function isNearPageBottom() {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
}

function isNearPageTop() {
  return window.scrollY <= 8;
}

function getActiveSection() {
  return flatSections.find((section) => section.id === state.activeId) || flatSections[0];
}

function getActiveIndex() {
  return flatSections.findIndex((section) => section.id === getActiveSection().id);
}

function getAuthor(authorId) {
  return authors.find((author) => author.id === authorId) || authors[0];
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.auth !== false && state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");

  return data;
}

function roleName(role) {
  return (
    {
      admin: "Администратор",
      teacher: "Преподаватель",
      student: "Студент",
    }[role] || "Пользователь"
  );
}

function toggleTheme() {
  document.documentElement.classList.toggle("theme-dark");
  localStorage.setItem(
    "reader-theme",
    document.documentElement.classList.contains("theme-dark") ? "dark" : "light"
  );
}

function openToc() {
  elements.tocPanel.classList.add("is-open");
  elements.overlay.hidden = false;
}

function closeToc() {
  elements.tocPanel.classList.remove("is-open");
  if (elements.accountPanel.hidden) elements.overlay.hidden = true;
}

function openAccount() {
  elements.accountPanel.hidden = false;
  elements.overlay.hidden = false;
  document.body.classList.add("modal-open");
}

function closeAccount() {
  elements.accountPanel.hidden = true;
  document.body.classList.remove("modal-open");
  if (!elements.tocPanel.classList.contains("is-open")) elements.overlay.hidden = true;
}

function openAiDialog() {
  if (window.hubTrack) {
    window.hubTrack('ai_dialog_open', { label: 'Открыт ИИ-диалог из учебника' });
  }
  const dialogUrl =
    (window.PORTAL_CONFIG && window.PORTAL_CONFIG.dialogUrl) || "http://localhost:3001";
  window.open(dialogUrl, "_blank", "noopener");
}

init();