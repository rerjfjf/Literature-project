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
// РУЧНОЙ СПРАВОЧНИК ВОПРОСОВ ДЛЯ ИИ
// Ключ объекта = id раздела (section.id)
// Значение = точный, выверенный вопрос для ИИ
// ==========================================
const SECTION_QUESTIONS = {
  // ═══════════════════════════════════════════════════════════════
  // А. А. АХМАТОВА
  // ═══════════════════════════════════════════════════════════════
  "akhmatova": "Какой внутренний огонь заставлял Ахматову писать стихи, когда мир вокруг рушился, и как это пламя согревало души читателей?",
  "akhmatova-author-sheet": "Как в строках «И в мире нет святей и чище пепла...» боль утраты превращается в вечный памятник любви к родной земле?",
  "akhmatova-ch-znakomstvo-s-avtorom-i-biografiya": "Какие испытания судьбы закалили душу Ахматовой и научили её говорить правду даже тогда, когда это было опасно?",
  "akhmatova-znakomstvo-s-avtorom-i-biografiya": "Почему биография Ахматовой читается как трагическая поэма о стойкости человеческого духа в эпоху безумия?",
  "akhmatova-ch-rekviem": "Как «Реквием» стал не просто стихами, а криком миллионов матерей, стоявших в тюремных очередях?",
  "akhmatova-rekviem": "Каким образом Ахматова превратила личное горе в рукопись страданий целого народа?",
  "akhmatova-ch-voennaya-lirika": "Что роднит стихотворения «Мужество», «Клятва», «Победа» и почему они звучат как молитва о спасении России?",
  "akhmatova-muzhestvo": "Почему в 1942 году Ахматова написала о мужестве не как о подвиге, а как о последней надежде сохранить русскую речь?",
  "akhmatova-klyatva": "Какую клятву даёт поэт своему народу в стихотворении, и почему эта клятва важнее любых официальных обещаний?",
  "akhmatova-pobeda": "Почему победа в понимании Ахматовой — это не только триумф, но и горькая память о тех, кто не дожил до этого дня?",
  "akhmatova-ch-uroven-1-bazovyy-znanie-teksta": "Какие образы и символы помогают читателю впервые прикоснуться к трагическому миру Ахматовой?",
  "akhmatova-uroven-1-bazovyy-znanie-teksta": "Что должен понять студент, читая строки Ахматовой впервые, и какие детали открывают глубину её поэзии?",
  "akhmatova-ch-uroven-2-sredniy-analiz": "Какими художественными средствами Ахматова создаёт ощущение присутствия смерти рядом с жизнью?",
  "akhmatova-uroven-2-sredniy-analiz": "Какие литературные приёмы превращают простые слова Ахматовой в вечные символы народного страдания?",
  "akhmatova-ch-uroven-3-prodvinutyy-sintez-i-otsenka": "Как творчество Ахматовой меняет наше понимание того, что значит быть поэтом в эпоху катастроф?",
  "akhmatova-uroven-3-prodvinutyy-sintez-i-otsenka": "Почему сегодня, спустя десятилетия, голос Ахматовой звучит так, будто она пишет о сегодняшнем дне?",
  "akhmatova-interactive": "Как интерактивные задания помогают студенту не просто прочитать, а пережить опыт Ахматовой?",
  "akhmatova-interactive-methods": "Какие современные методы работы с текстом позволяют прикоснуться к боли, которую испытывала Ахматова?",
  "akhmatova-slide-tasks": "Как задания из слайдов помогают увидеть связь между эпохой Ахматовой и нашим временем?",
  "akhmatova-critics": "Что говорили современники о смелости Ахматовой писать правду, когда все молчали?",
  "akhmatova-critics-view": "Почему критики называли Ахматову «голосом народа» и как это звание оправдало её творчество?",
  "akhmatova-summary": "Какой главный урок оставляет нам Ахматова после всех испытаний, через которые она прошла?",
  "akhmatova-final-summary": "Как в финальном аккорде познания страницы жизни Ахматовой сплетаются в единое полотно народной памяти?",

  // ═══════════════════════════════════════════════════════════════
  // В. В. БЫКОВ
  // ═══════════════════════════════════════════════════════════════
  "bykov": "Почему Быков писал о войне так, будто сам стоял в том окопе, и как это меняет наше восприятие войны?",
  "bykov-author-sheet": "Как в тупике человеческого выбора раскрывается трагедия тех, кто предал себя ради спасения жизни?",
  "bykov-ch-v-v-bykov-zhizn-i-tvorcheskiy-put": "Какие фронтовые раны навсегда остались в душе Быкова и как они превратились в его прозу?",
  "bykov-v-v-bykov-zhizn-i-tvorcheskiy-put": "Почему биография Быкова — это история о том, как война формирует писателя, который не имеет права лгать?",
  "bykov-ch-voyna-v-proizvedeniyah-v-v-bykova": "Какую правду о войне открыл Быков, которую другие предпочитали не замечать?",
  "bykov-voyna-v-proizvedeniyah-v-v-bykova": "Почему война в произведениях Быкова — это не батальные сцены, а испытание совести каждого человека?",
  "bykov-ch-sotnikov": "Что делает «Сотникова» одним из самых страшных произведений о войне и почему его невозможно читать спокойно?",
  "bykov-sotnikov": "Как в повести «Сотников» два человека на войне становятся зеркалами друг друга — один выбирает смерть, другой предательство?",
  "bykov-ch-sotnikov-2": "Какие скрытые символы и детали превращают «Сотникова» в философскую притчу о выборе между жизнью и честью?",
  "bykov-sotnikov-2": "Почему каждая деталь в «Сотникове» работает как напоминание о том, что на войне нет мелочей?",
  "bykov-ch-rostovye-zadaniya-dlya-uchenika-po-povesti-vasilya-bykova-sotnikov": "Какие вопросы ставит Быков перед студентом и почему на них невозможно ответить сразу?",
  "bykov-rostovye-zadaniya-dlya-uchenika-po-povesti-vasilya-bykova-sotnikov": "Как задания по «Сотникову» помогают понять, что война проверяет не только тело, но и душу?",
  "bykov-ch-uroven-1-bazovyy": "Что должен увидеть студент на первом уровне чтения «Сотникова» и какие детали нельзя пропустить?",
  "bykov-uroven-1-bazovyy": "Какие базовые знания о «Сотникове» необходимы, чтобы понять глубину трагедии Быкова?",
  "bykov-ch-uroven-2-analiticheskiy": "Как анализировать «Сотникова» так, чтобы увидеть за сюжетом философский спор о природе человека?",
  "bykov-uroven-2-analiticheskiy": "Какие литературные приёмы использует Быков, чтобы заставить читателя сомневаться вместе с героями?",
  "bykov-ch-uroven-3-tvorcheskiy-i-issledovatelskiy": "Как творческий подход к «Сотникову» помогает студенту найти свой ответ на вечный вопрос о предательстве?",
  "bykov-uroven-3-tvorcheskiy-i-issledovatelskiy": "Почему исследовательский взгляд на «Сотникова» открывает новые смыслы с каждым прочтением?",
  "bykov-ch-chelovek-na-vesah-voyny-uroki-prozy-vasilya-bykova": "Чему учит проза Быкова о цене человеческого выбора на весах войны?",
  "bykov-chelovek-na-vesah-voyny-uroki-prozy-vasilya-bykova": "Почему уроки прозы Быкова актуальны сегодня, когда мир снова сталкивается с выбором между добром и злом?",
  "bykov-interactive": "Как интерактивные приёмы помогают студенту прожить опыт героев Быкова, а не просто прочитать о них?",
  "bykov-interactive-methods": "Какие методы работы с текстом позволяют почувствовать, что значит стоять перед выбором в окопе?",
  "bykov-slide-tasks": "Как задания из слайдов помогают увидеть связь между «Сотниковым» и другими произведениями о войне?",
  "bykov-critics": "Что говорили критики о смелости Быкова показывать войну без прикрас?",
  "bykov-critics-view": "Почему читатели воспринимали Быкова как совесть литературы о войне?",
  "bykov-summary": "Какой главный вывод оставляет нам Быков после всех прочитанных страниц?",
  "bykov-final-summary": "Как итоговое обобщение помогает увидеть единство всех произведений Быкова о войне?",

  // ═══════════════════════════════════════════════════════════════
  // Е. А. ЕВТУШЕНКО
  // ═══════════════════════════════════════════════════════════════
  "evtyushenko": "Почему Евтушенко стал голосом поколения, которое не знало войны, но чувствовало её боль?",
  "evtyushenko-author-sheet": "Как ключевые слова и произведения Евтушенко создают портрет поэта, который не мог молчать о войне?",
  "ev-detstvo-sibir-i-voyna-vokrug": "Как детство в Сибири, окружённое войной, сформировало взгляд Евтушенко на мир?",
  "ev-sec-detstvo-sibir-i-voyna-vokrug-intro": "Почему война вокруг детства стала для Евтушенко уроком, который он не забыл никогда?",
  "ev-moskva-literaturnyy-institut-i-rozhdenie-golosa": "Как в стенах Литературного института родился голос поэта, который заговорил о войне от имени молодёжи?",
  "ev-sec-moskva-literaturnyy-institut-i-rozhdenie-golosa-intro": "Почему рождение голоса Евтушенко совпало с потребностью поколения говорить правду о войне?",
  "ev-shestidesyatniki-poet-na-stadione": "Как Евтушенко стал поэтом-шестидесятником, читающим стихи на стадионах, и что это значило для страны?",
  "ev-sec-shestidesyatniki-poet-na-stadione-intro": "Почему поколение шестидесятников увидело в Евтушенко своего пророка, говорящего о войне и памяти?",
  "ev-vlast-skandaly-i-granitsy-svobody": "Как власть, скандалы и границы свободы формировали судьбу Евтушенко и его отношение к войне?",
  "ev-sec-vlast-skandaly-i-granitsy-svobody-intro": "Почему Евтушенко постоянно балансировал между свободой слова и давлением власти, говоря о войне?",
  "ev-pozdnie-gody-amerika-i-vozvraschenie": "Как поздние годы в Америке и возвращение на родину изменили взгляд Евтушенко на войну?",
  "ev-sec-pozdnie-gody-amerika-i-vozvraschenie-intro": "Почему даже вдали от России Евтушенко не переставал думать о войне и её уроках?",
  "ev-sec-istochniki": "Какие источники помогают понять, как формировался взгляд Евтушенко на войну?",
  "ev-intro": "Почему война стала центральной темой Евтушенко, хотя он был слишком молод, чтобы воевать?",
  "ev-vvedenie": "Как введение в творчество Евтушенко открывает тему войны как незаживающей раны поколения?",
  "ev-pochemu-voyna-ego-glazami": "Почему война увиденная глазами Евтушенко отличается от войны, описанной фронтовиками?",
  "ev-sec-pochemu-voyna-ego-glazami-intro": "Что особенного в взгляде Евтушенко на войну и почему он так важен для понимания эпохи?",
  "ev-sec-voyna-kak-nezazhivayuschaya-rana-pokoleniya": "Как война стала незаживающей раной поколения Евтушенко и почему эта боль не уходит?",
  "ev-sec-pochemu-obvinenie-a-ne-elegiya-1": "Почему Евтушенко выбирает обвинение, а не элегию, говоря о войне?",
  "ev-sec-voyna-i-antisemitizm-2": "Как тема войны и антисемитизма становится центральной в творчестве Евтушенко?",
  "ev-sec-voennye-posledstviya-kotorye-on-opisyval-3": "Какие военные последствия описывал Евтушенко и почему они так важны для понимания войны?",
  "ev-sec-chto-mozhet-unesti-student-iz-etogo-razdela-4": "Что может унести студент из раздела о Евтушенко и как это изменит его взгляд на войну?",
  "ev-sec-istochniki-5": "Какие источники помогают глубже понять военную лирику Евтушенко?",
  "ev-opisanie-proizvedeniy-chast-pervaya-glavnye-voennye-teksty": "Какие главные военные тексты Евтушенко открывают правду о войне?",
  "ev-sec-voennaya-lirika-e-a-evtushenko-pamyat-kak-nravstvennaya-obyazannost": "Почему память о войне для Евтушенко — это нравственная обязанность каждого человека?",
  "ev-sec-babiy-yar-1": "Как стихотворение «Бабий Яр» стало криком против забвения и почему оно звучит сегодня?",
  "ev-sec-hotyat-li-russkie-voyny-2": "Почему вопрос «Хотят ли русские войны» стал гимном мира и как он связан с памятью о войне?",
  "ev-sec-shtrafniki-3": "Как стихотворение «Штрафники» раскрывает трагедию тех, кто воевал, будучи обвинённым?",
  "ev-sec-frontovik-4": "Почему образ фронтовика в стихах Евтушенко так важен для понимания послевоенного поколения?",
  "ev-sec-istochniki-5-2": "Какие источники помогают понять контекст создания военных стихов Евтушенко?",
  "ev-opisanie-proizvedeniy-chast-vtoraya-pamyat-i-utrata": "Как тема памяти и утраты раскрывается во второй части описания произведений Евтушенко?",
  "ev-sec-opisanie-proizvedeniy-chast-vtoraya-pamyat-i-utrata-intro": "Почему память и утрата становятся центральными темами в военной лирике Евтушенко?",
  "ev-sec-malchiki": "Как стихотворение «Мальчики» передаёт трагедию детей, повзрослевших на войне?",
  "ev-sec-vdova-1": "Почему образ вдовы в стихах Евтушенко становится символом всех потерь войны?",
  "ev-sec-partizanskie-mogily-2": "Как стихотворение «Партизанские могилы» говорит о безымянных героях войны?",
  "ev-sec-svadby-3": "Почему стихотворение «Свадьбы» звучит так трагично на фоне войны?",
  "ev-sec-tretiy-sneg-4": "Как образ третьего снега в стихах Евтушенко связан с памятью о войне?",
  "ev-sec-istochniki-5-3": "Какие источники раскрывают контекст создания стихов о памяти и утрате?",
  "ev-opisanie-proizvedeniy-chast-tretya-filosofskaya-lirika": "Как философская лирика Евтушенко раскрывает вечные вопросы о войне и жизни?",
  "ev-sec-opisanie-proizvedeniy-chast-tretya-filosofskaya-lirika-intro": "Почему философская лирика Евтушенко помогает понять глубину его взгляда на войну?",
  "ev-sec-idut-belye-snegi": "Как стихотворение «Идут белые снеги» связано с темой памяти и очищения?",
  "ev-sec-lyudey-neinteresnyh-v-mire-net-1": "Почему стихотворение «Людей неинтересных в мире нет» важно для понимания гуманности Евтушенко?",
  "ev-sec-so-mnoyu-vot-chto-proishodit-2": "Как стихотворение «Со мною вот что происходит» раскрывает внутренний мир поэта?",
  "ev-sec-grazhdane-poslushayte-menya-3": "Почему обращение «Граждане, послушайте меня» звучит как призыв к совести?",
  "ev-obschiy-vyvod-ko-vsem-trem-chastyam-opisaniya-proizvedeniy": "Какой общий вывод можно сделать из всех трёх частей описания произведений Евтушенко?",
  "ev-sec-obschiy-vyvod-ko-vsem-trem-chastyam-opisaniya-proizvedeniy-intro": "Как общий вывод объединяет все темы военной лирики Евтушенко?",
  "ev-sec-istochniki-2": "Какие источники помогают понять философскую лирику Евтушенко?",
  "ev-chelovek-epohi-dva-vzglyada": "Как два взгляда на человека эпохи помогают понять сложность времени Евтушенко?",
  "ev-sec-chelovek-epohi-dva-vzglyada-intro": "Почему два взгляда на человека эпохи необходимы для понимания Евтушенко?",
  "ev-sec-vzglyad-iznutri-epohi": "Как взгляд изнутри эпохи раскрывает правду о времени Евтушенко?",
  "ev-sec-vzglyad-avtora-1": "Почему взгляд автора на свою эпоху так важен для понимания его поэзии?",
  "ev-sec-voennye-posledstviya-kak-glavnaya-tema-2": "Как военные последствия становятся главной темой размышлений Евтушенко?",
  "ev-sec-chto-izmenilos-so-vremenem-3": "Что изменилось со временем в восприятии войны и почему это важно?",
  "ev-sec-kak-prochitannoe-menyaet-mirovozzrenie-4": "Как прочитанное меняет мировоззрение студента и его отношение к войне?",
  "ev-sec-video-svidetelstva-sovremennikov-o-e-a-evtushenko-i-ego-voennyh-stihah-5": "Что рассказывают свидетельства современников о Евтушенко и его военных стихах?",
  "ev-sec-istochniki-6": "Какие источники раскрывают контекст эпохи Евтушенко?",
  "ev-kak-eto-sozdavalos": "Как создавались главные произведения Евтушенко о войне?",
  "ev-sec-kak-eto-sozdavalos-intro": "Почему история создания произведений важна для понимания их смысла?",
  "ev-sec-istoriya-sozdaniya-babego-yara": "Какова история создания «Бабьего Яра» и почему это стихотворение стало событием?",
  "ev-sec-reaktsiya-na-babiy-yar-1": "Какой была реакция на «Бабий Яр» и почему она разделила общество?",
  "ev-sec-kak-sozdavalos-hotyat-li-russkie-voyny-2": "Как создавалось стихотворение «Хотят ли русские войны» и почему оно стало гимном?",
  "ev-sec-vstrechi-s-veteranami-i-ih-vliyanie-na-voennuyu-poeziyu-3": "Как встречи с ветеранами повлияли на военную поэзию Евтушенко?",
  "ev-sec-reaktsiya-veteranov-na-voennuyu-poeziyu-4": "Какой была реакция ветеранов на военную поэзию Евтушенко?",
  "ev-sec-neozhidannyy-fakt-5": "Какой неожиданный факт о Евтушенко помогает понять его творчество?",
  "ev-sec-istochniki-6-2": "Какие источники раскрывают историю создания произведений Евтушенко?",
  "ev-problemy-proizvedeniy-chast-pervaya": "Какие проблемы произведений раскрываются в первой части?",
  "ev-sec-problemy-proizvedeniy-chast-pervaya-intro": "Почему проблемы произведений важны для понимания Евтушенко?",
  "ev-sec-zamolchannaya-pravda-o-voyne": "Как замолчанная правда о войне становится темой стихов Евтушенко?",
  "ev-sec-voyna-i-antisemitizm-1": "Почему тема войны и антисемитизма так важна для Евтушенко?",
  "ev-sec-tsena-pobedy-i-nevidimye-poteri-2": "Как цена победы и невидимые потери раскрываются в стихах Евтушенко?",
  "ev-sec-istochniki-3": "Какие источники помогают понять проблемы произведений Евтушенко?",
  "ev-problemy-proizvedeniy-chast-vtoraya": "Какие проблемы произведений раскрываются во второй части?",
  "ev-sec-problemy-proizvedeniy-chast-vtoraya-intro": "Почему вторая часть проблем произведений важна для понимания Евтушенко?",
  "ev-sec-grazhdanskaya-otvetstvennost-i-pamyat-kak-politicheskiy-akt": "Как гражданская ответственность и память становятся политическим актом у Евтушенко?",
  "ev-sec-chelovek-i-istoriya-1": "Как тема человека и истории раскрывается в творчестве Евтушенко?",
  "ev-sec-zhenschina-i-voyna-2": "Почему тема женщины и войны так важна для Евтушенко?",
  "ev-informatsiya-dlya-razdumiy": "Какая информация для раздумий помогает глубже понять Евтушенко?",
  "ev-sec-informatsiya-dlya-razdumiy-intro": "Почему информация для раздумий необходима для понимания поэзии Евтушенко?",
  "ev-sec-voprosy-dlya-pismennogo-razmyshleniya": "Какие вопросы для письменного размышления ставит Евтушенко перед студентом?",
  "ev-sec-istochniki-1": "Какие источники помогают ответить на вопросы для размышления?",
  "ev-voprosy-po-proizvedeniyam": "Какие вопросы по произведениям помогают глубже понять Евтушенко?",
  "ev-sec-voprosy-po-proizvedeniyam-intro": "Почему вопросы по произведениям важны для анализа творчества Евтушенко?",
  "ev-uroven-1-ponimanie-teksta": "Как первый уровень понимания текста открывает мир Евтушенко?",
  "ev-sec-uroven-1-ponimanie-teksta-intro": "Почему погружение в текст необходимо для понимания Евтушенко?",
  "ev-sec-zadanie-posle-urovnya-1": "Какое задание после первого уровня помогает закрепить понимание?",
  "ev-uroven-2-analiz-i-interpretatsiya": "Как второй уровень анализа и интерпретации раскрывает тайны мастерства Евтушенко?",
  "ev-sec-uroven-2-analiz-i-interpretatsiya-intro": "Почему анализ и интерпретация необходимы для понимания Евтушенко?",
  "ev-sec-zadanie-posle-urovnya-2": "Какое задание после второго уровня помогает углубить понимание?",
  "ev-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень суждения и позиции помогает сформулировать свой взгляд на Евтушенко?",
  "ev-sec-uroven-3-suzhdenie-i-pozitsiya-intro": "Почему размышления и нравственный выбор важны для понимания Евтушенко?",
  "ev-sec-zadanie-posle-urovnya-3": "Какое задание после третьего уровня помогает завершить работу с текстом?",
  "evtyushenko-critics": "Что говорили критики о творчестве Евтушенко и почему их мнения так важны?",
  "evtyushenko-critics-view": "Как воспринимали автора и произведения Евтушенко современники и потомки?",
  "ev-itogovoe-razmyshlenie": "Как итоговое размышление помогает увидеть целое в творчестве Евтушенко?",
  "ev-sec-itogovoe-razmyshlenie-intro": "Почему итоговое размышление необходимо для понимания Евтушенко?",
  "ev-pismennoe-zadanie": "Какое письменное задание помогает выразить своё отношение к творчеству Евтушенко?",
  "ev-sec-pismennoe-zadanie-intro": "Почему письменное задание важно для закрепления понимания Евтушенко?",
  "ev-sec-istochniki-2-2": "Какие источники помогают выполнить письменное задание?",
  "ev-zadaniya": "Какие задания помогают глубже изучить творчество Евтушенко?",
  "ev-sec-zadaniya-intro": "Почему задания важны для понимания творчества Евтушенко?",
  "ev-zadanie-1-pismo-v-redaktsiyu": "Как задание «Письмо в редакцию» помогает понять гражданскую позицию Евтушенко?",
  "ev-sec-zadanie-1-pismo-v-redaktsiyu-intro": "Почему письмо в редакцию — это форма диалога с эпохой Евтушенко?",
  "ev-zadanie-2-monolog-vdovy": "Как задание «Монолог вдовы» помогает почувствовать боль войны через стихи Евтушенко?",
  "ev-sec-zadanie-2-monolog-vdovy-intro": "Почему монолог вдовы — это голос всех потерявших на войне?",
  "ev-zadanie-3-reportazh-s-babego-yara": "Как задание «Репортаж с Бабьего Яра» помогает понять трагедию через стихи Евтушенко?",
  "ev-sec-zadanie-3-reportazh-s-babego-yara-intro": "Почему репортаж с Бабьего Яра — это возвращение к незаживающей ране?",
  "ev-zadanie-4-rech-na-otkrytii-pamyatnika": "Как задание «Речь на открытии памятника» помогает выразить память о войне?",
  "ev-sec-zadanie-4-rech-na-otkrytii-pamyatnika-intro": "Почему речь на открытии памятника — это долг перед погибшими?",
  "ev-obschie-rekomendatsii": "Какие общие рекомендации помогают лучше понять творчество Евтушенко?",
  "ev-sec-obschie-rekomendatsii-intro": "Почему общие рекомендации важны для работы с текстами Евтушенко?",
  "ev-zadaniya-s-proverkoy-iskusstvennogo-intellekta": "Как задания с проверкой ИИ помогают объективно оценить понимание Евтушенко?",
  "ev-sec-zadaniya-s-proverkoy-iskusstvennogo-intellekta-intro": "Почему проверка ИИ помогает увидеть сильные и слабые стороны анализа?",
  "ev-zadanie-1-retsenziya-na-voennoe-stihotvorenie": "Как задание «Рецензия на военное стихотворение» помогает анализировать поэзию Евтушенко?",
  "ev-sec-zadanie-1-retsenziya-na-voennoe-stihotvorenie-intro": "Почему рецензия — это форма диалога с поэтом о войне?",
  "ev-zadanie-2-emotsionalnyy-portret-geroya": "Как задание «Эмоциональный портрет героя» помогает понять лирику Евтушенко?",
  "ev-sec-zadanie-2-emotsionalnyy-portret-geroya-intro": "Почему эмоциональный портрет раскрывает глубину переживаний героя?",
  "ev-zadanie-3-otzyv-ot-litsa-veterana": "Как задание «Отзыв от лица ветерана» помогает почувствовать правду войны через стихи Евтушенко?",
  "ev-sec-zadanie-3-otzyv-ot-litsa-veterana-intro": "Почему отзыв ветерана — это голос тех, кто прошёл через войну?",
  "ev-zadanie-4-sravnitelnyy-otzyv": "Как задание «Сравнительный отзыв» помогает увидеть связь между произведениями Евтушенко?",
  "ev-sec-zadanie-4-sravnitelnyy-otzyv-intro": "Почему сравнительный анализ раскрывает единство творчества Евтушенко?",
  "ev-kak-budet-otsenivatsya-rabota": "Как будет оцениваться работа и какие критерии важны для понимания Евтушенко?",
  "ev-sec-kak-budet-otsenivatsya-rabota-intro": "Почему понимание критериев оценки помогает лучше выполнить задание?",
  "ev-sravnitelnaya-tablitsa-i-zadanie": "Как сравнительная таблица и задание помогают систематизировать знания о Евтушенко?",
  "ev-sec-sravnitelnaya-tablitsa-i-zadanie-intro": "Почему сравнительная таблица — это инструмент глубокого анализа?",
  "ev-sec-sravnitelnaya-tablitsa": "Как сравнительная таблица помогает увидеть особенности творчества Евтушенко?",
  "ev-sec-zadanie-dlya-studenta-1": "Какое задание для студента помогает углубить понимание Евтушенко?",
  "ev-videomaterialy-razdela": "Какие видеоматериалы раздела помогают увидеть Евтушенко живым?",
  "ev-sec-videomaterialy-razdela-intro": "Почему видеоматериалы важны для понимания эпохи Евтушенко?",
  "ev-sec-video-1-e-a-evtushenko-chitaet-babiy-yar": "Как видео, где Евтушенко читает «Бабий Яр», помогает почувствовать силу стихов?",
  "ev-sec-video-2-vecher-v-politehnicheskom-muzee-poety-shestidesyatniki-1": "Как видео вечера в Политехническом музее раскрывает атмосферу эпохи шестидесятников?",
  "ev-sec-video-3-trinadtsataya-simfoniya-d-d-shostakovicha-2": "Как видео о Тринадцатой симфонии Шостаковича связано с «Бабьим Яром» Евтушенко?",
  "ev-sec-video-4-dokumentalnyy-film-ili-intervyu-o-e-a-evtushenko-3": "Как документальный фильм или интервью о Евтушенко раскрывает его личность?",
  "ev-sec-video-5-babiy-yar-segodnya-4": "Как видео о Бабьем Яре сегодня помогает понять актуальность стихов Евтушенко?",
  "ev-istochniki-i-literatura": "Какие источники и литература помогают глубже изучить творчество Евтушенко?",
  "ev-sec-istochniki-i-literatura-intro": "Почему источники и литература необходимы для серьёзного изучения Евтушенко?",
  "ev-sec-1-pervichnye-istochniki": "Какие первичные источники помогают понять эпоху Евтушенко?",
  "ev-sec-2-biograficheskie-istochniki-1": "Какие биографические источники раскрывают жизнь Евтушенко?",
  "ev-sec-3-nauchnye-i-kriticheskie-raboty-2": "Какие научные и критические работы помогают анализировать творчество Евтушенко?",
  "ev-sec-4-materialy-o-babem-yare-3": "Какие материалы о «Бабьем Яре» помогают понять контекст стихотворения?",
  "ev-sec-5-o-trinadtsatoy-simfonii-d-d-shostakovicha-4": "Какие материалы о Тринадцатой симфонии Шостаковича связаны с «Бабьим Яром»?",
  "ev-sec-6-onlayn-resursy-5": "Какие онлайн-ресурсы помогают изучить творчество Евтушенко?",
  "ev-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-pervaya": "Какие страницы биографии, которых нет в учебниках, раскрывают Евтушенко с новой стороны?",
  "ev-sec-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-pervaya-intro": "Почему скрытые страницы биографии важны для понимания Евтушенко?",
  "ev-sec-kiev-den-kogda-poyavilsya-babiy-yar": "Как Киев и день появления «Бабьего Яра» связаны с рождением стихотворения?",
  "ev-sec-pervoe-chtenie-babego-yara-1": "Каким было первое чтение «Бабьего Яра» и почему оно стало событием?",
  "ev-sec-kogda-n-s-hruschev-kritikoval-e-a-evtushenko-lichno-2": "Когда Хрущёв критиковал Евтушенко лично и как это повлияло на поэта?",
  "ev-sec-druzhba-s-d-d-shostakovichem-i-rozhdenie-trinadtsatoy-simfonii-3": "Как дружба с Шостаковичем привела к рождению Тринадцатой симфонии?",
  "ev-sec-istochniki-4": "Какие источники раскрывают скрытые страницы биографии Евтушенко?",
  "ev-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-vtoraya": "Какие ещё страницы биографии, которых нет в учебниках, помогают понять Евтушенко?",
  "ev-sec-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-vtoraya-intro": "Почему вторая часть скрытых страниц биографии важна для понимания Евтушенко?",
  "ev-sec-pismo-l-i-brezhnevu-o-chehoslovakii": "Как письмо Брежневу о Чехословакии раскрывает гражданскую позицию Евтушенко?",
  "ev-sec-a-a-voznesenskiy-i-pokolenie-shestidesyatnikov-1": "Как Вознесенский и поколение шестидесятников связаны с Евтушенко?",
  "ev-sec-fotografiya-kak-vtoraya-professiya-2": "Как фотография как вторая профессия раскрывает взгляд Евтушенко на мир?",
  "ev-sec-poslednie-razmyshleniya-o-voyne-3": "Какие последние размышления о войне оставил Евтушенко?",
  "ev-sec-maloizvestnyy-fakt-pisma-ot-neznakomyh-frontovikov-4": "Какой малоизвестный факт о письмах от незнакомых фронтовиков раскрывает душу Евтушенко?",
  "ev-sec-zadanie-dlya-studenta-5": "Какое задание для студента помогает углубить понимание скрытых страниц биографии?",
  "ev-sec-istochniki-6-3": "Какие источники раскрывают вторую часть скрытых страниц биографии?",
  "evtyushenko-interactive": "Как интерактивные приёмы помогают глубже изучить творчество Евтушенко?",
  "evtyushenko-interactive-methods": "Какие интерактивные методы помогают почувствовать эпоху Евтушенко?",
  "evtyushenko-slide-tasks": "Какие задания из слайдов помогают систематизировать знания о Евтушенко?",
  "evtyushenko-summary": "Как обобщение по автору помогает увидеть целое в творчестве Евтушенко?",
  "evtyushenko-final-summary": "Как итоговое обобщение завершает изучение творчества Евтушенко?",

  // ═══════════════════════════════════════════════════════════════
  // В. Л. КОНДРАТЬЕВ
  // ═══════════════════════════════════════════════════════════════
  "kondratyev": "Почему Кондратьев писал о войне так, будто сам стоял в том окопе под Ржевом?",
  "kondratyev-author-sheet": "Как лист автора раскрывает правду войны через призму личного опыта Кондратьева?",
  "kondratyev-intro": "Как объявление произведений Кондратьева настраивает на серьёзный разговор о войне?",
  "kondratyev-obyavlenie-proizvedeniy": "Почему объявление произведений Кондратьева — это приглашение к честному разговору о войне?",
  "kondratyev-ch-detstvo-voyna-vokrug": "Как детство, окружённое войной, сформировало взгляд Кондратьева на мир?",
  "kondratyev-detstvo-voyna-vokrug": "Почему война вокруг детства стала для Кондратьева уроком, который он не забыл никогда?",
  "kondratyev-ch-front-i-rozhdenie-pisatelya": "Как фронт и рождение писателя связаны в судьбе Кондратьева?",
  "kondratyev-front-i-rozhdenie-pisatelya": "Почему фронт стал школой, которая научила Кондратьева писать правду о войне?",
  "kondratyev-ch-pravda-voyny": "Какую правду войны и цену памяти открыл Кондратьев в своих произведениях?",
  "kondratyev-pravda-voyny": "Почему правда войны и цена памяти — это центральная тема творчества Кондратьева?",
  "kondratyev-ch-biography-facts": "Какие страницы биографии, которых нет в учебниках, раскрывают Кондратьева с новой стороны?",
  "kondratyev-biography-facts": "Почему скрытые факты биографии важны для понимания творчества Кондратьева?",
  "kondratyev-ch-rzhev": "Как Ржев стал местом, где родилась проза Кондратьева, и почему это так важно?",
  "kondratyev-rzhev": "Почему Ржев — это не просто город, а символ всей трагедии войны в прозе Кондратьева?",
  "kondratyev-ch-history-sashka": "Как создавалась повесть «Сашка» и почему она стала одним из главных произведений о войне?",
  "kondratyev-history-sashka": "Почему история создания повести «Сашка» помогает понять её глубину и правдивость?",
  "kondratyev-ch-sashka-introduction": "Как первое знакомство с повестью «Сашка» настраивает на серьёзный разговор о войне?",
  "kondratyev-sashka-introduction": "Почему первое знакомство с «Сашкой» — это начало пути к пониманию правды о войне?",
  "kondratyev-ch-sashka-composition": "Как композиция и сюжет повести «Сашка» помогают раскрыть её главную идею?",
  "kondratyev-sashka-composition": "Почему композиция и сюжет «Сашки» работают как единый механизм воздействия на читателя?",
  "kondratyev-interactive": "Как интерактивные приёмы помогают глубже понять произведения Кондратьева?",
  "kondratyev-interactive-methods": "Какие интерактивные методы помогают почувствовать эпоху Кондратьева?",
  "kondratyev-slide-tasks": "Какие задания из слайдов помогают систематизировать знания о Кондратьеве?",
  "kondratyev-critics": "Что говорили критики о творчестве Кондратьева и почему их мнения так важны?",
  "kondratyev-critics-view": "Как воспринимали автора и произведения Кондратьева современники и потомки?",
  "kondratyev-summary": "Как обобщение по автору помогает увидеть целое в творчестве Кондратьева?",
  "kondratyev-final-summary": "Как итоговое обобщение завершает изучение творчества Кондратьева?",

    // ═══════════════════════════════════════════════════════════════
  // Б. Ш. ОКУДЖАВА
  // ═══════════════════════════════════════════════════════════════
  "okudzhava": "Зачем Окуджава выбрал тихую интонацию, когда вся страна говорила о войне громко и торжественно?",
  "okudzhava-photo-qr-ai": "Как негромкий голос Окуджавы стал одним из самых узнаваемых в русской поэзии XX века?",
  "ok-intro": "Зачем знакомство с Окуджавой начинается не с дат, а с ощущения его интонации?",
  "ok-o-voyne-mozhno-govorit-tiho": "Почему о войне можно говорить тихо - и отчего такой шёпот оказывается сильнее любого марша?",
  "ok-pamyat-chelovek-intonatsiya": "Как память, человек и интонация сплетаются в единый узел в песнях Окуджавы?",
  "ok-bio": "Зачем биография Окуджавы важна для понимания его военной лирики?",
  "ok-detstvo-i-semya": "Как детство и семья Окуджавы стали фундаментом его взгляда на войну и человека?",
  "ok-frontovoy-opyt": "Зачем Окуджаве понадобился собственный фронтовой опыт, чтобы заговорить о войне своим голосом?",
  "ok-posle-voyny-i-avtorskaya-pesnya": "Как послевоенная судьба Окуджавы превратила его в родоначальника авторской песни?",
  "ok-extra": "Какие дополнительные материалы помогают глубже услышать Окуджаву?",
  "ok-stranitsy-biografii-kotoryh-net-v-uchebnikah": "Зачем нужны страницы биографии, которых нет в учебниках, чтобы понять Окуджаву?",
  "ok-detstvo-na-arbate": "Как арбатское детство Окуджавы отразилось в его поэтическом мире?",
  "ok-kak-on-uznal-ob-areste-ottsa": "Зачем Окуджава всю жизнь носил в себе весть об аресте отца - и как это отозвалось в его песнях?",
  "ok-shkolnyy-attestat-i-front": "Как школьный аттестат и фронт столкнулись в судьбе семнадцатилетнего Окуджавы?",
  "ok-pervaya-pesnya": "Зачем Окуджава написал свою первую песню - и почему она прозвучала именно так?",
  "ok-otnosheniya-s-vysotskim": "Как складывались отношения Окуджавы и Высоцкого - двух голосов, которые звучали так похоже и так по-разному?",
  "ok-poslednie-gody-i-raspad-sssr": "Зачем Окуджава в последние годы говорил о войне иначе, чем в молодости?",
  "ok-maloizvestnyy-fakt": "Какой малоизвестный факт о Окуджаве меняет представление о нём?",
  "ok-zadanie-dlya-studenta": "Зачем студенту нужно выполнить именно это задание по Окуджаве?",
  "ok-context": "Как контекст эпохи помогает понять, почему песни Окуджавы стали событием?",
  "ok-kak-pisalas-do-svidaniya-malchiki": "Зачем Окуджава написал «До свидания, мальчики» - и почему эта песня до сих пор звучит как прощание?",
  "ok-istoriya-nam-nuzhna-odna-pobeda": "Как создавалась песня «Нам нужна одна победа» - и что в ней оказалось важнее победы?",
  "ok-bumazhnyy-soldatik-i-spory-vokrug-nego": "Зачем Окуджава написал «Бумажный солдатик» - и почему вокруг этой притчи до сих пор идут споры?",
  "ok-magnitofonnaya-kultura": "Как магнитофонная культура СССР сделала Окуджаву голосом целого поколения?",
  "ok-reaktsiya-frontovikov": "Зачем фронтовики слушали Окуджаву - и что они слышали в его песнях своего?",
  "ok-neozhidannaya-detal": "Какая неожиданная деталь в биографии Окуджавы раскрывает его поэтику?",
  "ok-works": "Зачем Окуджава писал именно о войне - и почему его военная лирика так отличается от других?",
  "ok-obschaya-harakteristika-voennoy-liriki": "Как общая характеристика военной лирики Окуджавы помогает увидеть её уникальность?",
  "ok-do-svidaniya-malchiki": "Почему песня «До свидания, мальчики» стала реквиемом целому поколению?",
  "ok-nam-nuzhna-odna-pobeda": "Зачем Окуджава говорит о победе, которая нужна «одна» - и что это за победа?",
  "ok-bumazhnyy-soldatik": "Как «Бумажный солдатик» превратился в притчу о хрупкости человека на войне?",
  "ok-ya-vnov-potrechalsya-s-nadezhdoy": "Зачем Окуджава вновь и вновь встречается с Надеждой - и что это за встреча?",
  "ok-obschiy-vyvod": "Какой общий вывод можно сделать после знакомства с военной лирикой Окуджавы?",
  "ok-problems": "Зачем Окуджава поднимает именно эти проблемы - и почему они остаются острыми сегодня?",
  "ok-voyna-i-hrupkost-cheloveka": "Как война и хрупкость человека становятся центральной темой песен Окуджавы?",
  "ok-pamyat-kak-forma-vernosti": "Зачем Окуджава делает память формой верности - и кому он остаётся верен?",
  "ok-tihiy-golos-protiv-gromkoy-epohi": "Как тихий голос Окуджавы противостоит громкой эпохе - и побеждает ли он?",
  "ok-lichnoe-i-istoricheskoe": "Зачем Окуджава соединяет личное и историческое - и что рождается из этого соединения?",
  "ok-nadezhda-kak-vybor": "Как Надежда у Окуджавы становится не чувством, а нравственным выбором?",
  "ok-pismennoe-zadanie-dlya-studenta": "Зачем студенту нужно написать именно это письменное задание по Окуджаве?",
  "ok-reflection": "Какая информация для раздумий помогает глубже услышать Окуджаву?",
  "ok-mozhno-li-govorit-o-tragedii-krasivo": "Зачем Окуджава задаётся вопросом - можно ли говорить о трагедии красиво?",
  "ok-mozhet-li-pesnya-zamenit-zhivuyu-pamyat": "Может ли песня заменить живую память - и что отвечает на этот вопрос сам Окуджава?",
  "ok-chto-znachit-byt-neofitsialnym-poetom": "Зачем Окуджаве понадобилось быть неофициальным поэтом - и какую цену он за это платил?",
  "ok-voprosy-dlya-pismennogo-razmyshleniya": "Какие вопросы для письменного размышления ставит Окуджава перед студентом?",
  "ok-questions": "Зачем нужны вопросы по произведениям Окуджавы - и как они помогают войти в его мир?",
  "ok-uroven-1-ponimanie-teksta": "Как первый уровень понимания текста открывает мир Окуджавы?",
  "ok-uroven-2-analiz-i-interpretatsiya": "Зачем нужен второй уровень анализа - и какие тайны мастерства Окуджавы он раскрывает?",
  "ok-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о Окуджаве?",
  "okudzhava-interactive": "Зачем нужны интерактивные приёмы при изучении Окуджавы?",
  "okudzhava-interactive-methods": "Какие интерактивные методы помогают почувствовать эпоху Окуджавы?",
  "okudzhava-slide-tasks": "Как задания из слайдов помогают систематизировать знания об Окуджаве?",
  "okudzhava-critics": "Что говорили критики о творчестве Окуджавы - и почему их мнения так важны?",
  "okudzhava-critics-view": "Зачем нужно знать, как воспринимали Окуджаву современники и потомки?",
  "ok-chto-ostaetsya": "Что остаётся от Окуджавы - и почему его песни звучат и сегодня?",
  "ok-mesto-b-sh-okudzhavy-v-literature-o-voyne": "Какое место занимает Окуджава в литературе о войне - и чем оно уникально?",
  "ok-itogovye-tezisy": "Зачем нужны итоговые тезисы - и как они помогают увидеть целое в творчестве Окуджавы?",
  "ok-finalnoe-pismennoe-zadanie": "Как финальное письменное задание завершает работу с творчеством Окуджавы?",
  "okudzhava-summary": "Как обобщение по Окуджаве помогает увидеть единство его поэтического мира?",
  "okudzhava-final-summary": "Зачем нужно итоговое обобщение - и какой голос уносит с собой читатель после Окуджавы?",

  // ═══════════════════════════════════════════════════════════════
  // А. Н. РЫБАКОВ
  // ═══════════════════════════════════════════════════════════════
  "rybakov": "Зачем Рыбаков писал о войне через судьбы обычных людей - и что это меняет в нашем понимании эпохи?",
  "rybakov-author-sheet": "Как лист автора раскрывает противоречия советского патриотизма в творчестве Рыбакова?",
  "rybakov-ch-biografiya-a-n-rybakova": "Зачем нужна биография Рыбакова - и как она помогает понять его прозу?",
  "rybakov-biografiya-a-n-rybakova": "Как биография Рыбакова сплетается с историей XX века?",
  "rybakov-ch-voyna-v-proizvedeniyah-a-n-rybakova": "Какую правду о войне открывает Рыбаков - и почему её так важно услышать?",
  "rybakov-voyna-v-proizvedeniyah-a-n-rybakova": "Зачем Рыбаков показывает войну именно так - без прикрас и без ложного пафоса?",
  "rybakov-ch-deti-arbata": "Почему «Дети Арбата» стали одним из самых обсуждаемых романов о войне и предвоенной эпохе?",
  "rybakov-deti-arbata": "Зачем Рыбаков написал «Дети Арбата» - и что в этом романе оказалось важнее сюжета?",
  "rybakov-ch-uroven-1-bazovyy-znanie-i-vosproizvedenie-teksta": "Как первый уровень работы с текстом помогает войти в мир Рыбакова?",
  "rybakov-uroven-1-bazovyy-znanie-i-vosproizvedenie-teksta": "Зачем нужно знание и воспроизведение текста - и что оно даёт студенту?",
  "rybakov-ch-uroven-2-sredniy-analiz-i-interpretatsiya": "Какие тайны мастерства Рыбакова раскрывает второй уровень анализа?",
  "rybakov-uroven-2-sredniy-analiz-i-interpretatsiya": "Зачем нужен анализ и интерпретация - и что они меняют в прочтении Рыбакова?",
  "rybakov-ch-uroven-3-prodvinutyy-sintez-otsenka-i-aktualizatsiya": "Как третий уровень помогает синтезировать, оценить и актуализировать творчество Рыбакова?",
  "rybakov-uroven-3-prodvinutyy-sintez-otsenka-i-aktualizatsiya": "Зачем нужна актуализация Рыбакова - и как его проза звучит сегодня?",
  "rybakov-interactive": "Какие интерактивные приёмы помогают глубже изучить Рыбакова?",
  "rybakov-interactive-methods": "Зачем нужны интерактивные методы при работе с прозой Рыбакова?",
  "rybakov-slide-tasks": "Как задания из слайдов помогают систематизировать знания о Рыбакове?",
  "rybakov-critics": "Что говорили критики о творчестве Рыбакова - и почему их оценки так важны?",
  "rybakov-critics-view": "Зачем нужно знать, как воспринимали Рыбакова современники и потомки?",
  "rybakov-summary": "Как обобщение по Рыбакову помогает увидеть единство его прозы?",
  "rybakov-final-summary": "Зачем нужно итоговое обобщение - и какой урок оставляет Рыбаков?",

  // ═══════════════════════════════════════════════════════════════
  // А. Т. ТВАРДОВСКИЙ
  // ═══════════════════════════════════════════════════════════════
  "tvardovsky": "Зачем Твардовский писал о войне голосом простого солдата - и почему этот голос оказался вечным?",
  "tvardovsky-photo-qr-ai": "Как долг памяти и нравственная ответственность перед погибшими становятся центром поэзии Твардовского?",
  "znakomstvo-s-avtorom": "Зачем знакомство с Твардовским начинается с его фронтового пути?",
  "biografiya-a-t-tvardokogo": "Как биография Твардовского помогает понять его поэтический мир?",
  "perehod-ot-biografii-k-proizvedeniyu": "Зачем нужен переход от биографии к произведению - и что он раскрывает?",
  "stranitsy-biografii-kotoryh-net-v-uchebnikah": "Какие страницы биографии Твардовского скрыты от учебников - и почему их важно узнать?",
  "poema-vasiliy-terkin-1941-1945": "Почему «Василий Тёркин» стал не просто поэмой, а живой частью фронтовой жизни?",
  "vasiliy-terkin-bez-finala": "Зачем Твардовский не писал финал поэмы заранее - и что это меняет в её восприятии?",
  "reaktsiya-soldat": "Как солдаты реагировали на «Тёркина» - и почему они воспринимали его как своего?",
  "zamysel-i-istoriya-sozdaniya": "Зачем Твардовский создал именно такого героя - и откуда взялся замысел «Тёркина»?",
  "zhanr-i-struktura": "Как жанр и структура поэмы помогают передать живую фронтовую правду?",
  "obraz-vasiliya-terkina": "Зачем Твардовский сделал Тёркина обычным - и в чём сила этой обычности?",
  "pereprava-cherez-reku": "Почему глава «Переправа» стала одним из самых трагических эпизодов поэмы?",
  "interesnoe-iz-proizvedeniya": "Зачем нужно знать интересное из произведения - и что оно раскрывает о «Тёркине»?",
  "nratvennyy-vybor-na-voyne": "Как нравственный выбор на войне становится главным вопросом поэмы Твардовского?",
  "informatsiya-dlya-razdumiy": "Зачем Твардовский оставляет пространство для раздумий - и какие вопросы он задаёт читателю?",
  "uroven-1-ponimanie-teksta": "Как первый уровень погружения в текст помогает услышать голос Тёркина?",
  "uroven-2-analiz-i-interpretatsiya": "Зачем нужен анализ художественного мира Твардовского - и какие тайны мастерства он раскрывает?",
  "uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о Твардовском?",
  "tvardovsky-trainer-1": "Зачем нужна литературная мастерская по «Василию Тёркину»?",
  "tvardovsky-trainer-3": "Почему глава «Переправа» требует отдельного разговора - и что она говорит о цене войны?",
  "tvardovsky-trainer-4": "Зачем Твардовский написал главу «Гармонь» - и какую роль играет музыка в фронтовом братстве?",
  "tvardovsky-trainer-5": "Как поединок со Смертью становится утверждением жизни в поэме Твардовского?",
  "stihotvorenie-ya-ubit-podo-rzhevom-1946": "Почему стихотворение «Я убит подо Ржевом» стало реквиемом безымянному солдату?",
  "tvardovsky-final": "Зачем нужно обобщение по творчеству Твардовского - и что оно меняет в понимании поэта?",
  "tvardovsky-interactive-methods": "Какие интерактивные приёмы помогают работать с произведениями Твардовского?",
  "tvardovsky-critics": "Что говорили критики о творчестве Твардовского - и почему их мнения так важны?",
  "tvardovsky-critics-view": "Зачем нужно знать, как воспринимали Твардовского современники и потомки?",

  // ═══════════════════════════════════════════════════════════════
  // Б. Л. ВАСИЛЬЕВ
  // ═══════════════════════════════════════════════════════════════
  "vasilyev": "Зачем Васильев писал о войне через женские судьбы - и что это меняет в нашем понимании войны?",
  "vasilyev-author-sheet": "Как лист автора раскрывает тему памяти сердца как преодоления забвения и смерти?",
  "vasilyev-ch-biografiya-b-l-vasileva": "Зачем нужна биография Васильева - и как она помогает понять его прозу?",
  "vasilyev-biografiya-b-l-vasileva": "Как биография Васильева сплетается с его литературным миром?",
  "vasilyev-ch-voyna-v-proizvedeniyah-b-l-vasileva": "Какую правду о войне открывает Васильев - и почему её так важно услышать?",
  "vasilyev-voyna-v-proizvedeniyah-b-l-vasileva": "Зачем Васильев показывает войну именно так - через хрупкость и достоинство?",
  "vasilyev-ch-povest-borisa-vasileva-a-zori-zdes-tihie-opublikovannaya-v-1969-godu-sta": "Почему повесть «А зори здесь тихие...» стала одним из самых пронзительных произведений о войне?",
  "vasilyev-povest-borisa-vasileva-a-zori-zdes-tihie-opublikovannaya-v-1969-godu-sta": "Зачем Васильев написал историю пяти девушек-зенитчиц - и что в ней оказалось важнее подвига?",
  "vasilyev-ch-povest-borisa-vasileva-a-zori-zdes-tihie-predstavlyaet-soboy-unikalnoe-y": "Как сюжет и композиция повести помогают передать её трагизм?",
  "vasilyev-povest-borisa-vasileva-a-zori-zdes-tihie-predstavlyaet-soboy-unikalnoe-y": "Зачем Васильев построил повесть именно так - и что это меняет в восприятии?",
  "vasilyev-ch-povest-borisa-vasileva-a-zori-zdes-tihie-poyavivshis-na-ishode-ottepelno": "Какое значение и какие экранизации получила повесть Васильева?",
  "vasilyev-povest-borisa-vasileva-a-zori-zdes-tihie-poyavivshis-na-ishode-ottepelno": "Зачем повесть «А зори здесь тихие...» экранизировалась несколько раз - и что менялось в каждом прочтении?",
  "vasilyev-ch-v-spiskah-ne-znachilsya": "Почему повесть «В списках не значился» стала гимном безымянному героизму?",
  "vasilyev-v-spiskah-ne-znachilsya": "Зачем Васильев написал историю Николая Плужникова - и что она говорит о стойкости человека?",
  "vasilyev-ch-zavtra-byla-voyna": "Как повесть «Завтра была война» показывает, как война входит в мир подростков?",
  "vasilyev-zavtra-byla-voyna": "Зачем Васильев написал о школьниках, перед которыми suddenly оказалась война?",
  "vasilyev-ch-v-okopah-stalingrada": "Почему повесть «В окопах Сталинграда» стала одним из первых честных голосов о войне?",
  "vasilyev-v-okopah-stalingrada": "Зачем Васильев обратился к теме Сталинграда - и что он увидел в окопах иначе, чем другие?",
  "vasilyev-ch-uroven-1-bazovyy-znanie-i-ponimanie-teksta": "Как первый уровень работы с текстом помогает войти в мир Васильева?",
  "vasilyev-uroven-1-bazovyy-znanie-i-ponimanie-teksta": "Зачем нужно знание и понимание текста - и что оно даёт студенту?",
  "vasilyev-ch-uroven-2-sredniy-analiz-i-interpretatsiya": "Какие тайны мастерства Васильева раскрывает второй уровень анализа?",
  "vasilyev-uroven-2-sredniy-analiz-i-interpretatsiya": "Зачем нужен анализ и интерпретация - и что они меняют в прочтении Васильева?",
  "vasilyev-ch-uroven-3-prodvinutyy-sintez-otsenka-i-kontekst": "Как третий уровень помогает синтезировать, оценить и contextualize творчество Васильева?",
  "vasilyev-uroven-3-prodvinutyy-sintez-otsenka-i-kontekst": "Зачем нужна актуализация Васильева - и как его проза звучит сегодня?",
  "vasilyev-ch-literaturovedcheskie-issledovaniya": "Какие литературоведческие исследования помогают глубже понять Васильева?",
  "vasilyev-literaturovedcheskie-issledovaniya": "Зачем нужны литературоведческие исследования - и что они раскрывают о Васильеве?",
  "vasilyev-interactive": "Какие интерактивные приёмы помогают глубже изучить Васильева?",
  "vasilyev-interactive-methods": "Зачем нужны интерактивные методы при работе с прозой Васильева?",
  "vasilyev-slide-tasks": "Как задания из слайдов помогают систематизировать знания о Васильеве?",
  "vasilyev-critics": "Что говорили критики о творчестве Васильева - и почему их мнения так важны?",
  "vasilyev-critics-view": "Зачем нужно знать, как воспринимали Васильева современники и потомки?",
  "vasilyev-summary": "Как обобщение по Васильеву помогает увидеть единство его прозы?",
  "vasilyev-final-summary": "Зачем нужно итоговое обобщение - и какой голос уносит с собой читатель после Васильева?",

  // ═══════════════════════════════════════════════════════════════
  // В. С. ВЫСОЦКИЙ
  // ═══════════════════════════════════════════════════════════════
  "vysotsky": "Зачем Высоцкий пел о войне, хотя сам не был фронтовиком - и почему ему поверили те, кто прошёл через огонь?",
  "vysotsky-photo-qr-ai": "Как чужая боль становится своей в песнях Высоцкого - и почему это так важно?",
  "vysotsky-intro": "Зачем знакомство с Высоцким начинается с объявления произведений?",
  "vysotsky-obyavlenie-proizvedeniy": "Как объявление произведений настраивает на серьёзный разговор о Высоцком?",
  "vysotsky-ch-detstvo-voyna-vokrug": "Как детство, окружённое войной, сформировало взгляд Высоцкого на мир?",
  "vysotsky-detstvo-voyna-vokrug": "Зачем Высоцкий всю жизнь носил в себе войну, которую видел ребёнком?",
  "vysotsky-ch-teatr-i-pervye-pesni-rozhdenie-golosa": "Как театр и первые песни стали рождением голоса Высоцкого?",
  "vysotsky-teatr-i-pervye-pesni-rozhdenie-golosa": "Зачем Высоцкому понадобился театр - и что он дал его поэтическому голосу?",
  "vysotsky-ch-vlast-svoboda-i-tsena-golosa": "Как власть, свобода и цена голоса сплетаются в судьбе Высоцкого?",
  "vysotsky-vlast-svoboda-i-tsena-golosa": "Зачем Высоцкий платил такую цену за свой голос - и стоило ли оно того?",
  "vysotsky-ch-stranitsy-biografii-kotoryh-net-v-uchebnikah": "Какие страницы биографии Высоцкого скрыты от учебников - и почему их важно узнать?",
  "vysotsky-stranitsy-biografii-kotoryh-net-v-uchebnikah": "Зачем нужны скрытые страницы биографии - и что они раскрывают о Высоцком?",
  "vysotsky-vstrechi-s-veteranami": "Как встречи с ветеранами повлияли на военные песни Высоцкого?",
  "vysotsky-reaktsiya-veteranov-na-ego-voennye-pesni": "Зачем ветераны слушали Высоцкого - и что они слышали в его песнях своего?",
  "vysotsky-voennye-roli-v-kino": "Как военные роли в кино помогли Высоцкому войти в тему войны?",
  "vysotsky-pisma-ot-slushateley-i-frontovikov": "Зачем Высоцкий получал письма от слушателей и фронтовиков - и что они ему говорили?",
  "vysotsky-smert-v-s-vysotskogo-i-reaktsiya-strany": "Как страна отреагировала на смерть Высоцкого - и что эта реакция говорит о нём?",
  "vysotsky-odin-maloizvestnyy-fakt": "Какой малоизвестный факт о Высоцком меняет представление о нём?",
  "vysotsky-zadanie-dlya-studenta": "Зачем студенту нужно выполнить именно это задание по Высоцкому?",
  "vysotsky-ch-pochemu-voyna-ego-glazami": "Почему война, увиденная глазами Высоцкого, так отличается от других голосов?",
  "vysotsky-pochemu-voyna-ego-glazami": "Зачем Высоцкий смотрел на войну так - и что он увидел иначе?",
  "vysotsky-ch-opisanie-proizvedeniy": "Как описание произведений помогает войти в военную лирику Высоцкого?",
  "vysotsky-opisanie-proizvedeniy": "Зачем нужно описание произведений - и что оно раскрывает о Высоцком?",
  "vysotsky-on-ne-vernulsya-iz-boya": "Почему песня «Он не вернулся из боя» стала одной из самых пронзительных у Высоцкого?",
  "vysotsky-my-vraschaem-zemlyu": "Зачем Высоцкий написал «Мы вращаем Землю» - и что в ней оказалось важнее подвига?",
  "vysotsky-shtrafnye-batalony": "Как песня «Штрафные батальоны» стала голосом тех, кого замалчивали?",
  "vysotsky-bratskie-mogily": "Зачем Высоцкий пел о братских могилах - и почему эти песни так важны для памяти?",
  "vysotsky-pesnya-o-zemle": "Как «Песня о земле» становится гимном той земле, за которую воевали?",
  "vysotsky-vysota": "Зачем Высоцкий написал «Высоту» - и что в ней оказалось важнее высоты?",
  "vysotsky-obschiy-vyvod": "Какой общий вывод можно сделать после знакомства с военной лирикой Высоцкого?",
  "vysotsky-ch-chelovek-epohi-dva-vzglyada": "Как два взгляда на человека эпохи помогают понять Высоцкого?",
  "vysotsky-chelovek-epohi-dva-vzglyada": "Зачем нужны два взгляда - и что они раскрывают о Высоцком?",
  "vysotsky-vzglyad-iznutri-epohi": "Как взгляд изнутри эпохи помогает понять Высоцкого?",
  "vysotsky-vzglyad-avtora": "Зачем нужен взгляд автора - и что он меняет в понимании Высоцкого?",
  "vysotsky-chto-izmenilos-so-vremenem": "Что изменилось со временем в восприятии Высоцкого - и почему его голос звучит всё громче?",
  "vysotsky-kak-prochitannoe-menyaet-mirovozzrenie": "Зачем прочитанное меняет мировоззрение - и как Высоцкий влияет на студента?",
  "vysotsky-ch-kak-eto-sozdavalos": "Как создавались военные песни Высоцкого - и что в этом процессе оказалось самым важным?",
  "vysotsky-kak-eto-sozdavalos": "Зачем нужно знать историю создания - и что она раскрывает о Высоцком?",
  "vysotsky-istoriya-on-ne-vernulsya-iz-boya": "Какова история песни «Он не вернулся из боя» - и почему она так важна?",
  "vysotsky-shtrafnye-batalony-i-reaktsiya-veteranov": "Зачем ветераны откликнулись на «Штрафные батальоны» - и что они услышали в этой песне?",
  "vysotsky-kak-v-s-vysotskiy-gotovilsya-k-voennym-pesnyam": "Как Высоцкий готовился к военным песням - и почему его подготовка была такой серьёзной?",
  "vysotsky-pervoe-ispolnenie-bratskih-mogil": "Зачем нужно знать о первом исполнении «Братских могил» - и что оно говорит о Высоцком?",
  "vysotsky-magnitofonnye-zapisi-voennyh-pesen": "Как магнитофонные записи военных песен сделали Высоцкого голосом поколения?",
  "vysotsky-reaktsiya-ofitsialnoy-kritiki": "Зачем официальная критика реагировала на Высоцкого - и почему её реакция была такой противоречивой?",
  "vysotsky-odin-neozhidannyy-fakt": "Какой неожиданный факт о Высоцком меняет представление о нём?",
  "vysotsky-ch-problemy-proizvedeniy": "Какие проблемы произведений Высоцкого помогают глубже понять его?",
  "vysotsky-problemy-proizvedeniy": "Зачем нужно говорить о проблемах произведений - и что они раскрывают о Высоцком?",
  "vysotsky-chelovek-i-voyna": "Как тема человека и войны становится центральной у Высоцкого?",
  "vysotsky-tsena-pobedy-i-nevidimye-poteri": "Зачем Высоцкий говорит о цене победы и невидимых потерях - и почему это так важно?",
  "vysotsky-pamyat-kak-fizicheskoe-oschuschenie": "Как память становится у Высоцкого физическим ощущением - и что это меняет в восприятии войны?",
  "vysotsky-pravo-govorit-o-voyne": "Зачем Высоцкому понадобилось право говорить о войне - и как он его заслужил?",
  "vysotsky-gosudarstvo-i-soldat": "Как тема государства и солдата раскрывается в песнях Высоцкого?",
  "vysotsky-pismennoe-zadanie-dlya-studenta": "Зачем студенту нужно написать именно это письменное задание по Высоцкому?",
  "vysotsky-ch-informatsiya-dlya-razdumiy": "Какая информация для раздумий помогает глубже услышать Высоцкого?",
  "vysotsky-informatsiya-dlya-razdumiy": "Зачем Высоцкий оставляет пространство для раздумий - и какие вопросы он задаёт?",
  "vysotsky-voprosy-dlya-pismennogo-razmyshleniya-studenta": "Какие вопросы для письменного размышления ставит Высоцкий перед студентом?",
  "vysotsky-ch-voprosy-po-proizvedeniyam": "Зачем нужны вопросы по произведениям Высоцкого - и как они помогают войти в его мир?",
  "vysotsky-voprosy-po-proizvedeniyam": "Какие вопросы по произведениям Высоцкого помогают глубже понять его?",
  "vysotsky-uroven-1-ponimanie-teksta": "Как первый уровень понимания текста открывает мир Высоцкого?",
  "vysotsky-pismennoe-zadanie-posle-urovnya-1": "Зачем нужно письменное задание после первого уровня - и что оно даёт?",
  "vysotsky-ch-uroven-2-analiz-i-interpretatsiya": "Какие тайны мастерства Высоцкого раскрывает второй уровень анализа?",
  "vysotsky-uroven-2-analiz-i-interpretatsiya": "Зачем нужен анализ и интерпретация - и что они меняют в прочтении Высоцкого?",
  "vysotsky-pismennoe-zadanie-posle-urovnya-2": "Зачем нужно письменное задание после второго уровня - и что оно даёт?",
  "vysotsky-ch-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о Высоцком?",
  "vysotsky-uroven-3-suzhdenie-i-pozitsiya": "Зачем нужен третий уровень - и как он помогает студенту?",
  "vysotsky-pismennoe-zadanie-posle-urovnya-3": "Зачем нужно письменное задание после третьего уровня - и что оно даёт?",
  "vysotsky-ch-zadaniya": "Какие задания помогают глубже изучить Высоцкого?",
  "vysotsky-zadaniya": "Зачем нужны задания по Высоцкому - и как они помогают войти в его мир?",
  "vysotsky-zadanie-1-dnevnik-soldata": "Зачем нужно написать «Дневник солдата» - и что это даёт студенту?",
  "vysotsky-zadanie-2-pismo-domoy": "Как задание «Письмо домой» помогает почувствовать эпоху Высоцкого?",
  "vysotsky-zadanie-3-reportazh-s-bratskoy-mogily": "Зачем нужно написать «Репортаж с братской могилы» - и что это меняет в восприятии?",
  "vysotsky-zadanie-4-tekst-dlya-pamyatnoy-tablichki": "Как задание «Текст для памятной таблички» помогает ощутить вес слова?",
  "vysotsky-ch-zadaniya-s-proverkoy-iskusstvennogo-intellekta": "Зачем нужны задания с проверкой ИИ - и как они помогают объективно оценить понимание?",
  "vysotsky-zadaniya-s-proverkoy-iskusstvennogo-intellekta": "Какие задания с проверкой ИИ помогают глубже изучить Высоцкого?",
  "vysotsky-zadanie-1-retsenziya-na-voennuyu-pesnyu": "Зачем нужно написать рецензию на военную песню - и что это даёт?",
  "vysotsky-zadanie-2-emotsionalnyy-portret-geroya": "Как задание «Эмоциональный портрет героя» помогает понять лирику Высоцкого?",
  "vysotsky-zadanie-3-otzyv-ot-litsa-veterana": "Зачем нужно написать отзыв от лица ветерана - и что это меняет в восприятии?",
  "vysotsky-zadanie-4-sravnitelnyy-otzyv": "Как задание «Сравнительный отзыв» помогает увидеть связь между произведениями Высоцкого?",
  "vysotsky-interactive": "Какие интерактивные приёмы помогают глубже изучить Высоцкого?",
  "vysotsky-interactive-methods": "Зачем нужны интерактивные методы при работе с песнями Высоцкого?",
  "vysotsky-slide-tasks": "Как задания из слайдов помогают систематизировать знания о Высоцком?",
  "vysotsky-ch-videomaterialy-razdela": "Какие видеоматериалы раздела помогают увидеть Высоцкого живым?",
  "vysotsky-videomaterialy-razdela": "Зачем нужны видеоматериалы - и что они раскрывают о Высоцком?",
  "vysotsky-video-1-ispolnenie-voennyh-pesen-v-s-vysotskogo": "Как видео исполнения военных песен помогает почувствовать голос Высоцкого?",
  "vysotsky-video-2-dokumentalnyy-film-ili-intervyu-o-v-s-vysotskom": "Зачем нужен документальный фильм или интервью о Высоцком - и что они раскрывают?",
  "vysotsky-video-3-kinorol-v-s-vysotskogo-voennoy-tematiki": "Как кинороль Высоцкого военной тематики помогает понять его?",
  "vysotsky-video-4-pohorony-v-s-vysotskogo-i-svidetelstva-o-proschanii": "Зачем нужно знать о похоронах Высоцкого и свидетельствах о прощании?",
  "vysotsky-video-finalnyy-akkord-razdela-zhivoe-ispolnenie": "Как живое исполнение становится финальным аккордом раздела о Высоцком?",
  "vysotsky-ch-istochniki-i-literatura": "Какие источники и литература помогают глубже изучить Высоцкого?",
  "vysotsky-istochniki-i-literatura": "Зачем нужны источники и литература - и что они раскрывают о Высоцком?",
  "vysotsky-ch-pervichnye-istochniki": "Какие первичные источники помогают понять эпоху Высоцкого?",
  "vysotsky-pervichnye-istochniki": "Зачем нужны первичные источники - и что они раскрывают о Высоцком?",
  "vysotsky-v-s-vysotskiy-sochineniya-v-dvuh-tomah": "Как «Сочинения в двух томах» помогают увидеть Высоцкого целиком?",
  "vysotsky-v-s-vysotskiy-nerv": "Зачем Высоцкому понадобился «Нерв» - и что это говорит о его поэтике?",
  "vysotsky-audiozapisi-kontsertov-v-s-vysotskogo-1960-1970-h-godov": "Как аудиозаписи концертов 1960-1970-х годов помогают услышать Высоцкого?",
  "vysotsky-pesni-on-ne-vernulsya-iz-boya-my-vraschaem-zemlyu-shtrafnye-b": "Зачем нужно слушать песни «Он не вернулся из боя», «Мы вращаем Землю», «Штрафные батальоны», «Братские могилы», «Песня о земле» вместе?",
  "vysotsky-ch-biograficheskie-istochniki": "Какие биографические источники раскрывают жизнь Высоцкого?",
  "vysotsky-biograficheskie-istochniki": "Зачем нужны биографические источники - и что они раскрывают о Высоцком?",
  "vysotsky-vl-novikov-vysotskiy": "Как книга Вл. Новикова «Высоцкий» помогает понять поэта?",
  "vysotsky-m-vladi-vladimir-ili-prervannyy-polet": "Зачем нужна книга М. Влади «Владимир, или Прерванный полёт» - и что она раскрывает?",
  "vysotsky-a-krylov-vysotskiy-zhizn-i-tvorchestvo": "Как книга А. Крылова «Высоцкий. Жизнь и творчество» помогает увидеть поэта?",
  "vysotsky-vospominaniya-akterov-teatra-na-taganke": "Зачем нужны воспоминания актёров Театра на Таганке - и что они раскрывают о Высоцком?",
  "vysotsky-ch-nauchnye-i-kriticheskie-raboty": "Какие научные и критические работы помогают анализировать творчество Высоцкого?",
  "vysotsky-nauchnye-i-kriticheskie-raboty": "Зачем нужны научные и критические работы - и что они раскрывают о Высоцком?",
  "vysotsky-l-abramova-poetika-vladimira-vysotskogo": "Как книга Л. Абрамовой «Поэтика Владимира Высоцкого» помогает понять поэта?",
  "vysotsky-sbornik-mir-vysotskogo": "Зачем нужен сборник «Мир Высоцкого» - и что он раскрывает?",
  "vysotsky-i-rubanova-voennaya-tema-v-poezii-vysotskogo": "Как работа И. Рубановой «Военная тема в поэзии Высоцкого» помогает понять поэта?",
  "vysotsky-stati-o-magnitofonnoy-kulture-sssr": "Зачем нужны статьи о магнитофонной культуре СССР - и что они раскрывают о Высоцком?",
  "vysotsky-ch-dokumentalnye-materialy": "Какие документальные материалы помогают увидеть Высоцкого живым?",
  "vysotsky-dokumentalnye-materialy": "Зачем нужны документальные материалы - и что они раскрывают о Высоцком?",
  "vysotsky-dokumentalnyy-film-v-s-vysotskiy-monolog": "Как документальный фильм «Высоцкий. Монолог» помогает понять поэта?",
  "vysotsky-televizionnye-intervyu-v-s-vysotskogo": "Зачем нужны телевизионные интервью Высоцкого - и что они раскрывают о нём?",
  "vysotsky-hronika-pohoron-v-s-vysotskogo-iyul-1980-goda": "Как хроника похорон Высоцкого помогает понять масштаб его влияния?",
  "vysotsky-film-ya-rodom-iz-detstva": "Зачем нужен фильм «Я родом из детства» - и что он раскрывает о Высоцком?",
  "vysotsky-ch-onlayn-resursy": "Какие онлайн-ресурсы помогают изучить Высоцкого?",
  "vysotsky-onlayn-resursy": "Зачем нужны онлайн-ресурсы - и что они раскрывают о Высоцком?",
  "vysotsky-ofitsialnyy-sayt-muzeya-v-s-vysotskogo": "Как официальный сайт музея Высоцкого помогает увидеть поэта?",
  "vysotsky-elektronnyy-arhiv-pesen-i-zapisey-v-s-vysotskogo": "Зачем нужен электронный архив песен и записей Высоцкого - и что он раскрывает?",
  "vysotsky-elektronnaya-biblioteka-russkoy-literatury": "Как электронная библиотека русской литературы помогает изучить Высоцкого?",
  "vysotsky-arhiv-dokumentalnogo-kino-i-intervyu": "Зачем нужен архив документального кино и интервью - и что он раскрывает о Высоцком?",
  "vysotsky-critics": "Что говорили критики о творчестве Высоцкого - и почему их мнения так важны?",
  "vysotsky-critics-view": "Зачем нужно знать, как воспринимали Высоцкого современники и потомки?",
  "vysotsky-ch-mesto-v-s-vysotskogo-v-literature-o-voyne": "Какое место занимает Высоцкий в литературе о войне - и чем оно уникально?",
  "vysotsky-mesto-v-s-vysotskogo-v-literature-o-voyne": "Зачем нужно определить место Высоцкого в литературе о войне - и что это меняет в восприятии?",
  "vysotsky-ch-itogovye-tezisy": "Какие итоговые тезисы помогают увидеть целое в творчестве Высоцкого?",
  "vysotsky-itogovye-tezisy": "Зачем нужны итоговые тезисы - и как они помогают увидеть Высоцкого целиком?",
  "vysotsky-ch-finalnoe-pismennoe-zadanie": "Как финальное письменное задание завершает работу с творчеством Высоцкого?",
  "vysotsky-finalnoe-pismennoe-zadanie": "Зачем нужно финальное письменное задание - и что оно даёт студенту?",
  "vysotsky-summary": "Как обобщение по Высоцкому помогает увидеть единство его творчества?",
  "vysotsky-final-summary": "Зачем нужно итоговое обобщение - и какой голос уносит с собой читатель после Высоцкого?",

  // ═══════════════════════════════════════════════════════════════
  // Н. А. ЗАБОЛОЦКИЙ
  // ═══════════════════════════════════════════════════════════════
  "zabolotsky": "Зачем Заболоцкий писал о природе в эпоху войны и репрессий - и что это говорит о его взгляде на человека?",
  "zabolotsky-photo-qr-ai": "Как природа становится убежищем души в поэзии Заболоцкого?",
  "zabolotsky-intro": "Зачем введение в творческое наследие Заболоцкого начинается именно так?",
  "zabolotsky-obyavlenie-proizvedeniy": "Как объявление произведений настраивает на серьёзный разговор о Заболоцком?",
  "zabolotsky-ch-doprosy-i-otkaz-ot-donosa": "Почему допросы и отказ от доноса стали ключевым эпизодом в жизни Заболоцкого?",
  "zabolotsky-doprosy-i-otkaz-ot-donosa": "Зачем Заболоцкий отказался от доноса - и что это говорит о его достоинстве?",
  "zabolotsky-ch-stihi-sohranennye-tolko-pamyatyu": "Как стихи, сохранённые только памятью, стали формой сопротивления у Заболоцкого?",
  "zabolotsky-stihi-sohranennye-tolko-pamyatyu": "Зачем Заболоцкий хранил стихи в памяти - и что это говорит о силе слова?",
  "zabolotsky-ch-stihi-sohranennye-tolko-pamyatyu-posle-ispytaniy": "Как стихи, сохранённые памятью после испытаний, помогают понять Заболоцкого?",
  "zabolotsky-stihi-sohranennye-tolko-pamyatyu-2": "Зачем нужно говорить о стихах, сохранённых памятью, - и что они раскрывают?",
  "zabolotsky-ch-rabota-nad-slovom-o-polku-igoreve": "Как работа над «Словом о полку Игореве» помогла Заболоцкому выжить?",
  "zabolotsky-rabota-nad-slovom-o-polku-igoreve": "Зачем Заболоцкий переводил «Слово о полку Игореве» - и что это дало ему?",
  "zabolotsky-ch-semya-i-vozvraschenie-domoy": "Как семья и возвращение домой стали для Заболоцкого новым началом?",
  "zabolotsky-semya-i-vozvraschenie-domoy": "Зачем Заболоцкому понадобилось возвращение домой - и что оно ему дало?",
  "zabolotsky-ch-pozdnee-priznanie": "Как позднее признание пришло к Заболоцкому - и почему оно запоздало?",
  "zabolotsky-pozdnee-priznanie": "Зачем нужно говорить о позднем признании Заболоцкого - и что оно меняет в восприятии?",
  "zabolotsky-ch-neozhidannyy-fakt": "Какой неожиданный факт о Заболоцком меняет представление о нём?",
  "zabolotsky-neozhidannyy-fakt": "Зачем нужны неожиданные факты - и что они раскрывают о Заболоцком?",
  "zabolotsky-zadanie-dlya-studenta": "Зачем студенту нужно выполнить именно это задание по Заболоцкому?",
  "zabolotsky-ch-ya-ne-ischu-garmonii-v-prirode": "Почему стихотворение «Я не ищу гармонии в природе» стало одним из ключевых у Заболоцкого?",
  "zabolotsky-ya-ne-ischu-garmonii-v-prirode": "Зачем Заболоцкий говорит, что не ищет гармонии в природе - и что он ищет вместо неё?",
  "zabolotsky-ch-mozhzhevelovyy-kust": "Как стихотворение «Можжевеловый куст» становится притчей о стойкости?",
  "zabolotsky-mozhzhevelovyy-kust": "Зачем Заболоцкий написал «Можжевеловый куст» - и что в нём оказалось важнее природы?",
  "zabolotsky-ch-proschanie-s-druzyami": "Почему стихотворение «Прощание с друзьями» звучит так пронзительно?",
  "zabolotsky-proschanie-s-druzyami": "Зачем Заболоцкий написал «Прощание с друзьями» - и что в нём оказалось важнее прощания?",
  "zabolotsky-ch-gde-to-v-pole-vozle-magadana": "Как стихотворение «Где-то в поле возле Магадана» становится голосом лагеря?",
  "zabolotsky-gde-to-v-pole-vozle-magadana": "Зачем Заболоцкий написал о Магадане - и что это говорит о его опыте?",
  "zabolotsky-ch-nekrasivaya-devochka": "Почему стихотворение «Некрасивая девочка» стало гимном внутренней красоте?",
  "zabolotsky-nekrasivaya-devochka": "Зачем Заболоцкий написал «Некрасивую девочку» - и что в ней оказалось важнее внешности?",
  "zabolotsky-ch-obschiy-vyvod": "Какой общий вывод можно сделать после знакомства с поэзией Заболоцкого?",
  "zabolotsky-obschiy-vyvod": "Зачем нужен общий вывод - и как он помогает увидеть целое в творчестве Заболоцкого?",
  "zabolotsky-ch-istoriya-mozhzhevelovogo-kusta": "Какова история стихотворения «Можжевеловый куст» - и почему она так важна?",
  "zabolotsky-istoriya-mozhzhevelovogo-kusta": "Зачем нужно знать историю создания «Можжевелового куста» - и что она раскрывает?",
  "zabolotsky-ch-perevody-kak-sposob-vyzhit": "Как переводы стали для Заболоцкого способом выжить?",
  "zabolotsky-perevody-kak-sposob-vyzhit": "Зачем Заболоцкому понадобились переводы - и что они ему дали?",
  "zabolotsky-ch-kak-sovremenniki-vosprinimali-n-a-zabolotskogo": "Как современники воспринимали Заболоцкого - и почему их восприятие было таким противоречивым?",
  "zabolotsky-kak-sovremenniki-vosprinimali-n-a-zabolotskogo": "Зачем нужно знать, как воспринимали Заболоцкого современники - и что это меняет в понимании?",
  "zabolotsky-ch-uteryannye-rukopisi-i-vosstanovlennye-teksty": "Как утерянные рукописи и восстановленные тексты помогают увидеть Заболоцкого?",
  "zabolotsky-uteryannye-rukopisi-i-vosstanovlennye-teksty": "Зачем нужно говорить об утерянных рукописях - и что они раскрывают о Заболоцком?",
  "zabolotsky-ch-neozhidannaya-istoriya-o-nekrasivoy-devochke": "Какая неожиданная история связана со стихотворением «Некрасивая девочка»?",
  "zabolotsky-neozhidannaya-istoriya-o-nekrasivoy-devochke": "Зачем нужны неожиданные истории - и что они раскрывают о Заболоцком?",
  "zabolotsky-ch-priroda-i-chelovek": "Как тема природы и человека становится центральной у Заболоцкого?",
  "zabolotsky-priroda-i-chelovek": "Зачем Заболоцкий соединяет природу и человека - и что рождается из этого соединения?",
  "zabolotsky-ch-gosudarstvo-i-lichnost": "Как тема государства и личности раскрывается в творчестве Заболоцкого?",
  "zabolotsky-gosudarstvo-i-lichnost": "Зачем Заболоцкий говорит о государстве и личности - и что это меняет в восприятии?",
  "zabolotsky-ch-pamyat-i-utrata": "Как тема памяти и утраты становится центральной у Заболоцкого?",
  "zabolotsky-pamyat-i-utrata": "Зачем Заболоцкий говорит о памяти и утрате - и что это говорит о его взгляде на жизнь?",
  "zabolotsky-ch-krasota-kak-nravstvennaya-kategoriya": "Как красота становится у Заболоцкого нравственной категорией?",
  "zabolotsky-krasota-kak-nravstvennaya-kategoriya": "Зачем Заболоцкий делает красоту нравственной категорией - и что это меняет в восприятии?",
  "zabolotsky-ch-molchanie-kak-forma-vyskazyvaniya": "Как молчание становится у Заболоцкого формой высказывания?",
  "zabolotsky-molchanie-kak-forma-vyskazyvaniya": "Зачем Заболоцкому понадобилось молчание - и что оно говорит громче слов?",
  "zabolotsky-pismennoe-zadanie-dlya-studenta": "Зачем студенту нужно написать именно это письменное задание по Заболоцкому?",
  "zabolotsky-voprosy-dlya-pismennogo-razmyshleniya-studenta": "Какие вопросы для письменного размышления ставит Заболоцкий перед студентом?",
  "zabolotsky-ch-uroven-1-ponimanie-teksta": "Как первый уровень погружения в текст помогает услышать голос Заболоцкого?",
  "zabolotsky-uroven-1-ponimanie-teksta": "Зачем нужно погружение в текст - и что оно даёт студенту?",
  "zabolotsky-pismennoe-zadanie": "Зачем нужно письменное задание - и что оно даёт студенту?",
  "zabolotsky-ch-uroven-2-analiz-i-interpretatsiya": "Какие тайны мастерства Заболоцкого раскрывает второй уровень анализа?",
  "zabolotsky-uroven-2-analiz-i-interpretatsiya": "Зачем нужен анализ и интерпретация - и что они меняют в прочтении Заболоцкого?",
  "zabolotsky-pismennoe-zadanie-2": "Зачем нужно второе письменное задание - и что оно даёт?",
  "zabolotsky-ch-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о Заболоцком?",
  "zabolotsky-uroven-3-suzhdenie-i-pozitsiya": "Зачем нужен третий уровень - и как он помогает студенту?",
  "zabolotsky-pismennoe-zadanie-3": "Зачем нужно третье письменное задание - и что оно даёт?",
  "zabolotsky-interactive": "Какие интерактивные приёмы помогают глубже изучить Заболоцкого?",
  "zabolotsky-interactive-methods": "Зачем нужны интерактивные методы при работе с поэзией Заболоцкого?",
  "zabolotsky-slide-tasks": "Как задания из слайдов помогают систематизировать знания о Заболоцком?",
  "zabolotsky-critics": "Что говорили критики о творчестве Заболоцкого - и почему их мнения так важны?",
  "zabolotsky-critics-view": "Зачем нужно знать, как воспринимали Заболоцкого современники и потомки?",
  "zabolotsky-chto-ostaetsya": "Что остаётся от Заболоцкого - и почему его поэзия звучит и сегодня?",
  "zabolotsky-mesto-n-a-zabolotskogo-v-literature-o-voyne": "Какое место занимает Заболоцкий в литературе о войне - и чем оно уникально?",
  "zabolotsky-itogovye-tezisy": "Зачем нужны итоговые тезисы - и как они помогают увидеть Заболоцкого целиком?",
  "zabolotsky-finalnoe-pismennoe-zadanie": "Как финальное письменное задание завершает работу с творчеством Заболоцкого?",
  "zabolotsky-summary": "Как обобщение по Заболоцкому помогает увидеть единство его поэтического мира?",
  "zabolotsky-final-summary": "Зачем нужен финальный штрих на полотне знаний - и какой голос уносит с собой читатель после Заболоцкого?",

  // ═══════════════════════════════════════════════════════════════
  // ПРЕДИСЛОВИЕ И ОБЗОР
  // ═══════════════════════════════════════════════════════════════
  "preface": "Зачем нужно предисловие к электронному учебнику - и что оно даёт студенту?",
  "preface-annotation": "Как аннотация помогает понять, зачем создан этот учебник?",
  "overview": "Зачем нужно общее обобщение учебника - и что оно меняет в восприятии прочитанного?",
  "overview-final-summary": "Как итоговое слово об изученном помогает увидеть целое в литературе о войне?"
};

  if (SECTION_QUESTIONS[section.id]) {
    return SECTION_QUESTIONS[section.id];
  }

  return `Как ключевая идея раздела «${cleanTitle}» раскрывает нравственный выбор человека в экстремальных условиях и почему этот аспект важен для осмысления военного опыта у ${authorName}?`;
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
