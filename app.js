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
  retakes: [],
  teacherRetakes: [],
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
  state.retakes = [];
  state.teacherRetakes = [];
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
  updateAccountBadge();
}

// Сколько запросов на пересдачу ждёт преподавателя: число на кнопке «Кабинет».
function updateAccountBadge() {
  if (!state.user) return;
  const pending = (state.teacherRetakes || []).filter((item) => item.status === "pending").length;
  elements.accountToggle.textContent = pending ? `Кабинет (${pending})` : "Кабинет";
}

// Всё, что пришло от пользователей (ФИО, email, названия, ответы, комментарии ИИ),
// перед вставкой через innerHTML нужно экранировать: иначе это XSS в кабинете преподавателя.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

async function refreshDashboardData() {
  if (!state.user) return;

  const isStaff = ["teacher", "admin"].includes(state.user.role);
  const [mine, myRetakes, groups, users, teacherSubs, teacherRetakes] = await Promise.all([
    api("/api/submissions/my").catch(() => ({ submissions: [] })),
    api("/api/retakes/my").catch(() => ({ retakes: [] })),
    isStaff ? api("/api/groups").catch(() => ({ groups: [] })) : null,
    isStaff ? api("/api/users").catch(() => ({ users: [] })) : null,
    isStaff ? api("/api/submissions/teacher").catch(() => ({ submissions: [] })) : null,
    isStaff ? api("/api/retakes").catch(() => ({ retakes: [] })) : null,
  ]);

  state.submissions = mine.submissions || [];
  state.retakes = myRetakes.retakes || [];
  if (isStaff) {
    state.groups = groups.groups || [];
    state.users = users.users || [];
    state.teacherSubmissions = teacherSubs.submissions || [];
    state.teacherRetakes = teacherRetakes.retakes || [];
  }
  updateAccountBadge();
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
  wrap.append(renderRetakesCard(), groupsCard, usersCard, submissionsCard);
  return wrap;
}

function renderGroupsList() {
  const list = document.createElement("div");
  list.className = "data-list";

  if (!state.groups.length) list.innerHTML = `<p class="toc-empty">Группы ещё не созданы.</p>`;

  state.groups.forEach((group) => {
    const item = document.createElement("div");
    item.className = "data-item";
    item.innerHTML = `<strong>${escapeHtml(group.name)}</strong><small>ID: ${escapeHtml(group.id)}</small>`;
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
      .concat(state.groups.map((group) => `<option value="${escapeHtml(group.id)}" ${user.groupId === group.id ? "selected" : ""}>${escapeHtml(group.name)}</option>`))
      .join("");

    item.innerHTML = `
      <strong>${escapeHtml(user.fullName)}</strong>
      <small>${escapeHtml(user.email)} · ${roleName(user.role)}</small>
      <label>Группа<select data-action="group" data-user="${escapeHtml(user.id)}">${groupOptions}</select></label>
      ${
        isAdmin
          ? `<label>Роль<select data-action="role" data-user="${escapeHtml(user.id)}">
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
  const retakeAllowed = item.status === "retake_allowed";
  const score = retakeAllowed
    ? `пересдача разрешена${item.previousScore != null ? `, было ${item.previousScore}` : ""}`
    : item.finalScore ?? item.ai?.score ?? "-";

  node.innerHTML = `
    <strong>${escapeHtml(item.topic || item.sectionId)}</strong>
    <span class="status-pill">${retakeAllowed ? "" : "Оценка: "}${escapeHtml(score)}</span>
    <small>${showStudent && item.student ? `${escapeHtml(item.student.fullName)} · ` : ""}${escapeHtml(item.author || "")}</small>
    <small>${escapeHtml(item.ai?.comment || item.error || (retakeAllowed ? "Ждёт нового ответа ученика" : "Ожидает проверки"))}</small>
  `;

  return node;
}

// ─── Пересдача: список запросов в кабинете преподавателя ────────────────────
const INPUT_MODE_TEXT = { mixed: "частично вставлен", pasted: "вставлен целиком", unverified: "способ ввода не подтверждён" };

function renderRetakesCard() {
  const card = document.createElement("div");
  card.className = "panel-card";
  const retakes = state.teacherRetakes || [];
  const pending = retakes.filter((item) => item.status === "pending").length;

  const title = document.createElement("h3");
  title.textContent = pending ? `Запросы на пересдачу (${pending})` : "Запросы на пересдачу";
  card.append(title);

  const list = document.createElement("div");
  list.className = "data-list";
  if (!retakes.length) {
    list.innerHTML = `<p class="toc-empty">Запросов на пересдачу пока нет.</p>`;
  }
  retakes.forEach((retake) => list.append(renderRetakeItem(retake)));
  card.append(list);
  return card;
}

function renderRetakeItem(retake) {
  const node = document.createElement("div");
  node.className = "data-item retake-item";

  const addLine = (tag, text, className) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    node.append(element);
    return element;
  };

  addLine("strong", retake.student?.fullName || "Ученик не найден");
  addLine("small", `Группа: ${retake.groupName || "не назначена"}`);
  addLine("small", `Задание: ${retake.topic || "—"}${retake.author ? ` · ${retake.author}` : ""}`);
  const mark = retake.markAtRequest ? ` (${retake.markAtRequest})` : "";
  addLine("span", `Оценка: ${retake.scoreAtRequest ?? "—"}${mark}`, "status-pill");
  addLine("small", `Желаемый балл: ${retake.desiredScore ?? "не указан"}`);
  if (INPUT_MODE_TEXT[retake.inputMode]) addLine("small", `Ответ был: ${INPUT_MODE_TEXT[retake.inputMode]}`);
  if (retake.note) addLine("small", `Комментарий ученика: ${retake.note}`);

  if (retake.status !== "pending") {
    const verdict = retake.status === "approved" ? "Пересдача разрешена" : "Запрос отклонён";
    addLine("small", `${verdict}${retake.teacherComment ? `: ${retake.teacherComment}` : ""}`, "status-pill");
    return node;
  }

  const comment = document.createElement("input");
  comment.type = "text";
  comment.maxLength = 500;
  comment.placeholder = "Комментарий ученику (необязательно)";
  node.append(comment);

  const actions = document.createElement("div");
  actions.className = "assignment-actions";
  const resolve = async (action) => {
    actions.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      await api(`/api/retakes/${retake.id}`, { method: "PATCH", body: { action, comment: comment.value } });
      await refreshDashboardData();
      renderDashboard();
    } catch (error) {
      actions.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      addLine("small", error.message);
    }
  };
  const approve = document.createElement("button");
  approve.type = "button";
  approve.className = "text-button";
  approve.textContent = "Разрешить пересдачу";
  approve.addEventListener("click", () => resolve("approve"));
  const decline = document.createElement("button");
  decline.type = "button";
  decline.className = "text-button";
  decline.textContent = "Отклонить";
  decline.addEventListener("click", () => resolve("decline"));
  actions.append(approve, decline);
  node.append(actions);
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
  "akhmatova": "Что заставляло А. А. Ахматову писать стихи, когда мир вокруг рушился, и как её слово поддерживало читателей?",
  "akhmatova-author-sheet": "Как в строках «И в мире нет святей и чище пепла...» боль утраты превращается в вечный памятник любви к родной земле?",
  "akhmatova-ch-znakomstvo-s-avtorom-i-biografiya": "Какие испытания судьбы закалили душу А. А. Ахматовой и научили её говорить правду даже тогда, когда это было опасно?",
  "akhmatova-znakomstvo-s-avtorom-i-biografiya": "Почему биография А. А. Ахматовой читается как трагическая поэма о стойкости человеческого духа в эпоху безумия?",
  "akhmatova-ch-rekviem": "Почему поэма А. А. Ахматовой «Реквием» воспринимается как голос миллионов матерей, стоявших в тюремных очередях?",
  "akhmatova-rekviem": "Каким образом А. А. Ахматова превратила личное горе в рукопись страданий целого народа?",
  "akhmatova-ch-voennaya-lirika": "Что объединяет стихотворения А. А. Ахматовой «Мужество», «Клятва» и «Победа» и почему они звучат как призыв к стойкости?",
  "akhmatova-muzhestvo": "Почему в 1942 году А. А. Ахматова написала о мужестве не как о подвиге, а как о последней надежде сохранить русскую речь?",
  "akhmatova-klyatva": "Какую клятву даёт поэт своему народу в стихотворении, и почему эта клятва важнее любых официальных обещаний?",
  "akhmatova-pobeda": "Почему победа в понимании А. А. Ахматовой – это не только триумф, но и горькая память о тех, кто не дожил до этого дня?",
  "akhmatova-ch-uroven-1-bazovyy-znanie-teksta": "Какие образы и символы помогают читателю впервые прикоснуться к трагическому миру А. А. Ахматовой?",
  "akhmatova-uroven-1-bazovyy-znanie-teksta": "Что должен понять студент, читая строки А. А. Ахматовой впервые, и какие детали открывают глубину её поэзии?",
  "akhmatova-ch-uroven-2-sredniy-analiz": "Какими художественными средствами А. А. Ахматова создаёт ощущение присутствия смерти рядом с жизнью?",
  "akhmatova-uroven-2-sredniy-analiz": "Какие литературные приёмы превращают простые слова А. А. Ахматовой в вечные символы народного страдания?",
  "akhmatova-ch-uroven-3-prodvinutyy-sintez-i-otsenka": "Как творчество А. А. Ахматовой меняет наше понимание того, что значит быть поэтом в эпоху катастроф?",
  "akhmatova-uroven-3-prodvinutyy-sintez-i-otsenka": "Почему сегодня, спустя десятилетия, голос А. А. Ахматовой звучит так, будто она пишет о сегодняшнем дне?",
  "akhmatova-interactive": "Как интерактивные задания помогают студенту не просто прочитать, а пережить опыт А. А. Ахматовой?",
  "akhmatova-interactive-methods": "Какие современные методы работы с текстом позволяют прикоснуться к боли, которую испытывала А. А. Ахматова?",
  "akhmatova-slide-tasks": "Что позволяют понять о связи эпохи А. А. Ахматовой с нашим временем задания, составленные по слайдам раздела?",
  "akhmatova-critics": "Как критики оценивали готовность А. А. Ахматовой говорить правду в годы всеобщего молчания и какое значение эта позиция имеет для читателя сегодня?",
  "akhmatova-critics-view": "Почему критики называли А. А. Ахматову «голосом народа» и чем её творчество подтверждает это определение?",
  "akhmatova-summary": "Какой главный урок оставляет нам А. А. Ахматова после всех испытаний, через которые она прошла?",
  "akhmatova-final-summary": "Как в финальном аккорде познания страницы жизни А. А. Ахматовой сплетаются в единое полотно народной памяти?",

  // ═══════════════════════════════════════════════════════════════
  // В. В. БЫКОВ
  // ═══════════════════════════════════════════════════════════════
  "bykov": "Почему В. В. Быков писал о войне так, будто сам стоял в том окопе, и как это меняет наше восприятие войны?",
  "bykov-author-sheet": "Как в тупике человеческого выбора раскрывается трагедия тех, кто предал себя ради спасения жизни?",
  "bykov-ch-v-v-bykov-zhizn-i-tvorcheskiy-put": "Какие фронтовые раны навсегда остались в душе В. В. Быкова и как они превратились в его прозу?",
  "bykov-v-v-bykov-zhizn-i-tvorcheskiy-put": "Почему биография В. В. Быкова – это история о том, как война формирует писателя, который не имеет права лгать?",
  "bykov-ch-voyna-v-proizvedeniyah-v-v-bykova": "Какую правду о войне открыл В. В. Быков, которую другие предпочитали не замечать?",
  "bykov-voyna-v-proizvedeniyah-v-v-bykova": "Почему война в произведениях В. В. Быкова – это не батальные сцены, а испытание совести каждого человека?",
  "bykov-ch-sotnikov": "Что делает повесть В. В. Быкова «Сотников» одним из самых тяжёлых произведений о войне и почему её невозможно читать равнодушно?",
  "bykov-sotnikov": "Как в повести «Сотников» два человека на войне становятся зеркалами друг друга – один выбирает смерть, другой предательство?",
  "bykov-ch-sotnikov-2": "Какие символы и детали превращают повесть В. В. Быкова «Сотников» в философскую притчу о выборе между жизнью и честью?",
  "bykov-sotnikov-2": "Почему каждая деталь в повести В. В. Быкова «Сотников» напоминает, что на войне нет мелочей?",
  "bykov-ch-rostovye-zadaniya-dlya-uchenika-po-povesti-vasilya-bykova-sotnikov": "Какие нравственные вопросы ставит перед читателем повесть В. В. Быкова «Сотников» и почему на них нельзя ответить однозначно?",
  "bykov-rostovye-zadaniya-dlya-uchenika-po-povesti-vasilya-bykova-sotnikov": "Как выполнение заданий по повести В. В. Быкова «Сотников» помогает понять, что война испытывает не только силу, но и нравственную стойкость человека?",
  "bykov-ch-uroven-1-bazovyy": "Какие детали повести В. В. Быкова «Сотников» должен заметить студент при первом чтении?",
  "bykov-uroven-1-bazovyy": "Какие базовые знания о повести В. В. Быкова «Сотников» необходимы, чтобы понять её трагизм?",
  "bykov-ch-uroven-2-analiticheskiy": "Как анализировать повесть В. В. Быкова «Сотников», чтобы за сюжетом увидеть философский спор о природе человека?",
  "bykov-uroven-2-analiticheskiy": "Какие литературные приёмы использует В. В. Быков, чтобы заставить читателя сомневаться вместе с героями?",
  "bykov-ch-uroven-3-tvorcheskiy-i-issledovatelskiy": "Как творческая работа над повестью В. В. Быкова «Сотников» помогает студенту найти собственный ответ на вопрос о предательстве?",
  "bykov-uroven-3-tvorcheskiy-i-issledovatelskiy": "Почему исследовательский подход к повести В. В. Быкова «Сотников» открывает новые смыслы при каждом прочтении?",
  "bykov-ch-chelovek-na-vesah-voyny-uroki-prozy-vasilya-bykova": "Чему учит проза В. В. Быкова о цене человеческого выбора на весах войны?",
  "bykov-chelovek-na-vesah-voyny-uroki-prozy-vasilya-bykova": "Почему уроки прозы В. В. Быкова актуальны сегодня, когда мир снова сталкивается с выбором между добром и злом?",
  "bykov-interactive": "Как интерактивные приёмы помогают студенту прожить опыт героев В. В. Быкова, а не просто прочитать о них?",
  "bykov-interactive-methods": "Какие методы работы с текстом позволяют почувствовать, что значит стоять перед выбором в окопе?",
  "bykov-slide-tasks": "С какими другими произведениями о Великой Отечественной войне можно сопоставить повесть В. В. Быкова «Сотников» при работе с заданиями из слайдов?",
  "bykov-critics": "Как критики оценивали стремление В. В. Быкова показывать войну без прикрас?",
  "bykov-critics-view": "Почему читатели воспринимали В. В. Быкова как совесть литературы о войне?",
  "bykov-summary": "Какой главный вывод оставляет нам В. В. Быков после всех прочитанных страниц?",
  "bykov-final-summary": "Что объединяет произведения В. В. Быкова о войне и как итоговое обобщение помогает увидеть эту общую тему?",

  // ═══════════════════════════════════════════════════════════════
  // Е. А. ЕВТУШЕНКО
  // ═══════════════════════════════════════════════════════════════
  "evtyushenko": "Почему Е. А. Евтушенко стал голосом поколения, которое не знало войны, но чувствовало её боль?",
  "evtyushenko-author-sheet": "Как ключевые слова и произведения Е. А. Евтушенко создают портрет поэта, который не мог молчать о войне?",
  "ev-detstvo-sibir-i-voyna-vokrug": "Как детство в Сибири, окружённое войной, сформировало взгляд Е. А. Евтушенко на мир?",
  "ev-sec-detstvo-sibir-i-voyna-vokrug-intro": "Почему война вокруг детства стала для Е. А. Евтушенко уроком, который он не забыл никогда?",
  "ev-moskva-literaturnyy-institut-i-rozhdenie-golosa": "Как в стенах Литературного института родился голос поэта, который заговорил о войне от имени молодёжи?",
  "ev-sec-moskva-literaturnyy-institut-i-rozhdenie-golosa-intro": "Почему рождение голоса Е. А. Евтушенко совпало с потребностью поколения говорить правду о войне?",
  "ev-shestidesyatniki-poet-na-stadione": "Как Е. А. Евтушенко стал поэтом-шестидесятником, читающим стихи на стадионах, и что это значило для страны?",
  "ev-sec-shestidesyatniki-poet-na-stadione-intro": "Почему поколение шестидесятников увидело в Е. А. Евтушенко своего пророка, говорящего о войне и памяти?",
  "ev-vlast-skandaly-i-granitsy-svobody": "Как власть, скандалы и границы свободы формировали судьбу Е. А. Евтушенко и его отношение к войне?",
  "ev-sec-vlast-skandaly-i-granitsy-svobody-intro": "Почему Е. А. Евтушенко постоянно балансировал между свободой слова и давлением власти, говоря о войне?",
  "ev-pozdnie-gody-amerika-i-vozvraschenie": "Как поздние годы в Америке и возвращение на родину изменили взгляд Е. А. Евтушенко на войну?",
  "ev-sec-pozdnie-gody-amerika-i-vozvraschenie-intro": "Почему даже вдали от России Е. А. Евтушенко не переставал думать о войне и её уроках?",
  "ev-sec-istochniki": "Какие источники позволяют проверить сведения о том, как формировалось отношение Е. А. Евтушенко к войне?",
  "ev-intro": "Почему война стала центральной темой Е. А. Евтушенко, хотя он был слишком молод, чтобы воевать?",
  "ev-vvedenie": "Как введение в творчество Е. А. Евтушенко открывает тему войны как незаживающей раны поколения?",
  "ev-pochemu-voyna-ego-glazami": "Почему война, увиденная глазами Е. А. Евтушенко, отличается от войны, описанной фронтовиками?",
  "ev-sec-pochemu-voyna-ego-glazami-intro": "Что нового даёт взгляд Е. А. Евтушенко на войну по сравнению с поэзией и прозой фронтовиков?",
  "ev-sec-voyna-kak-nezazhivayuschaya-rana-pokoleniya": "Как война стала незаживающей раной поколения Е. А. Евтушенко и почему эта боль не уходит?",
  "ev-sec-pochemu-obvinenie-a-ne-elegiya-1": "Почему Е. А. Евтушенко выбирает обвинение, а не элегию, говоря о войне?",
  "ev-sec-voyna-i-antisemitizm-2": "Почему стихотворение Е. А. Евтушенко «Бабий Яр» связывает память о войне с темой антисемитизма и что поэт требует от читателя?",
  "ev-sec-voennye-posledstviya-kotorye-on-opisyval-3": "Какие последствия войны описывает Е. А. Евтушенко и как они отражаются на судьбах людей?",
  "ev-sec-chto-mozhet-unesti-student-iz-etogo-razdela-4": "Что может унести студент из раздела о Е. А. Евтушенко и как это изменит его взгляд на войну?",
  "ev-sec-istochniki-5": "Какие источники помогают сопоставить военную лирику Е. А. Евтушенко с историческими свидетельствами о войне?",
  "ev-opisanie-proizvedeniy-chast-pervaya-glavnye-voennye-teksty": "Какие главные военные тексты Е. А. Евтушенко открывают правду о войне?",
  "ev-sec-voennaya-lirika-e-a-evtushenko-pamyat-kak-nravstvennaya-obyazannost": "Почему память о войне для Е. А. Евтушенко – это нравственная обязанность каждого человека?",
  "ev-sec-babiy-yar-1": "Как стихотворение «Бабий Яр» стало криком против забвения и почему оно звучит сегодня?",
  "ev-sec-hotyat-li-russkie-voyny-2": "Почему стихотворение Е. А. Евтушенко «Хотят ли русские войны» стало гимном мира и как оно связано с памятью о войне?",
  "ev-sec-shtrafniki-3": "Как стихотворение «Штрафники» раскрывает трагедию тех, кто воевал, будучи обвинённым?",
  "ev-sec-frontovik-4": "Как образ фронтовика в стихотворении Е. А. Евтушенко «Фронтовик» связан с судьбой послевоенного поколения?",
  "ev-sec-istochniki-5-2": "Какие материалы позволяют точнее определить обстоятельства, в которых Е. А. Евтушенко написал военные стихотворения?",
  "ev-opisanie-proizvedeniy-chast-vtoraya-pamyat-i-utrata": "Как во второй части описания произведений Е. А. Евтушенко тема утраты соединяется с памятью о погибших?",
  "ev-sec-opisanie-proizvedeniy-chast-vtoraya-pamyat-i-utrata-intro": "Почему память и утрата становятся центральными темами в военной лирике Е. А. Евтушенко?",
  "ev-sec-malchiki": "Как стихотворение «Мальчики» передаёт трагедию детей, повзрослевших на войне?",
  "ev-sec-vdova-1": "Почему образ вдовы в стихах Е. А. Евтушенко становится символом всех потерь войны?",
  "ev-sec-partizanskie-mogily-2": "Как стихотворение «Партизанские могилы» говорит о безымянных героях войны?",
  "ev-sec-svadby-3": "Почему стихотворение «Свадьбы» звучит так трагично на фоне войны?",
  "ev-sec-tretiy-sneg-4": "Как образ третьего снега в стихах Е. А. Евтушенко связан с памятью о войне?",
  "ev-sec-istochniki-5-3": "На какие источники опирается рассказ о стихотворениях Е. А. Евтушенко о памяти и утрате и что они позволяют проверить?",
  "ev-opisanie-proizvedeniy-chast-tretya-filosofskaya-lirika": "Как философская лирика Е. А. Евтушенко раскрывает вечные вопросы о войне и жизни?",
  "ev-sec-opisanie-proizvedeniy-chast-tretya-filosofskaya-lirika-intro": "Почему философская лирика Е. А. Евтушенко помогает понять глубину его взгляда на войну?",
  "ev-sec-idut-belye-snegi": "Как стихотворение «Идут белые снеги» связано с темой памяти и очищения?",
  "ev-sec-lyudey-neinteresnyh-v-mire-net-1": "Какую мысль о ценности каждой личности выражает стихотворение Е. А. Евтушенко «Людей неинтересных в мире нет»?",
  "ev-sec-so-mnoyu-vot-chto-proishodit-2": "Как стихотворение «Со мною вот что происходит» раскрывает внутренний мир поэта?",
  "ev-sec-grazhdane-poslushayte-menya-3": "Почему стихотворение Е. А. Евтушенко «Граждане, послушайте меня» звучит как призыв к совести?",
  "ev-obschiy-vyvod-ko-vsem-trem-chastyam-opisaniya-proizvedeniy": "Какой общий вывод можно сделать из всех трёх частей описания произведений Е. А. Евтушенко?",
  "ev-sec-obschiy-vyvod-ko-vsem-trem-chastyam-opisaniya-proizvedeniy-intro": "Как общий вывод объединяет все темы военной лирики Е. А. Евтушенко?",
  "ev-sec-istochniki-2": "Какие источники помогают прочитать философскую лирику Е. А. Евтушенко в контексте его биографии и эпохи?",
  "ev-chelovek-epohi-dva-vzglyada": "Чем два взгляда на человека эпохи дополняют друг друга при оценке Е. А. Евтушенко?",
  "ev-sec-chelovek-epohi-dva-vzglyada-intro": "Какие две точки зрения на личность Е. А. Евтушенко сопоставляются во введении к разделу?",
  "ev-sec-vzglyad-iznutri-epohi": "Как взгляд изнутри эпохи раскрывает правду о времени Е. А. Евтушенко?",
  "ev-sec-vzglyad-avtora-1": "Как автор раздела оценивает отношение Е. А. Евтушенко к своей эпохе и какие доводы приводит?",
  "ev-sec-voennye-posledstviya-kak-glavnaya-tema-2": "Как военные последствия становятся главной темой размышлений Е. А. Евтушенко?",
  "ev-sec-chto-izmenilos-so-vremenem-3": "Что изменилось со временем в восприятии войны и почему это важно?",
  "ev-sec-kak-prochitannoe-menyaet-mirovozzrenie-4": "Как прочитанное меняет мировоззрение студента и его отношение к войне?",
  "ev-sec-video-svidetelstva-sovremennikov-o-e-a-evtushenko-i-ego-voennyh-stihah-5": "Что рассказывают свидетельства современников о Е. А. Евтушенко и его военных стихах?",
  "ev-sec-istochniki-6": "Какие источники позволяют увидеть эпоху Е. А. Евтушенко так, как её воспринимали современники поэта?",
  "ev-kak-eto-sozdavalos": "Как создавались главные произведения Е. А. Евтушенко о войне?",
  "ev-sec-kak-eto-sozdavalos-intro": "Как знание истории создания стихотворений Е. А. Евтушенко меняет их прочтение?",
  "ev-sec-istoriya-sozdaniya-babego-yara": "Какова история создания стихотворения Е. А. Евтушенко «Бабий Яр» и почему оно стало общественным событием?",
  "ev-sec-reaktsiya-na-babiy-yar-1": "Какой была реакция на стихотворение Е. А. Евтушенко «Бабий Яр» и почему она разделила общество?",
  "ev-sec-kak-sozdavalos-hotyat-li-russkie-voyny-2": "Как создавалось стихотворение «Хотят ли русские войны» и почему оно стало гимном?",
  "ev-sec-vstrechi-s-veteranami-i-ih-vliyanie-na-voennuyu-poeziyu-3": "Как встречи с ветеранами повлияли на военную поэзию Е. А. Евтушенко?",
  "ev-sec-reaktsiya-veteranov-na-voennuyu-poeziyu-4": "Какой была реакция ветеранов на военную поэзию Е. А. Евтушенко?",
  "ev-sec-neozhidannyy-fakt-5": "Какой неожиданный факт о Е. А. Евтушенко помогает понять его творчество?",
  "ev-sec-istochniki-6-2": "По каким источникам можно восстановить историю создания стихотворений Е. А. Евтушенко и как отличить документальное свидетельство от легенды?",
  "ev-problemy-proizvedeniy-chast-pervaya": "Какие проблемы произведений раскрываются в первой части?",
  "ev-sec-problemy-proizvedeniy-chast-pervaya-intro": "Какие нравственные и общественные проблемы поднимает Е. А. Евтушенко в произведениях, рассмотренных в первой части раздела?",
  "ev-sec-zamolchannaya-pravda-o-voyne": "Как замолчанная правда о войне становится темой стихов Е. А. Евтушенко?",
  "ev-sec-voyna-i-antisemitizm-1": "Как война и антисемитизм связаны в стихотворении Е. А. Евтушенко «Бабий Яр»?",
  "ev-sec-tsena-pobedy-i-nevidimye-poteri-2": "Как цена победы и невидимые потери раскрываются в стихах Е. А. Евтушенко?",
  "ev-sec-istochniki-3": "Какие источники нужны, чтобы разобраться в нравственных проблемах, которые поднимает Е. А. Евтушенко?",
  "ev-problemy-proizvedeniy-chast-vtoraya": "Какие проблемы произведений раскрываются во второй части?",
  "ev-sec-problemy-proizvedeniy-chast-vtoraya-intro": "Какие вопросы совести и памяти раскрываются в произведениях Е. А. Евтушенко, рассмотренных во второй части раздела?",
  "ev-sec-grazhdanskaya-otvetstvennost-i-pamyat-kak-politicheskiy-akt": "Как гражданская ответственность и память становятся политическим актом у Е. А. Евтушенко?",
  "ev-sec-chelovek-i-istoriya-1": "Как судьба отдельного человека связана с историей страны в военных стихотворениях Е. А. Евтушенко?",
  "ev-sec-zhenschina-i-voyna-2": "Какой предстаёт женщина на войне в стихах Е. А. Евтушенко?",
  "ev-informatsiya-dlya-razdumiy": "Какая информация для раздумий помогает глубже понять Е. А. Евтушенко?",
  "ev-sec-informatsiya-dlya-razdumiy-intro": "О чём предлагает задуматься раздел «Информация для раздумий» в связи с поэзией Е. А. Евтушенко?",
  "ev-sec-voprosy-dlya-pismennogo-razmyshleniya": "Какие нравственные вопросы о памяти и ответственности Е. А. Евтушенко ставит перед читателем и как раскрыть их в письменном размышлении?",
  "ev-sec-istochniki-1": "Какие источники пригодятся при подготовке ответов на вопросы для письменного размышления о творчестве Е. А. Евтушенко?",
  "ev-voprosy-po-proizvedeniyam": "Какие вопросы к стихотворениям Е. А. Евтушенко помогают перейти от пересказа содержания к анализу авторской позиции?",
  "ev-sec-voprosy-po-proizvedeniyam-intro": "Какими должны быть вопросы к стихотворениям Е. А. Евтушенко, чтобы направлять читателя к анализу, а не к пересказу?",
  "ev-uroven-1-ponimanie-teksta": "Как первый уровень понимания текста открывает мир Е. А. Евтушенко?",
  "ev-sec-uroven-1-ponimanie-teksta-intro": "Что необходимо заметить в стихотворении Е. А. Евтушенко при первом внимательном чтении?",
  "ev-sec-zadanie-posle-urovnya-1": "Какое задание после первого уровня помогает закрепить понимание?",
  "ev-uroven-2-analiz-i-interpretatsiya": "Как второй уровень анализа и интерпретации раскрывает тайны мастерства Е. А. Евтушенко?",
  "ev-sec-uroven-2-analiz-i-interpretatsiya-intro": "Какие приёмы мастерства Е. А. Евтушенко выявляет анализ его стихотворений на втором уровне?",
  "ev-sec-zadanie-posle-urovnya-2": "Какое задание после второго уровня помогает углубить понимание?",
  "ev-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень суждения и позиции помогает сформулировать свой взгляд на Е. А. Евтушенко?",
  "ev-sec-uroven-3-suzhdenie-i-pozitsiya-intro": "Какую собственную позицию о нравственном выборе, который ставит поэзия Е. А. Евтушенко, нужно сформулировать на третьем уровне?",
  "ev-sec-zadanie-posle-urovnya-3": "Какое задание после третьего уровня помогает завершить работу с текстом?",
  "evtyushenko-critics": "Как критики оценивали гражданскую позицию и поэтический язык Е. А. Евтушенко и чем различались их мнения?",
  "evtyushenko-critics-view": "Как воспринимали автора и произведения Е. А. Евтушенко современники и потомки?",
  "ev-itogovoe-razmyshlenie": "Какой вывод о роли памяти и нравственного выбора позволяет сделать итоговое размышление о творчестве Е. А. Евтушенко?",
  "ev-sec-itogovoe-razmyshlenie-intro": "Какой главный вывод о творчестве Е. А. Евтушенко должно подвести итоговое размышление?",
  "ev-pismennoe-zadanie": "Какое письменное задание помогает выразить своё отношение к творчеству Е. А. Евтушенко?",
  "ev-sec-pismennoe-zadanie-intro": "Какие мысли о творчестве Е. А. Евтушенко нужно изложить в письменном задании?",
  "ev-sec-istochniki-2-2": "Какие источники стоит использовать при выполнении письменного задания по творчеству Е. А. Евтушенко и как оформлять ссылки на них?",
  "ev-zadaniya": "Какие умения анализа и творческого осмысления поэзии Е. А. Евтушенко развивают задания раздела?",
  "ev-sec-zadaniya-intro": "Что нужно знать о стихотворениях Е. А. Евтушенко, чтобы выполнить задания раздела?",
  "ev-zadanie-1-pismo-v-redaktsiyu": "Какую гражданскую позицию Е. А. Евтушенко нужно учесть, чтобы написать убедительное письмо в редакцию?",
  "ev-sec-zadanie-1-pismo-v-redaktsiyu-intro": "Почему письмо в редакцию – это форма диалога с эпохой Е. А. Евтушенко?",
  "ev-zadanie-2-monolog-vdovy": "Какие детали военных стихотворений Е. А. Евтушенко помогают передать в монологе вдовы боль утраты?",
  "ev-sec-zadanie-2-monolog-vdovy-intro": "Почему монолог вдовы – это голос всех потерявших на войне?",
  "ev-zadanie-3-reportazh-s-babego-yara": "Какие факты и образы стихотворения Е. А. Евтушенко «Бабий Яр» следует использовать в репортаже с места трагедии?",
  "ev-sec-zadanie-3-reportazh-s-babego-yara-intro": "Почему репортаж с Бабьего Яра – это возвращение к незаживающей ране?",
  "ev-zadanie-4-rech-na-otkrytii-pamyatnika": "Какие слова о памяти и ответственности живых перед погибшими уместны в речи на открытии памятника, если опираться на поэзию Е. А. Евтушенко?",
  "ev-sec-zadanie-4-rech-na-otkrytii-pamyatnika-intro": "Почему речь на открытии памятника – это долг перед погибшими?",
  "ev-obschie-rekomendatsii": "Какие общие рекомендации помогают выполнять письменные работы по творчеству Е. А. Евтушенко?",
  "ev-sec-obschie-rekomendatsii-intro": "Какие рекомендации следует учитывать при подготовке письменных ответов по текстам Е. А. Евтушенко?",
  "ev-zadaniya-s-proverkoy-iskusstvennogo-intellekta": "Каким требованиям должна отвечать письменная работа по Е. А. Евтушенко, чтобы проверка с помощью ИИ оценила понимание текста, а не умение его пересказывать?",
  "ev-sec-zadaniya-s-proverkoy-iskusstvennogo-intellekta-intro": "Почему проверка ИИ помогает увидеть сильные и слабые стороны анализа?",
  "ev-zadanie-1-retsenziya-na-voennoe-stihotvorenie": "Какие критерии анализа позволяют написать содержательную рецензию на военное стихотворение Е. А. Евтушенко?",
  "ev-sec-zadanie-1-retsenziya-na-voennoe-stihotvorenie-intro": "Почему рецензия – это форма диалога с поэтом о войне?",
  "ev-zadanie-2-emotsionalnyy-portret-geroya": "Какими деталями можно передать эмоциональное состояние лирического героя стихотворений Е. А. Евтушенко?",
  "ev-sec-zadanie-2-emotsionalnyy-portret-geroya-intro": "Почему эмоциональный портрет раскрывает глубину переживаний героя?",
  "ev-zadanie-3-otzyv-ot-litsa-veterana": "Что в военных стихах Е. А. Евтушенко ветеран признал бы правдой войны, а что вызвало бы у него возражения?",
  "ev-sec-zadanie-3-otzyv-ot-litsa-veterana-intro": "Почему отзыв ветерана – это голос тех, кто прошёл через войну?",
  "ev-zadanie-4-sravnitelnyy-otzyv": "Как сопоставить два стихотворения Е. А. Евтушенко по теме, интонации и авторской позиции в сравнительном отзыве?",
  "ev-sec-zadanie-4-sravnitelnyy-otzyv-intro": "Почему сравнительный анализ раскрывает единство творчества Е. А. Евтушенко?",
  "ev-kak-budet-otsenivatsya-rabota": "По каким критериям оценивается письменная работа по творчеству Е. А. Евтушенко?",
  "ev-sec-kak-budet-otsenivatsya-rabota-intro": "Почему понимание критериев оценки помогает лучше выполнить задание?",
  "ev-sravnitelnaya-tablitsa-i-zadanie": "Как заполнить сравнительную таблицу, сопоставляя стихотворения Е. А. Евтушенко по теме и авторской позиции?",
  "ev-sec-sravnitelnaya-tablitsa-i-zadanie-intro": "Почему сравнительная таблица – это инструмент глубокого анализа?",
  "ev-sec-sravnitelnaya-tablitsa": "Как сравнительная таблица помогает увидеть особенности творчества Е. А. Евтушенко?",
  "ev-sec-zadanie-dlya-studenta-1": "Какое задание для студента помогает углубить понимание Е. А. Евтушенко?",
  "ev-videomaterialy-razdela": "Что видеоматериалы раздела добавляют к образу Е. А. Евтушенко как поэта-исполнителя?",
  "ev-sec-videomaterialy-razdela-intro": "Как видеоматериалы помогают представить эпоху Е. А. Евтушенко и атмосферу его выступлений?",
  "ev-sec-video-1-e-a-evtushenko-chitaet-babiy-yar": "Что даёт слушателю видео, на котором Е. А. Евтушенко читает стихотворение «Бабий Яр»?",
  "ev-sec-video-2-vecher-v-politehnicheskom-muzee-poety-shestidesyatniki-1": "Что видео вечера в Политехническом музее показывает об атмосфере эпохи шестидесятников?",
  "ev-sec-video-3-trinadtsataya-simfoniya-d-d-shostakovicha-2": "Как видео о Тринадцатой симфонии Д. Д. Шостаковича связано со стихотворением Е. А. Евтушенко «Бабий Яр»?",
  "ev-sec-video-4-dokumentalnyy-film-ili-intervyu-o-e-a-evtushenko-3": "Что документальный фильм или интервью о Е. А. Евтушенко добавляют к его портрету?",
  "ev-sec-video-5-babiy-yar-segodnya-4": "Как видео о Бабьем Яре сегодня помогает понять актуальность стихов Е. А. Евтушенко?",
  "ev-istochniki-i-literatura": "Какие издания из списка литературы о Е. А. Евтушенко подходят для первого знакомства, а какие – для углублённого изучения его творчества?",
  "ev-sec-istochniki-i-literatura-intro": "Почему источники и литература необходимы для серьёзного изучения Е. А. Евтушенко?",
  "ev-sec-1-pervichnye-istochniki": "Какие первичные источники позволяют восстановить эпоху Е. А. Евтушенко и чем они ценнее пересказов?",
  "ev-sec-2-biograficheskie-istochniki-1": "Какие биографические источники содержат наиболее надёжные сведения о жизни Е. А. Евтушенко?",
  "ev-sec-3-nauchnye-i-kriticheskie-raboty-2": "Какие вопросы о поэтике Е. А. Евтушенко рассматривают научные и критические работы?",
  "ev-sec-4-materialy-o-babem-yare-3": "Какие материалы помогают понять исторический контекст стихотворения Е. А. Евтушенко «Бабий Яр»?",
  "ev-sec-5-o-trinadtsatoy-simfonii-d-d-shostakovicha-4": "Какие материалы о Тринадцатой симфонии Д. Д. Шостаковича связаны со стихотворением Е. А. Евтушенко «Бабий Яр»?",
  "ev-sec-6-onlayn-resursy-5": "Какие онлайн-ресурсы о Е. А. Евтушенко можно считать надёжными и как проверять размещённые на них сведения?",
  "ev-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-pervaya": "Какие страницы биографии, которых нет в учебниках, раскрывают Е. А. Евтушенко с новой стороны?",
  "ev-sec-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-pervaya-intro": "Какие малоизвестные факты биографии Е. А. Евтушенко меняют привычное представление о нём?",
  "ev-sec-kiev-den-kogda-poyavilsya-babiy-yar": "Как Киев и день появления стихотворения Е. А. Евтушенко «Бабий Яр» связаны с его рождением?",
  "ev-sec-pervoe-chtenie-babego-yara-1": "Каким было первое чтение стихотворения Е. А. Евтушенко «Бабий Яр» и почему оно стало событием?",
  "ev-sec-kogda-n-s-hruschev-kritikoval-e-a-evtushenko-lichno-2": "Когда Н. С. Хрущёв критиковал Е. А. Евтушенко лично и как это повлияло на поэта?",
  "ev-sec-druzhba-s-d-d-shostakovichem-i-rozhdenie-trinadtsatoy-simfonii-3": "Как дружба с Д. Д. Шостаковичем привела к рождению Тринадцатой симфонии?",
  "ev-sec-istochniki-4": "Какие источники позволяют узнать малоизвестные страницы биографии Е. А. Евтушенко и насколько им можно доверять?",
  "ev-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-vtoraya": "Какие ещё малоизвестные страницы биографии Е. А. Евтушенко помогают понять его позицию?",
  "ev-sec-stranitsy-biografii-kotoryh-net-v-uchebnikah-chast-vtoraya-intro": "Что нового о Е. А. Евтушенко добавляет вторая часть малоизвестных страниц его биографии?",
  "ev-sec-pismo-l-i-brezhnevu-o-chehoslovakii": "Что письмо Л. И. Брежневу о Чехословакии говорит о гражданской позиции Е. А. Евтушенко?",
  "ev-sec-a-a-voznesenskiy-i-pokolenie-shestidesyatnikov-1": "Как А. А. Вознесенский и поколение шестидесятников связаны с Е. А. Евтушенко?",
  "ev-sec-fotografiya-kak-vtoraya-professiya-2": "Как фотография как вторая профессия раскрывает взгляд Е. А. Евтушенко на мир?",
  "ev-sec-poslednie-razmyshleniya-o-voyne-3": "Какие последние размышления о войне оставил Е. А. Евтушенко?",
  "ev-sec-maloizvestnyy-fakt-pisma-ot-neznakomyh-frontovikov-4": "Какой малоизвестный факт о письмах от незнакомых фронтовиков раскрывает душу Е. А. Евтушенко?",
  "ev-sec-zadanie-dlya-studenta-5": "Какое задание для студента помогает углубить понимание скрытых страниц биографии?",
  "ev-sec-istochniki-6-3": "Какие материалы дополняют рассказ о малоизвестных страницах биографии Е. А. Евтушенко и что они меняют в его образе?",
  "evtyushenko-interactive": "Какие интерактивные приёмы позволяют вдумчиво прочитать стихотворения Е. А. Евтушенко, а не только запомнить их содержание?",
  "evtyushenko-interactive-methods": "Какие интерактивные приёмы позволяют читателю прожить эпоху Е. А. Евтушенко, а не просто узнать о ней?",
  "evtyushenko-slide-tasks": "Какие выводы о творчестве Е. А. Евтушенко нужно обобщить при работе с заданиями из слайдов?",
  "evtyushenko-summary": "Какие общие темы объединяют военные и философские стихотворения Е. А. Евтушенко?",
  "evtyushenko-final-summary": "Какое место занимает Е. А. Евтушенко в русской поэзии о Великой Отечественной войне и что остаётся главным в его наследии?",

  // ═══════════════════════════════════════════════════════════════
  // В. Л. КОНДРАТЬЕВ
  // ═══════════════════════════════════════════════════════════════
  "kondratyev": "Почему В. Л. Кондратьев писал о войне так, будто сам стоял в том окопе под Ржевом?",
  "kondratyev-author-sheet": "Как лист автора раскрывает правду войны через призму личного опыта В. Л. Кондратьева?",
  "kondratyev-intro": "Как объявление произведений В. Л. Кондратьева настраивает на серьёзный разговор о войне?",
  "kondratyev-obyavlenie-proizvedeniy": "Почему объявление произведений В. Л. Кондратьева – это приглашение к честному разговору о войне?",
  "kondratyev-ch-detstvo-voyna-vokrug": "Как детство, окружённое войной, сформировало взгляд В. Л. Кондратьева на мир?",
  "kondratyev-detstvo-voyna-vokrug": "Почему война вокруг детства стала для В. Л. Кондратьева уроком, который он не забыл никогда?",
  "kondratyev-ch-front-i-rozhdenie-pisatelya": "Как фронт и рождение писателя связаны в судьбе В. Л. Кондратьева?",
  "kondratyev-front-i-rozhdenie-pisatelya": "Почему фронт стал школой, которая научила В. Л. Кондратьева писать правду о войне?",
  "kondratyev-ch-pravda-voyny": "Какую правду войны и цену памяти открыл В. Л. Кондратьев в своих произведениях?",
  "kondratyev-pravda-voyny": "Почему правда войны и цена памяти – это центральная тема творчества В. Л. Кондратьева?",
  "kondratyev-ch-biography-facts": "Какие страницы биографии, которых нет в учебниках, раскрывают В. Л. Кондратьева с новой стороны?",
  "kondratyev-biography-facts": "Какие малоизвестные факты биографии В. Л. Кондратьева помогают понять его прозу?",
  "kondratyev-ch-rzhev": "Как Ржев стал местом, где родилась проза В. Л. Кондратьева?",
  "kondratyev-rzhev": "Почему Ржев – это не просто город, а символ всей трагедии войны в прозе В. Л. Кондратьева?",
  "kondratyev-ch-history-sashka": "Как создавалась повесть «Сашка» и почему она стала одним из главных произведений о войне?",
  "kondratyev-history-sashka": "Почему история создания повести «Сашка» помогает понять её глубину и правдивость?",
  "kondratyev-ch-sashka-introduction": "Как первое знакомство с повестью «Сашка» настраивает на серьёзный разговор о войне?",
  "kondratyev-sashka-introduction": "Почему первое знакомство с повестью В. Л. Кондратьева «Сашка» становится началом пути к пониманию правды о войне?",
  "kondratyev-ch-sashka-composition": "Как композиция и сюжет повести «Сашка» помогают раскрыть её главную идею?",
  "kondratyev-sashka-composition": "Почему композиция и сюжет повести В. Л. Кондратьева «Сашка» работают как единое целое?",
  "kondratyev-interactive": "Какие интерактивные приёмы помогают вдумчиво прочитать повесть В. Л. Кондратьева «Сашка», а не только пересказать её?",
  "kondratyev-interactive-methods": "Какие интерактивные приёмы помогают читателю прочувствовать фронтовую обстановку, описанную В. Л. Кондратьевым под Ржевом?",
  "kondratyev-slide-tasks": "Какие выводы о творчестве В. Л. Кондратьева нужно обобщить при работе с заданиями из слайдов?",
  "kondratyev-critics": "Как критики оценивали повесть В. Л. Кондратьева «Сашка» и чем их оценки помогают понять новизну его прозы о войне?",
  "kondratyev-critics-view": "Как воспринимали автора и произведения В. Л. Кондратьева современники и потомки?",
  "kondratyev-summary": "Какие общие мысли объединяют повесть В. Л. Кондратьева «Сашка» и рассказ «Знаменательная дата»?",
  "kondratyev-final-summary": "Что остаётся главным в наследии В. Л. Кондратьева как писателя-фронтовика и почему его проза не теряет значения для нового поколения читателей?",

    // ═══════════════════════════════════════════════════════════════
  // Б. Ш. ОКУДЖАВА
  // ═══════════════════════════════════════════════════════════════
  "okudzhava": "Почему Б. Ш. Окуджава выбрал тихую интонацию, когда вся страна говорила о войне громко и торжественно?",
  "okudzhava-photo-qr-ai": "Как негромкий голос Б. Ш. Окуджавы стал одним из самых узнаваемых в русской поэзии XX века?",
  "ok-intro": "Почему знакомство с Б. Ш. Окуджавой начинается не с дат, а с интонации его песен?",
  "ok-o-voyne-mozhno-govorit-tiho": "Почему шёпот оказывается в песнях Б. Ш. Окуджавы о войне сильнее торжественного марша?",
  "ok-pamyat-chelovek-intonatsiya": "Как память, человек и интонация сплетаются в единый узел в песнях Б. Ш. Окуджавы?",
  "ok-bio": "Как биография Б. Ш. Окуджавы помогает понять его военную лирику?",
  "ok-detstvo-i-semya": "Как детство и семья Б. Ш. Окуджавы стали фундаментом его взгляда на войну и человека?",
  "ok-frontovoy-opyt": "Как собственный фронтовой опыт позволил Б. Ш. Окуджаве заговорить о войне своим голосом?",
  "ok-posle-voyny-i-avtorskaya-pesnya": "Как послевоенная судьба Б. Ш. Окуджавы превратила его в родоначальника авторской песни?",
  "ok-extra": "Какие дополнительные материалы позволяют точнее услышать интонацию Б. Ш. Окуджавы?",
  "ok-stranitsy-biografii-kotoryh-net-v-uchebnikah": "Какие малоизвестные факты биографии Б. Ш. Окуджавы помогают лучше понять его военные песни?",
  "ok-detstvo-na-arbate": "Как арбатское детство Б. Ш. Окуджавы отразилось в его поэтическом мире?",
  "ok-kak-on-uznal-ob-areste-ottsa": "Как весть об аресте отца, которую Б. Ш. Окуджава носил в себе всю жизнь, отозвалась в его песнях?",
  "ok-shkolnyy-attestat-i-front": "Как школьный аттестат и фронт столкнулись в судьбе семнадцатилетнего Б. Ш. Окуджавы?",
  "ok-pervaya-pesnya": "Какой была первая песня Б. Ш. Окуджавы и чем объясняется её интонация?",
  "ok-otnosheniya-s-vysotskim": "Как складывались отношения Б. Ш. Окуджавы и В. С. Высоцкого, голоса которых звучали так похоже и так по-разному?",
  "ok-poslednie-gody-i-raspad-sssr": "Почему в последние годы Б. Ш. Окуджава говорил о войне иначе, чем в молодости?",
  "ok-maloizvestnyy-fakt": "Какой малоизвестный факт о Б. Ш. Окуджаве меняет представление о нём?",
  "ok-zadanie-dlya-studenta": "Какие знания о творчестве Б. Ш. Окуджавы нужно применить, чтобы выполнить предложенное студенту задание?",
  "ok-context": "Как контекст эпохи помогает понять, почему песни Б. Ш. Окуджавы стали событием?",
  "ok-kak-pisalas-do-svidaniya-malchiki": "Как создавалась песня Б. Ш. Окуджавы «До свидания, мальчики!» и почему она до сих пор звучит как прощание?",
  "ok-istoriya-nam-nuzhna-odna-pobeda": "Как создавалась песня Б. Ш. Окуджавы «Нам нужна одна победа» и какой смысл автор вкладывает в слово «победа»?",
  "ok-bumazhnyy-soldatik-i-spory-vokrug-nego": "Почему вокруг песни Б. Ш. Окуджавы «Бумажный солдатик» до сих пор идут споры и в чём их причина?",
  "ok-magnitofonnaya-kultura": "Как магнитофонная культура СССР сделала Б. Ш. Окуджаву голосом целого поколения?",
  "ok-reaktsiya-frontovikov": "Почему фронтовики узнавали в песнях Б. Ш. Окуджавы собственный опыт?",
  "ok-neozhidannaya-detal": "Что неожиданная деталь биографии Б. Ш. Окуджавы говорит о его поэтике?",
  "ok-works": "Чем военная лирика Б. Ш. Окуджавы отличается от других произведений о войне?",
  "ok-obschaya-harakteristika-voennoy-liriki": "Как общая характеристика военной лирики Б. Ш. Окуджавы помогает увидеть её уникальность?",
  "ok-do-svidaniya-malchiki": "Почему песня «До свидания, мальчики!» стала реквиемом целому поколению?",
  "ok-nam-nuzhna-odna-pobeda": "Какую победу имеет в виду автор в песне Б. Ш. Окуджавы «Нам нужна одна победа»?",
  "ok-bumazhnyy-soldatik": "Как песня Б. Ш. Окуджавы «Бумажный солдатик» превратилась в притчу о хрупкости человека на войне?",
  "ok-ya-vnov-potrechalsya-s-nadezhdoy": "Что символизирует встреча лирического героя с Надеждой в песне Б. Ш. Окуджавы «Я вновь повстречался с Надеждой»?",
  "ok-obschiy-vyvod": "Какой общий вывод можно сделать после знакомства с военной лирикой Б. Ш. Окуджавы?",
  "ok-problems": "Какие проблемы поднимает Б. Ш. Окуджава в песнях о войне и почему они остаются острыми сегодня?",
  "ok-voyna-i-hrupkost-cheloveka": "Как война и хрупкость человека становятся центральной темой песен Б. Ш. Окуджавы?",
  "ok-pamyat-kak-forma-vernosti": "Почему Б. Ш. Окуджава считает память формой верности и кому, по его песням, нужно оставаться верным?",
  "ok-tihiy-golos-protiv-gromkoy-epohi": "Как тихий голос Б. Ш. Окуджавы противостоит громкой эпохе?",
  "ok-lichnoe-i-istoricheskoe": "Что рождается из соединения личного и исторического в песнях Б. Ш. Окуджавы?",
  "ok-nadezhda-kak-vybor": "Почему в творчестве Б. Ш. Окуджавы надежда становится не чувством, а нравственным выбором?",
  "ok-pismennoe-zadanie-dlya-studenta": "Какие выводы о песнях Б. Ш. Окуджавы нужно изложить в письменном задании и чем их подкрепить?",
  "ok-reflection": "Какая информация для раздумий помогает глубже услышать Б. Ш. Окуджаву?",
  "ok-mozhno-li-govorit-o-tragedii-krasivo": "Какой ответ на вопрос, можно ли говорить о трагедии красиво, даёт творчество Б. Ш. Окуджавы?",
  "ok-mozhet-li-pesnya-zamenit-zhivuyu-pamyat": "Может ли песня заменить живую память и что отвечает на этот вопрос Б. Ш. Окуджава?",
  "ok-chto-znachit-byt-neofitsialnym-poetom": "Какую цену платил Б. Ш. Окуджава за право оставаться неофициальным поэтом?",
  "ok-voprosy-dlya-pismennogo-razmyshleniya": "Какие вопросы о войне и памяти ставят песни Б. Ш. Окуджавы и как на них ответить в письменном размышлении?",
  "ok-questions": "Как вопросы по произведениям Б. Ш. Окуджавы помогают перейти от впечатления от песни к её анализу?",
  "ok-uroven-1-ponimanie-teksta": "Как первый уровень понимания текста открывает мир Б. Ш. Окуджавы?",
  "ok-uroven-2-analiz-i-interpretatsiya": "Какие особенности мастерства Б. Ш. Окуджавы выявляет анализ его песен на втором уровне?",
  "ok-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о Б. Ш. Окуджаве?",
  "okudzhava-interactive": "Какие интерактивные приёмы позволяют услышать в песнях Б. Ш. Окуджавы интонацию личного воспоминания?",
  "okudzhava-interactive-methods": "Какие приёмы позволяют сопоставить исполнение песен Б. Ш. Окуджавы с их текстом при работе в группе?",
  "okudzhava-slide-tasks": "Какие главные мысли о творчестве Б. Ш. Окуджавы нужно выделить, работая с заданиями из слайдов?",
  "okudzhava-critics": "Как критики оценивали особую интонацию песен Б. Ш. Окуджавы и их место в литературе о войне?",
  "okudzhava-critics-view": "Почему современники и потомки воспринимали песни Б. Ш. Окуджавы по-разному и что объясняет эти различия?",
  "ok-chto-ostaetsya": "Что остаётся от наследия Б. Ш. Окуджавы и почему его песни звучат и сегодня?",
  "ok-mesto-b-sh-okudzhavy-v-literature-o-voyne": "Какое место занимает Б. Ш. Окуджава в литературе о войне и чем оно уникально?",
  "ok-itogovye-tezisy": "Какие тезисы наиболее точно подводят итог изучения творчества Б. Ш. Окуджавы?",
  "ok-finalnoe-pismennoe-zadanie": "Как финальное письменное задание завершает работу с творчеством Б. Ш. Окуджавы?",
  "okudzhava-summary": "Что объединяет песни Б. Ш. Окуджавы о войне и о мирной жизни в единый поэтический мир?",
  "okudzhava-final-summary": "Какое отношение к войне и памяти передаёт творчество Б. Ш. Окуджавы и что уносит с собой читатель после его изучения?",

  // ═══════════════════════════════════════════════════════════════
  // А. Н. РЫБАКОВ
  // ═══════════════════════════════════════════════════════════════
  "rybakov": "Почему А. Н. Рыбаков писал о войне через судьбы обычных людей и что это меняет в нашем понимании эпохи?",
  "rybakov-author-sheet": "Как лист автора раскрывает противоречия советского патриотизма в творчестве А. Н. Рыбакова?",
  "rybakov-ch-biografiya-a-n-rybakova": "Какие события биографии А. Н. Рыбакова определили тематику и нравственную позицию его прозы?",
  "rybakov-biografiya-a-n-rybakova": "Как биография А. Н. Рыбакова сплетается с историей XX века?",
  "rybakov-ch-voyna-v-proizvedeniyah-a-n-rybakova": "Какую правду о войне открывает А. Н. Рыбаков и почему её важно услышать?",
  "rybakov-voyna-v-proizvedeniyah-a-n-rybakova": "Почему А. Н. Рыбаков показывает войну без прикрас и ложного пафоса?",
  "rybakov-ch-deti-arbata": "Почему роман А. Н. Рыбакова «Дети Арбата» стал одним из самых обсуждаемых произведений о предвоенной эпохе?",
  "rybakov-deti-arbata": "Что в романе А. Н. Рыбакова «Дети Арбата» важнее сюжета?",
  "rybakov-ch-uroven-1-bazovyy-znanie-i-vosproizvedenie-teksta": "Как первый уровень работы с текстом помогает войти в мир А. Н. Рыбакова?",
  "rybakov-uroven-1-bazovyy-znanie-i-vosproizvedenie-teksta": "Какие сведения о произведениях А. Н. Рыбакова необходимо уметь воспроизвести на базовом уровне, чтобы перейти к анализу?",
  "rybakov-ch-uroven-2-sredniy-analiz-i-interpretatsiya": "Какие тайны мастерства А. Н. Рыбакова раскрывает второй уровень анализа?",
  "rybakov-uroven-2-sredniy-analiz-i-interpretatsiya": "Какие особенности прозы А. Н. Рыбакова выявляет анализ на втором уровне?",
  "rybakov-ch-uroven-3-prodvinutyy-sintez-otsenka-i-aktualizatsiya": "Как третий уровень помогает синтезировать, оценить и актуализировать творчество А. Н. Рыбакова?",
  "rybakov-uroven-3-prodvinutyy-sintez-otsenka-i-aktualizatsiya": "Как можно оценить звучание прозы А. Н. Рыбакова для современного читателя и обосновать свою позицию?",
  "rybakov-interactive": "Какие интерактивные приёмы помогают глубже изучить прозу А. Н. Рыбакова, а не ограничиваться пересказом?",
  "rybakov-interactive-methods": "Как интерактивные методы помогают увидеть исторические обстоятельства, которые изображает в своей прозе А. Н. Рыбаков?",
  "rybakov-slide-tasks": "Какие главные положения о творчестве А. Н. Рыбакова нужно обобщить, работая с заданиями из слайдов?",
  "rybakov-critics": "Как критики оценивали прозу А. Н. Рыбакова и на чём основывались их оценки?",
  "rybakov-critics-view": "Как современники и потомки воспринимали прозу А. Н. Рыбакова и что менялось в этом восприятии?",
  "rybakov-summary": "Что объединяет произведения А. Н. Рыбакова в единое целое?",
  "rybakov-final-summary": "Какой главный урок оставляет проза А. Н. Рыбакова современному читателю?",

  // ═══════════════════════════════════════════════════════════════
  // А. Т. ТВАРДОВСКИЙ
  // ═══════════════════════════════════════════════════════════════
  "tvardovsky": "Почему А. Т. Твардовский писал о войне голосом простого солдата и почему этот голос оказался вечным?",
  "tvardovsky-photo-qr-ai": "Как долг памяти и нравственная ответственность перед погибшими становятся центром поэзии А. Т. Твардовского?",
  "znakomstvo-s-avtorom": "Почему знакомство с А. Т. Твардовским начинается с его фронтового пути?",
  "biografiya-a-t-tvardokogo": "Как биография А. Т. Твардовского помогает понять его поэтический мир?",
  "perehod-ot-biografii-k-proizvedeniyu": "Как знание биографии помогает перейти к чтению поэмы А. Т. Твардовского «Василий Тёркин»?",
  "stranitsy-biografii-kotoryh-net-v-uchebnikah": "Какие малоизвестные страницы биографии А. Т. Твардовского важны для понимания его творчества?",
  "poema-vasiliy-terkin-1941-1945": "Почему поэма А. Т. Твардовского «Василий Тёркин» стала живой частью фронтовой жизни?",
  "vasiliy-terkin-bez-finala": "Почему поэма А. Т. Твардовского «Василий Тёркин» создавалась без заранее продуманного финала и как это влияет на её восприятие?",
  "reaktsiya-soldat": "Как солдаты реагировали на поэму А. Т. Твардовского «Василий Тёркин» и почему считали героя своим?",
  "zamysel-i-istoriya-sozdaniya": "Как возник замысел поэмы А. Т. Твардовского «Василий Тёркин» и почему герой стал именно таким?",
  "zhanr-i-struktura": "Как жанр и структура поэмы помогают передать живую фронтовую правду?",
  "obraz-vasiliya-terkina": "Почему А. Т. Твардовский сделал героя поэмы «Василий Тёркин» обычным человеком и в чём сила этой обычности?",
  "pereprava-cherez-reku": "Почему глава «Переправа» стала одним из самых трагических эпизодов поэмы?",
  "interesnoe-iz-proizvedeniya": "Какие малоизвестные факты о поэме А. Т. Твардовского «Василий Тёркин» помогают лучше понять образ героя?",
  "nratvennyy-vybor-na-voyne": "Как нравственный выбор на войне становится главным вопросом поэмы А. Т. Твардовского?",
  "informatsiya-dlya-razdumiy": "Какие вопросы А. Т. Твардовский оставляет читателю для самостоятельных размышлений?",
  "uroven-1-ponimanie-teksta": "Как первый уровень погружения в текст помогает услышать голос Тёркина?",
  "uroven-2-analiz-i-interpretatsiya": "Какие особенности художественного мира А. Т. Твардовского выявляет анализ на втором уровне?",
  "uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о А. Т. Твардовском?",
  "tvardovsky-trainer-1": "Какие знания о поэме А. Т. Твардовского «Василий Тёркин» проверяет литературная мастерская и как к ней подготовиться?",
  "tvardovsky-trainer-3": "Что глава «Переправа» поэмы А. Т. Твардовского «Василий Тёркин» говорит о цене войны?",
  "tvardovsky-trainer-4": "Какую роль играет музыка в фронтовом братстве в главе «Гармонь» поэмы А. Т. Твардовского «Василий Тёркин»?",
  "tvardovsky-trainer-5": "Как поединок со Смертью становится утверждением жизни в поэме А. Т. Твардовского?",
  "stihotvorenie-ya-ubit-podo-rzhevom-1946": "Почему стихотворение «Я убит подо Ржевом» стало реквиемом безымянному солдату?",
  "tvardovsky-final": "Какой вывод о значении творчества А. Т. Твардовского для литературы о войне позволяет сделать обобщение?",
  "tvardovsky-interactive-methods": "Какие интерактивные приёмы подходят для работы с поэмой А. Т. Твардовского «Василий Тёркин» и чем они полезны?",
  "tvardovsky-critics": "Как критики оценивали поэму А. Т. Твардовского «Василий Тёркин» и почему народность героя считалась её главным достоинством?",
  "tvardovsky-critics-view": "Как современники и потомки воспринимали творчество А. Т. Твардовского и какие оценки со временем изменились?",

  // ═══════════════════════════════════════════════════════════════
  // Б. Л. ВАСИЛЬЕВ
  // ═══════════════════════════════════════════════════════════════
  "vasilyev": "Почему Б. Л. Васильев писал о войне через женские судьбы и что это меняет в нашем понимании войны?",
  "vasilyev-author-sheet": "Как лист автора раскрывает тему памяти сердца как преодоления забвения и смерти?",
  "vasilyev-ch-biografiya-b-l-vasileva": "Какие события биографии Б. Л. Васильева повлияли на его прозу о войне?",
  "vasilyev-biografiya-b-l-vasileva": "Как биография Б. Л. Васильева сплетается с его литературным миром?",
  "vasilyev-ch-voyna-v-proizvedeniyah-b-l-vasileva": "Какую правду о войне открывает Б. Л. Васильев и почему её важно услышать?",
  "vasilyev-voyna-v-proizvedeniyah-b-l-vasileva": "Почему Б. Л. Васильев показывает войну через хрупкость и достоинство человека?",
  "vasilyev-ch-povest-borisa-vasileva-a-zori-zdes-tihie-opublikovannaya-v-1969-godu-sta": "Почему повесть Б. Л. Васильева «А зори здесь тихие...» остаётся одним из самых известных произведений о женщинах на войне?",
  "vasilyev-povest-borisa-vasileva-a-zori-zdes-tihie-opublikovannaya-v-1969-godu-sta": "Почему в повести Б. Л. Васильева «А зори здесь тихие...» главными героинями стали пять девушек-зенитчиц?",
  "vasilyev-ch-povest-borisa-vasileva-a-zori-zdes-tihie-predstavlyaet-soboy-unikalnoe-y": "Какие особенности построения повести Б. Л. Васильева «А зори здесь тихие...» усиливают её трагизм?",
  "vasilyev-povest-borisa-vasileva-a-zori-zdes-tihie-predstavlyaet-soboy-unikalnoe-y": "Чем особенна композиция повести Б. Л. Васильева «А зори здесь тихие...»?",
  "vasilyev-ch-povest-borisa-vasileva-a-zori-zdes-tihie-poyavivshis-na-ishode-ottepelno": "Какое значение и какие экранизации получила повесть Б. Л. Васильева «А зори здесь тихие...»?",
  "vasilyev-povest-borisa-vasileva-a-zori-zdes-tihie-poyavivshis-na-ishode-ottepelno": "Почему повесть Б. Л. Васильева «А зори здесь тихие...» экранизировали несколько раз и что менялось в каждой экранизации?",
  "vasilyev-ch-v-spiskah-ne-znachilsya": "Почему повесть «В списках не значился» стала гимном безымянному героизму?",
  "vasilyev-v-spiskah-ne-znachilsya": "Что история Николая Плужникова в повести Б. Л. Васильева «В списках не значился» говорит о стойкости человека?",
  "vasilyev-ch-zavtra-byla-voyna": "Как повесть «Завтра была война» показывает, как война входит в мир подростков?",
  "vasilyev-zavtra-byla-voyna": "Почему в повести Б. Л. Васильева «Завтра была война» война внезапно врывается в жизнь школьников?",
  "vasilyev-ch-v-okopah-stalingrada": "Почему повесть «В окопах Сталинграда» стала одним из первых честных голосов о войне?",
  "vasilyev-v-okopah-stalingrada": "Какое место занимает тема Сталинграда в разделе о творчестве Б. Л. Васильева?",
  "vasilyev-ch-uroven-1-bazovyy-znanie-i-ponimanie-teksta": "Как первый уровень работы с текстом помогает войти в мир Б. Л. Васильева?",
  "vasilyev-uroven-1-bazovyy-znanie-i-ponimanie-teksta": "Какие факты о текстах Б. Л. Васильева необходимо знать и понимать, чтобы перейти к их анализу?",
  "vasilyev-ch-uroven-2-sredniy-analiz-i-interpretatsiya": "Какие тайны мастерства Б. Л. Васильева раскрывает второй уровень анализа?",
  "vasilyev-uroven-2-sredniy-analiz-i-interpretatsiya": "Какие особенности прозы Б. Л. Васильева выявляет анализ на втором уровне?",
  "vasilyev-ch-uroven-3-prodvinutyy-sintez-otsenka-i-kontekst": "Как третий уровень помогает синтезировать, оценить и contextualize творчество Б. Л. Васильева?",
  "vasilyev-uroven-3-prodvinutyy-sintez-otsenka-i-kontekst": "Как проза Б. Л. Васильева звучит для современного читателя и как обосновать это суждение?",
  "vasilyev-ch-literaturovedcheskie-issledovaniya": "Какие выводы литературоведческих исследований о прозе Б. Л. Васильева наиболее важны?",
  "vasilyev-literaturovedcheskie-issledovaniya": "Какие выводы литературоведов о прозе Б. Л. Васильева наиболее важны и чем они подтверждаются?",
  "vasilyev-interactive": "Какие интерактивные приёмы позволяют вдумчиво прочитать прозу Б. Л. Васильева?",
  "vasilyev-interactive-methods": "Как интерактивные методы помогают прочувствовать нравственный выбор героев Б. Л. Васильева?",
  "vasilyev-slide-tasks": "Какие главные положения о творчестве Б. Л. Васильева нужно обобщить, работая с заданиями из слайдов?",
  "vasilyev-critics": "Как критики оценивали прозу Б. Л. Васильева и какие её черты выделяли?",
  "vasilyev-critics-view": "Как современники и потомки воспринимали прозу Б. Л. Васильева?",
  "vasilyev-summary": "Что объединяет произведения Б. Л. Васильева о войне в единое целое?",
  "vasilyev-final-summary": "Какой нравственный итог остаётся у читателя после знакомства с прозой Б. Л. Васильева?",

  // ═══════════════════════════════════════════════════════════════
  // В. С. ВЫСОЦКИЙ
  // ═══════════════════════════════════════════════════════════════
  "vysotsky": "Почему В. С. Высоцкий пел о войне, хотя сам не был фронтовиком, и почему ему поверили те, кто прошёл через огонь?",
  "vysotsky-photo-qr-ai": "Как чужая боль становится своей в песнях В. С. Высоцкого?",
  "vysotsky-intro": "Какие произведения В. С. Высоцкого объявлены в начале раздела и почему знакомство с поэтом начинается с них?",
  "vysotsky-obyavlenie-proizvedeniy": "Как объявление произведений настраивает на серьёзный разговор о В. С. Высоцком?",
  "vysotsky-ch-detstvo-voyna-vokrug": "Как детство, окружённое войной, сформировало взгляд В. С. Высоцкого на мир?",
  "vysotsky-detstvo-voyna-vokrug": "Как военные детские впечатления В. С. Высоцкого отразились в его песнях о войне?",
  "vysotsky-ch-teatr-i-pervye-pesni-rozhdenie-golosa": "Как театр и первые песни стали рождением голоса В. С. Высоцкого?",
  "vysotsky-teatr-i-pervye-pesni-rozhdenie-golosa": "Как театр повлиял на поэтический голос В. С. Высоцкого?",
  "vysotsky-ch-vlast-svoboda-i-tsena-golosa": "Как власть, свобода и цена голоса сплетаются в судьбе В. С. Высоцкого?",
  "vysotsky-vlast-svoboda-i-tsena-golosa": "Какую цену заплатил В. С. Высоцкий за свободу своего голоса?",
  "vysotsky-ch-stranitsy-biografii-kotoryh-net-v-uchebnikah": "Какие малоизвестные страницы биографии В. С. Высоцкого важны для понимания его песен?",
  "vysotsky-stranitsy-biografii-kotoryh-net-v-uchebnikah": "Какие малоизвестные факты биографии В. С. Высоцкого помогают понять его отношение к войне?",
  "vysotsky-vstrechi-s-veteranami": "Как встречи с ветеранами повлияли на военные песни В. С. Высоцкого?",
  "vysotsky-reaktsiya-veteranov-na-ego-voennye-pesni": "Почему ветераны воспринимали военные песни В. С. Высоцкого как свои?",
  "vysotsky-voennye-roli-v-kino": "Как военные роли в кино помогли В. С. Высоцкому войти в тему войны?",
  "vysotsky-pisma-ot-slushateley-i-frontovikov": "О чём писали В. С. Высоцкому слушатели и фронтовики и что эти письма говорят о его песнях?",
  "vysotsky-smert-v-s-vysotskogo-i-reaktsiya-strany": "Как страна отреагировала на смерть В. С. Высоцкого и что эта реакция говорит о его значении?",
  "vysotsky-odin-maloizvestnyy-fakt": "Какой малоизвестный факт о В. С. Высоцком меняет представление о нём?",
  "vysotsky-zadanie-dlya-studenta": "Какие знания о песнях В. С. Высоцкого нужно применить, чтобы выполнить задание?",
  "vysotsky-ch-pochemu-voyna-ego-glazami": "Почему война, увиденная глазами В. С. Высоцкого, так отличается от других голосов?",
  "vysotsky-pochemu-voyna-ego-glazami": "Чем война, увиденная глазами В. С. Высоцкого, отличается от войны, описанной фронтовиками?",
  "vysotsky-ch-opisanie-proizvedeniy": "Как описание произведений помогает войти в военную лирику В. С. Высоцкого?",
  "vysotsky-opisanie-proizvedeniy": "Какие художественные приёмы помогают В. С. Высоцкому передать в песнях о войне опыт, которого у него не было?",
  "vysotsky-on-ne-vernulsya-iz-boya": "Почему песня «Он не вернулся из боя» стала одной из самых пронзительных у В. С. Высоцкого?",
  "vysotsky-my-vraschaem-zemlyu": "Какой смысл автор вкладывает в слова о тех, кто вращает Землю, в песне В. С. Высоцкого «Мы вращаем Землю»?",
  "vysotsky-shtrafnye-batalony": "Как песня «Штрафные батальоны» стала голосом тех, кого замалчивали?",
  "vysotsky-bratskie-mogily": "Почему песня В. С. Высоцкого «Братские могилы» так важна для памяти о войне?",
  "vysotsky-pesnya-o-zemle": "Как песня В. С. Высоцкого «Песня о земле» становится гимном земле, за которую воевали?",
  "vysotsky-vysota": "Какую цену победы раскрывает песня В. С. Высоцкого «Высота»?",
  "vysotsky-obschiy-vyvod": "Какой общий вывод можно сделать после знакомства с военной лирикой В. С. Высоцкого?",
  "vysotsky-ch-chelovek-epohi-dva-vzglyada": "Какие два взгляда на В. С. Высоцкого сопоставляются в разделе и чем они дополняют друг друга?",
  "vysotsky-chelovek-epohi-dva-vzglyada": "Какие два взгляда на В. С. Высоцкого представлены в разделе и чем они дополняют друг друга?",
  "vysotsky-vzglyad-iznutri-epohi": "Как взгляд изнутри эпохи помогает понять В. С. Высоцкого?",
  "vysotsky-vzglyad-avtora": "Какую оценку творчеству В. С. Высоцкого даёт авторский взгляд раздела и на чём она основана?",
  "vysotsky-chto-izmenilos-so-vremenem": "Что изменилось со временем в восприятии В. С. Высоцкого и почему его голос звучит всё громче?",
  "vysotsky-kak-prochitannoe-menyaet-mirovozzrenie": "Как знакомство с творчеством В. С. Высоцкого меняет мировоззрение читателя?",
  "vysotsky-ch-kak-eto-sozdavalos": "Как создавались военные песни В. С. Высоцкого и какой этап работы над ними был самым важным?",
  "vysotsky-kak-eto-sozdavalos": "Как история создания военных песен В. С. Высоцкого помогает понять их замысел?",
  "vysotsky-istoriya-on-ne-vernulsya-iz-boya": "Какова история песни В. С. Высоцкого «Он не вернулся из боя» и почему она так важна?",
  "vysotsky-shtrafnye-batalony-i-reaktsiya-veteranov": "Что услышали ветераны в песне В. С. Высоцкого «Штрафные батальоны»?",
  "vysotsky-kak-v-s-vysotskiy-gotovilsya-k-voennym-pesnyam": "Как В. С. Высоцкий готовился к работе над военными песнями и почему подготовка была такой серьёзной?",
  "vysotsky-pervoe-ispolnenie-bratskih-mogil": "Что реакция слушателей на первое исполнение песни В. С. Высоцкого «Братские могилы» говорит о силе этой песни?",
  "vysotsky-magnitofonnye-zapisi-voennyh-pesen": "Как магнитофонные записи военных песен сделали В. С. Высоцкого голосом поколения?",
  "vysotsky-reaktsiya-ofitsialnoy-kritiki": "Почему реакция официальной критики на творчество В. С. Высоцкого была противоречивой?",
  "vysotsky-odin-neozhidannyy-fakt": "Какой неожиданный факт о В. С. Высоцком меняет представление о нём?",
  "vysotsky-ch-problemy-proizvedeniy": "Какие нравственные проблемы поднимают военные песни В. С. Высоцкого?",
  "vysotsky-problemy-proizvedeniy": "Какие нравственные проблемы поднимает В. С. Высоцкий в военных песнях?",
  "vysotsky-chelovek-i-voyna": "Как В. С. Высоцкий показывает человека на войне и почему этот образ стал центральным в его военных песнях?",
  "vysotsky-tsena-pobedy-i-nevidimye-poteri": "Что говорит В. С. Высоцкий о цене победы и невидимых потерях?",
  "vysotsky-pamyat-kak-fizicheskoe-oschuschenie": "Как память становится у В. С. Высоцкого физическим ощущением и что это меняет в восприятии войны?",
  "vysotsky-pravo-govorit-o-voyne": "Как В. С. Высоцкий заслужил право говорить о войне?",
  "vysotsky-gosudarstvo-i-soldat": "Как в песнях В. С. Высоцкого соотносятся судьба рядового солдата и воля государства?",
  "vysotsky-pismennoe-zadanie-dlya-studenta": "Какие выводы о песнях В. С. Высоцкого нужно изложить в письменном задании и чем их подтвердить?",
  "vysotsky-ch-informatsiya-dlya-razdumiy": "Какая информация для раздумий помогает глубже услышать В. С. Высоцкого?",
  "vysotsky-informatsiya-dlya-razdumiy": "Какие вопросы В. С. Высоцкий оставляет слушателю для самостоятельных размышлений?",
  "vysotsky-voprosy-dlya-pismennogo-razmyshleniya-studenta": "Какие вопросы о войне, памяти и совести ставят песни В. С. Высоцкого перед слушателем?",
  "vysotsky-ch-voprosy-po-proizvedeniyam": "Как вопросы по песням В. С. Высоцкого помогают перейти от пересказа сюжета к анализу авторской позиции?",
  "vysotsky-voprosy-po-proizvedeniyam": "Какие вопросы к песням В. С. Высоцкого позволяют проверить, как студент понял образ лирического героя?",
  "vysotsky-uroven-1-ponimanie-teksta": "Как первый уровень понимания текста открывает мир В. С. Высоцкого?",
  "vysotsky-pismennoe-zadanie-posle-urovnya-1": "Какие знания о песнях В. С. Высоцкого, усвоенные на первом уровне, необходимо показать в письменной работе?",
  "vysotsky-ch-uroven-2-analiz-i-interpretatsiya": "Какие тайны мастерства В. С. Высоцкого раскрывает второй уровень анализа?",
  "vysotsky-uroven-2-analiz-i-interpretatsiya": "Какие особенности песен В. С. Высоцкого выявляет анализ на втором уровне?",
  "vysotsky-pismennoe-zadanie-posle-urovnya-2": "Какой анализ песен В. С. Высоцкого, выполненный на втором уровне, должен быть представлен в письменной работе?",
  "vysotsky-ch-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о В. С. Высоцком?",
  "vysotsky-uroven-3-suzhdenie-i-pozitsiya": "Какую собственную позицию о творчестве В. С. Высоцкого должен сформулировать студент на третьем уровне?",
  "vysotsky-pismennoe-zadanie-posle-urovnya-3": "Какую собственную позицию о наследии В. С. Высоцкого нужно обосновать в письменной работе третьего уровня?",
  "vysotsky-ch-zadaniya": "Какие умения анализа песен В. С. Высоцкого развивают задания раздела?",
  "vysotsky-zadaniya": "Какие навыки анализа песен В. С. Высоцкого развивают задания раздела?",
  "vysotsky-zadanie-1-dnevnik-soldata": "Какие детали быта и переживания солдата, известные из песен В. С. Высоцкого, нужно передать в дневнике?",
  "vysotsky-zadanie-2-pismo-domoy": "Какие чувства и подробности фронтовой жизни, о которых поёт В. С. Высоцкий, нужно отразить в письме домой?",
  "vysotsky-zadanie-3-reportazh-s-bratskoy-mogily": "Какие образы песни В. С. Высоцкого «Братские могилы» следует положить в основу репортажа с братской могилы?",
  "vysotsky-zadanie-4-tekst-dlya-pamyatnoy-tablichki": "Какими словами можно коротко и точно выразить память о погибших на памятной табличке, опираясь на песни В. С. Высоцкого?",
  "vysotsky-ch-zadaniya-s-proverkoy-iskusstvennogo-intellekta": "Как с помощью проверки ИИ можно оценить понимание песен В. С. Высоцкого, а не знание фактов?",
  "vysotsky-zadaniya-s-proverkoy-iskusstvennogo-intellekta": "Каким требованиям должна отвечать письменная работа о песнях В. С. Высоцкого, чтобы проверка с помощью ИИ оценила понимание, а не пересказ?",
  "vysotsky-zadanie-1-retsenziya-na-voennuyu-pesnyu": "Какие критерии нужно учесть, чтобы написать рецензию на военную песню В. С. Высоцкого?",
  "vysotsky-zadanie-2-emotsionalnyy-portret-geroya": "Какими деталями можно передать эмоциональное состояние героя песен В. С. Высоцкого?",
  "vysotsky-zadanie-3-otzyv-ot-litsa-veterana": "Что в военных песнях В. С. Высоцкого ветеран признал бы правдой, а что вызвало бы у него возражения?",
  "vysotsky-zadanie-4-sravnitelnyy-otzyv": "Как сопоставить две песни В. С. Высоцкого по теме, интонации и авторской позиции?",
  "vysotsky-interactive": "Какие интерактивные приёмы позволяют вдумчиво услышать песни В. С. Высоцкого?",
  "vysotsky-interactive-methods": "Как совместное прослушивание песен В. С. Высоцкого и их обсуждение помогают услышать интонацию автора?",
  "vysotsky-slide-tasks": "Какие главные положения о творчестве В. С. Высоцкого нужно обобщить, работая с заданиями из слайдов?",
  "vysotsky-ch-videomaterialy-razdela": "Что видеоматериалы добавляют к пониманию манеры исполнения и личности В. С. Высоцкого?",
  "vysotsky-videomaterialy-razdela": "Что видеоматериалы раздела добавляют к пониманию личности и манеры исполнения В. С. Высоцкого?",
  "vysotsky-video-1-ispolnenie-voennyh-pesen-v-s-vysotskogo": "Как видео исполнения военных песен помогает почувствовать голос В. С. Высоцкого?",
  "vysotsky-video-2-dokumentalnyy-film-ili-intervyu-o-v-s-vysotskom": "Что документальный фильм или интервью добавляют к образу В. С. Высоцкого?",
  "vysotsky-video-3-kinorol-v-s-vysotskogo-voennoy-tematiki": "Как кинороль В. С. Высоцкого военной тематики помогает понять его?",
  "vysotsky-video-4-pohorony-v-s-vysotskogo-i-svidetelstva-o-proschanii": "Что свидетельства о прощании с В. С. Высоцким говорят о масштабе его влияния на современников?",
  "vysotsky-video-finalnyy-akkord-razdela-zhivoe-ispolnenie": "Как живое исполнение становится финальным аккордом раздела о В. С. Высоцком?",
  "vysotsky-ch-istochniki-i-literatura": "Какие источники из списка литературы нужны для проверки сведений о жизни и творчестве В. С. Высоцкого?",
  "vysotsky-istochniki-i-literatura": "Какие виды источников о В. С. Высоцком – воспоминания, документы, научные работы – следует использовать вместе и почему?",
  "vysotsky-ch-pervichnye-istochniki": "Какие первичные источники позволяют восстановить эпоху В. С. Высоцкого и чем они ценнее пересказов?",
  "vysotsky-pervichnye-istochniki": "Чем первичные источники о В. С. Высоцком отличаются от более поздних воспоминаний и пересказов?",
  "vysotsky-v-s-vysotskiy-sochineniya-v-dvuh-tomah": "Как издание «Сочинения в двух томах» помогает увидеть В. С. Высоцкого целиком?",
  "vysotsky-v-s-vysotskiy-nerv": "Что сборник В. С. Высоцкого «Нерв» говорит о его поэтике?",
  "vysotsky-audiozapisi-kontsertov-v-s-vysotskogo-1960-1970-h-godov": "Как аудиозаписи концертов 1960-1970-х годов помогают услышать В. С. Высоцкого?",
  "vysotsky-pesni-on-ne-vernulsya-iz-boya-my-vraschaem-zemlyu-shtrafnye-b": "Что даёт совместное прослушивание песен В. С. Высоцкого «Он не вернулся из боя», «Мы вращаем Землю», «Штрафные батальоны», «Братские могилы» и «Песня о земле»?",
  "vysotsky-ch-biograficheskie-istochniki": "Какие биографические источники о В. С. Высоцком наиболее надёжны?",
  "vysotsky-biograficheskie-istochniki": "Какие биографические источники о В. С. Высоцком наиболее надёжны и как проверять их сведения?",
  "vysotsky-vl-novikov-vysotskiy": "Как книга Вл. Новикова «Высоцкий» помогает понять В. С. Высоцкого как поэта?",
  "vysotsky-m-vladi-vladimir-ili-prervannyy-polet": "Что раскрывает в личности В. С. Высоцкого книга воспоминаний М. Влади «Владимир, или Прерванный полёт»?",
  "vysotsky-a-krylov-vysotskiy-zhizn-i-tvorchestvo": "Как книга А. Крылова «Высоцкий. Жизнь и творчество» помогает увидеть В. С. Высоцкого как поэта?",
  "vysotsky-vospominaniya-akterov-teatra-na-taganke": "Какие черты В. С. Высоцкого как человека и артиста отражают воспоминания актёров Театра на Таганке?",
  "vysotsky-ch-nauchnye-i-kriticheskie-raboty": "Какие вопросы о поэтике В. С. Высоцкого рассматривают научные и критические работы?",
  "vysotsky-nauchnye-i-kriticheskie-raboty": "Какие вопросы о поэтике песен В. С. Высоцкого рассматривают научные и критические работы?",
  "vysotsky-l-abramova-poetika-vladimira-vysotskogo": "Как книга Л. Абрамовой «Поэтика Владимира Высоцкого» помогает понять поэтику В. С. Высоцкого?",
  "vysotsky-sbornik-mir-vysotskogo": "Что раскрывает в личности и творчестве В. С. Высоцкого сборник «Мир Высоцкого»?",
  "vysotsky-i-rubanova-voennaya-tema-v-poezii-vysotskogo": "Как работа И. Рубановой «Военная тема в поэзии Высоцкого» помогает понять военные песни В. С. Высоцкого?",
  "vysotsky-stati-o-magnitofonnoy-kulture-sssr": "Как магнитофонная культура в СССР повлияла на распространение песен В. С. Высоцкого?",
  "vysotsky-ch-dokumentalnye-materialy": "Что документальные материалы добавляют к образу В. С. Высоцкого?",
  "vysotsky-dokumentalnye-materialy": "Что документальные материалы добавляют к сведениям о жизни и творчестве В. С. Высоцкого?",
  "vysotsky-dokumentalnyy-film-v-s-vysotskiy-monolog": "Как документальный фильм «Высоцкий. Монолог» помогает понять поэта?",
  "vysotsky-televizionnye-intervyu-v-s-vysotskogo": "Что в телевизионных интервью В. С. Высоцкого помогает понять его отношение к собственным песням?",
  "vysotsky-hronika-pohoron-v-s-vysotskogo-iyul-1980-goda": "Как хроника похорон В. С. Высоцкого помогает понять масштаб его влияния?",
  "vysotsky-film-ya-rodom-iz-detstva": "Какое отношение фильм «Я родом из детства» имеет к творчеству В. С. Высоцкого и что он раскрывает?",
  "vysotsky-ch-onlayn-resursy": "Какие онлайн-ресурсы о В. С. Высоцком можно считать надёжными?",
  "vysotsky-onlayn-resursy": "Какие онлайн-ресурсы о В. С. Высоцком можно считать надёжными и как оценивать достоверность размещённых на них материалов?",
  "vysotsky-ofitsialnyy-sayt-muzeya-v-s-vysotskogo": "Как официальный сайт музея В. С. Высоцкого помогает увидеть поэта?",
  "vysotsky-elektronnyy-arhiv-pesen-i-zapisey-v-s-vysotskogo": "Чем электронный архив песен и записей В. С. Высоцкого полезен для изучения его творчества?",
  "vysotsky-elektronnaya-biblioteka-russkoy-literatury": "Как электронная библиотека русской литературы помогает изучить В. С. Высоцкого?",
  "vysotsky-arhiv-dokumentalnogo-kino-i-intervyu": "Какие сведения о В. С. Высоцком можно найти в архиве документального кино и интервью?",
  "vysotsky-critics": "Как критики оценивали военные песни В. С. Высоцкого и какие споры вызывало его творчество?",
  "vysotsky-critics-view": "Как современники и потомки воспринимали В. С. Высоцкого?",
  "vysotsky-ch-mesto-v-s-vysotskogo-v-literature-o-voyne": "Какое место занимает В. С. Высоцкий в литературе о войне и чем оно уникально?",
  "vysotsky-mesto-v-s-vysotskogo-v-literature-o-voyne": "Какое место занимают песни В. С. Высоцкого в литературе о Великой Отечественной войне?",
  "vysotsky-ch-itogovye-tezisy": "Какие выводы из изучения песен В. С. Высоцкого стоит сформулировать в итоговых тезисах?",
  "vysotsky-itogovye-tezisy": "Какие тезисы наиболее точно подводят итог изучения творчества В. С. Высоцкого?",
  "vysotsky-ch-finalnoe-pismennoe-zadanie": "Как финальное письменное задание завершает работу с творчеством В. С. Высоцкого?",
  "vysotsky-finalnoe-pismennoe-zadanie": "Какие выводы об итогах изучения творчества В. С. Высоцкого нужно представить в финальной письменной работе?",
  "vysotsky-summary": "Что объединяет военные песни В. С. Высоцкого в единое целое?",
  "vysotsky-final-summary": "Какое отношение к войне и памяти остаётся у читателя после изучения творчества В. С. Высоцкого?",

  // ═══════════════════════════════════════════════════════════════
  // Н. А. ЗАБОЛОЦКИЙ
  // ═══════════════════════════════════════════════════════════════
  "zabolotsky": "Почему Н. А. Заболоцкий писал о природе в эпоху войны и репрессий и что это говорит о его взгляде на человека?",
  "zabolotsky-photo-qr-ai": "Как природа становится убежищем души в поэзии Н. А. Заболоцкого?",
  "zabolotsky-intro": "Какую главную идею о творческом наследии Н. А. Заболоцкого выражает вводный раздел?",
  "zabolotsky-obyavlenie-proizvedeniy": "Как объявление произведений настраивает на серьёзный разговор о Н. А. Заболоцком?",
  "zabolotsky-ch-doprosy-i-otkaz-ot-donosa": "Почему допросы и отказ от доноса стали ключевым эпизодом в жизни Н. А. Заболоцкого?",
  "zabolotsky-doprosy-i-otkaz-ot-donosa": "Что отказ от доноса на допросах говорит о нравственной позиции Н. А. Заболоцкого?",
  "zabolotsky-ch-stihi-sohranennye-tolko-pamyatyu": "Как стихи, сохранённые только памятью, стали формой сопротивления у Н. А. Заболоцкого?",
  "zabolotsky-stihi-sohranennye-tolko-pamyatyu": "Что говорит о силе слова то, что Н. А. Заболоцкий хранил стихи в памяти?",
  "zabolotsky-ch-stihi-sohranennye-tolko-pamyatyu-posle-ispytaniy": "Что говорит о Н. А. Заболоцком история стихов, сохранённых памятью после испытаний?",
  "zabolotsky-stihi-sohranennye-tolko-pamyatyu-2": "Что рассказывает о судьбе Н. А. Заболоцкого история стихов, сохранённых только памятью?",
  "zabolotsky-ch-rabota-nad-slovom-o-polku-igoreve": "Как работа над переводом древнерусской поэмы «Слово о полку Игореве» помогла Н. А. Заболоцкому пережить трудные годы?",
  "zabolotsky-rabota-nad-slovom-o-polku-igoreve": "Что дал Н. А. Заболоцкому перевод древнерусской поэмы «Слово о полку Игореве»?",
  "zabolotsky-ch-semya-i-vozvraschenie-domoy": "Как семья и возвращение домой стали для Н. А. Заболоцкого новым началом?",
  "zabolotsky-semya-i-vozvraschenie-domoy": "Что дало Н. А. Заболоцкому возвращение домой, к семье?",
  "zabolotsky-ch-pozdnee-priznanie": "Почему признание пришло к Н. А. Заболоцкому поздно?",
  "zabolotsky-pozdnee-priznanie": "Почему признание пришло к Н. А. Заболоцкому поздно и как это отразилось на его судьбе?",
  "zabolotsky-ch-neozhidannyy-fakt": "Какой неожиданный факт о Н. А. Заболоцком меняет представление о нём?",
  "zabolotsky-neozhidannyy-fakt": "Какие неожиданные факты биографии Н. А. Заболоцкого меняют привычное представление о поэте?",
  "zabolotsky-zadanie-dlya-studenta": "Какие знания о поэзии Н. А. Заболоцкого необходимо применить, чтобы выполнить задание?",
  "zabolotsky-ch-ya-ne-ischu-garmonii-v-prirode": "Почему стихотворение «Я не ищу гармонии в природе» стало одним из ключевых у Н. А. Заболоцкого?",
  "zabolotsky-ya-ne-ischu-garmonii-v-prirode": "Что ищет вместо гармонии в природе лирический герой стихотворения Н. А. Заболоцкого «Я не ищу гармонии в природе»?",
  "zabolotsky-ch-mozhzhevelovyy-kust": "Как стихотворение «Можжевеловый куст» становится притчей о стойкости?",
  "zabolotsky-mozhzhevelovyy-kust": "Что в стихотворении Н. А. Заболоцкого «Можжевеловый куст» важнее описания природы?",
  "zabolotsky-ch-proschanie-s-druzyami": "Почему стихотворение «Прощание с друзьями» звучит так пронзительно?",
  "zabolotsky-proschanie-s-druzyami": "Что в стихотворении Н. А. Заболоцкого «Прощание с друзьями» важнее самого прощания?",
  "zabolotsky-ch-gde-to-v-pole-vozle-magadana": "Как стихотворение Н. А. Заболоцкого «Где-то в поле возле Магадана» становится голосом лагеря?",
  "zabolotsky-gde-to-v-pole-vozle-magadana": "Что стихотворение Н. А. Заболоцкого «Где-то в поле возле Магадана» говорит о его лагерном опыте?",
  "zabolotsky-ch-nekrasivaya-devochka": "Почему стихотворение «Некрасивая девочка» стало гимном внутренней красоте?",
  "zabolotsky-nekrasivaya-devochka": "Что в стихотворении Н. А. Заболоцкого «Некрасивая девочка» важнее внешности героини?",
  "zabolotsky-ch-obschiy-vyvod": "Какой общий вывод можно сделать после знакомства с поэзией Н. А. Заболоцкого?",
  "zabolotsky-obschiy-vyvod": "Какой общий вывод позволяет сделать изучение творчества Н. А. Заболоцкого?",
  "zabolotsky-ch-istoriya-mozhzhevelovogo-kusta": "Какова история создания стихотворения Н. А. Заболоцкого «Можжевеловый куст» и почему она важна?",
  "zabolotsky-istoriya-mozhzhevelovogo-kusta": "Как история создания стихотворения Н. А. Заболоцкого «Можжевеловый куст» помогает понять его замысел?",
  "zabolotsky-ch-perevody-kak-sposob-vyzhit": "Как переводы стали для Н. А. Заболоцкого способом выжить?",
  "zabolotsky-perevody-kak-sposob-vyzhit": "Как переводы помогли Н. А. Заболоцкому выжить в трудные годы?",
  "zabolotsky-ch-kak-sovremenniki-vosprinimali-n-a-zabolotskogo": "Почему восприятие поэзии Н. А. Заболоцкого современниками было противоречивым?",
  "zabolotsky-kak-sovremenniki-vosprinimali-n-a-zabolotskogo": "Как современники Н. А. Заболоцкого воспринимали его поэзию и как менялось это восприятие?",
  "zabolotsky-ch-uteryannye-rukopisi-i-vosstanovlennye-teksty": "Что говорит о судьбе Н. А. Заболоцкого история утерянных рукописей и восстановленных текстов?",
  "zabolotsky-uteryannye-rukopisi-i-vosstanovlennye-teksty": "Что значит для понимания творчества Н. А. Заболоцкого утрата рукописей и восстановление его текстов?",
  "zabolotsky-ch-neozhidannaya-istoriya-o-nekrasivoy-devochke": "Какая неожиданная история связана со стихотворением «Некрасивая девочка»?",
  "zabolotsky-neozhidannaya-istoriya-o-nekrasivoy-devochke": "Что неожиданного раскрывает история создания стихотворения Н. А. Заболоцкого «Некрасивая девочка»?",
  "zabolotsky-ch-priroda-i-chelovek": "Как Н. А. Заболоцкий соединяет в стихах образы природы и человека?",
  "zabolotsky-priroda-i-chelovek": "Что рождается из соединения природы и человека в поэзии Н. А. Заболоцкого?",
  "zabolotsky-ch-gosudarstvo-i-lichnost": "Как в творчестве Н. А. Заболоцкого соотносятся судьба личности и воля государства?",
  "zabolotsky-gosudarstvo-i-lichnost": "Что говорит Н. А. Заболоцкий о государстве и личности и как это отражено в его стихах?",
  "zabolotsky-ch-pamyat-i-utrata": "Как тема памяти и утраты раскрывается в стихах Н. А. Заболоцкого?",
  "zabolotsky-pamyat-i-utrata": "Что говорит тема памяти и утраты о взгляде Н. А. Заболоцкого на жизнь?",
  "zabolotsky-ch-krasota-kak-nravstvennaya-kategoriya": "Как красота становится у Н. А. Заболоцкого нравственной категорией?",
  "zabolotsky-krasota-kak-nravstvennaya-kategoriya": "Почему Н. А. Заболоцкий считает красоту нравственной категорией?",
  "zabolotsky-ch-molchanie-kak-forma-vyskazyvaniya": "Как молчание становится у Н. А. Заболоцкого формой высказывания?",
  "zabolotsky-molchanie-kak-forma-vyskazyvaniya": "Почему молчание становится в поэзии Н. А. Заболоцкого формой высказывания?",
  "zabolotsky-pismennoe-zadanie-dlya-studenta": "Какие выводы о поэзии Н. А. Заболоцкого нужно изложить в письменном задании и чем их подтвердить?",
  "zabolotsky-voprosy-dlya-pismennogo-razmyshleniya-studenta": "Какие вопросы о человеке, природе и памяти ставит поэзия Н. А. Заболоцкого?",
  "zabolotsky-ch-uroven-1-ponimanie-teksta": "Как первый уровень погружения в текст помогает услышать голос Н. А. Заболоцкого?",
  "zabolotsky-uroven-1-ponimanie-teksta": "Какие детали стихотворений Н. А. Заболоцкого необходимо заметить при первом внимательном чтении?",
  "zabolotsky-pismennoe-zadanie": "Какие знания о поэзии Н. А. Заболоцкого необходимо показать в письменном задании?",
  "zabolotsky-ch-uroven-2-analiz-i-interpretatsiya": "Какие тайны мастерства Н. А. Заболоцкого раскрывает второй уровень анализа?",
  "zabolotsky-uroven-2-analiz-i-interpretatsiya": "Какие особенности поэзии Н. А. Заболоцкого выявляет анализ на втором уровне?",
  "zabolotsky-pismennoe-zadanie-2": "Какой анализ стихотворений Н. А. Заболоцкого должен быть представлен во втором письменном задании?",
  "zabolotsky-ch-uroven-3-suzhdenie-i-pozitsiya": "Как третий уровень помогает сформулировать собственную позицию о Н. А. Заболоцком?",
  "zabolotsky-uroven-3-suzhdenie-i-pozitsiya": "Какую собственную позицию о поэзии Н. А. Заболоцкого должен сформулировать студент на третьем уровне?",
  "zabolotsky-pismennoe-zadanie-3": "Какую собственную позицию о поэзии Н. А. Заболоцкого нужно обосновать в третьем письменном задании?",
  "zabolotsky-interactive": "Какие интерактивные приёмы позволяют вдумчиво прочитать стихи Н. А. Заболоцкого?",
  "zabolotsky-interactive-methods": "Как интерактивные методы помогают заметить в стихах Н. А. Заболоцкого соединение природы и человека?",
  "zabolotsky-slide-tasks": "Какие главные положения о творчестве Н. А. Заболоцкого нужно обобщить по заданиям из слайдов?",
  "zabolotsky-critics": "Как критики оценивали поэзию Н. А. Заболоцкого и почему мнения о ней менялись?",
  "zabolotsky-critics-view": "Как современники и потомки воспринимали Н. А. Заболоцкого?",
  "zabolotsky-chto-ostaetsya": "Что остаётся от наследия Н. А. Заболоцкого и почему его поэзия звучит и сегодня?",
  "zabolotsky-mesto-n-a-zabolotskogo-v-literature-o-voyne": "Какое место занимает Н. А. Заболоцкий в литературе о войне и чем оно уникально?",
  "zabolotsky-itogovye-tezisy": "Какие тезисы наиболее точно подводят итог изучения творчества Н. А. Заболоцкого?",
  "zabolotsky-finalnoe-pismennoe-zadanie": "Как финальное письменное задание завершает работу с творчеством Н. А. Заболоцкого?",
  "zabolotsky-summary": "Что объединяет стихи Н. А. Заболоцкого в единый поэтический мир?",
  "zabolotsky-final-summary": "Какой голос уносит с собой читатель после изучения творчества Н. А. Заболоцкого?",

  // ═══════════════════════════════════════════════════════════════
  // ПРЕДИСЛОВИЕ И ОБЗОР
  // ═══════════════════════════════════════════════════════════════
  "preface": "Какие цели и принципы построения электронного учебника по литературе о Великой Отечественной войне изложены в предисловии?",
  "preface-annotation": "Как аннотация помогает понять, зачем создан этот учебник?",
  "overview": "Какие общие закономерности литературы о Великой Отечественной войне видны при сопоставлении всех изученных авторов?",
  "overview-final-summary": "Какой главный итог можно подвести после изучения творчества всех авторов, обратившихся к теме войны?"
};

  if (SECTION_QUESTIONS[section.id]) {
    return SECTION_QUESTIONS[section.id];
  }

  const nameForQuestion = authorName;
  if (/trainer|тренаж/.test(id)) {
    return `Какие знания об авторе (${nameForQuestion}) и его произведениях нужно применить, чтобы выполнить задания тренажёра «${cleanTitle}»?`;
  }
  if (/critic|критик/.test(id + " " + title)) {
    return `Как критики и читатели оценивали творчество автора (${nameForQuestion}) и чем эти оценки помогают понять раздел «${cleanTitle}»?`;
  }
  if (/istochnik|literatur|источник|литератур/.test(id + " " + title)) {
    return `Какие из источников раздела «${cleanTitle}» позволяют проверить сведения о творчестве автора (${nameForQuestion}) и как отличить документальное свидетельство от пересказа?`;
  }
  if (/summary|итог|обобщ|вывод/.test(id + " " + title)) {
    return `Какой главный вывод о творчестве автора (${nameForQuestion}) следует из раздела «${cleanTitle}»?`;
  }
  if (/zadani|задани|voprosy|вопрос/.test(id + " " + title)) {
    return `Какие выводы о произведениях автора (${nameForQuestion}) нужно обосновать, выполняя задания раздела «${cleanTitle}»?`;
  }
  if (/biograf|биограф|detstvo|детств/.test(id + " " + title)) {
    return `Какие события жизни автора (${nameForQuestion}), описанные в разделе «${cleanTitle}», повлияли на его отношение к войне?`;
  }
  return `Какую главную мысль выражает раздел «${cleanTitle}» и как она помогает понять авторскую позицию (${nameForQuestion})?`;
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
  // Черновик привязан к пользователю: на общем школьном компьютере чужой текст не покажется.
  const answerKey = `reader-answer:${state.user?.id || "guest"}:${assignmentId}`;
  const metaKey = `${answerKey}:meta`;
  const savedSubmission = state.submissions.find((item) => item.assignmentId === assignmentId);
  // Пересдача разрешена: один раз очищаем старый черновик, чтобы поле было пустым на всех устройствах.
  if (savedSubmission?.status === "retake_allowed" && savedSubmission.retakeAllowedAt) {
    const clearedFlag = `reader-retake-cleared:${answerKey}:${savedSubmission.retakeAllowedAt}`;
    try {
      if (!localStorage.getItem(clearedFlag)) {
        localStorage.removeItem(answerKey);
        localStorage.removeItem(metaKey);
        localStorage.setItem(clearedFlag, "1");
      }
    } catch {
      /* без localStorage черновиков всё равно нет */
    }
  }
  const savedAnswer = localStorage.getItem(answerKey) || "";
  const savedGrade = savedSubmission?.ai || null;
  const inputMeta = loadInputMeta(metaKey, savedSubmission?.answer || savedAnswer);

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
  trackInputSource(textarea, inputMeta, () => {
    localStorage.setItem(answerKey, textarea.value);
    localStorage.setItem(metaKey, JSON.stringify({ prov: inputMeta.prov, pasteEvents: inputMeta.pasteEvents }));
  });
  answer.append(textarea);

  const actions = document.createElement("div");
  actions.className = "assignment-actions";

  // ─── Пересдача (кнопка появляется, когда задание оценено) ───────────────
  let isGraded = Boolean(savedGrade);
  const retakeBox = document.createElement("div");
  retakeBox.className = "retake-box";

  const renderRetakeControls = () => {
    retakeBox.innerHTML = "";
    if (!isGraded) return;
    const latest = (state.retakes || [])
      .filter((item) => item.assignmentId === assignmentId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "text-button";
    const message = document.createElement("small");
    message.className = "retake-message";

    if (latest?.status === "pending") {
      toggle.textContent = "Запрос на пересдачу отправлен";
      toggle.disabled = true;
      message.textContent = "Преподаватель увидит запрос в кабинете и ответит на него.";
      retakeBox.append(toggle, message);
      return;
    }
    toggle.textContent = latest?.status === "declined" ? "Запросить пересдачу снова" : "Пересдача";
    if (latest?.status === "declined") {
      message.textContent = `Преподаватель отклонил запрос${latest.teacherComment ? `: ${latest.teacherComment}` : "."}`;
    }

    const form = document.createElement("form");
    form.className = "retake-form";
    form.hidden = true;
    const desiredLabel = document.createElement("label");
    desiredLabel.textContent = "Желаемый балл (необязательно)";
    const desired = document.createElement("input");
    desired.type = "number";
    desired.min = "0";
    desired.max = "100";
    desired.placeholder = "например, 80";
    desiredLabel.append(desired);
    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Комментарий преподавателю (необязательно)";
    const note = document.createElement("input");
    note.type = "text";
    note.maxLength = 500;
    noteLabel.append(note);
    const send = document.createElement("button");
    send.type = "submit";
    send.className = "text-button";
    send.textContent = "Отправить запрос";
    const hint = document.createElement("small");
    hint.className = "retake-message";
    if (!state.user?.groupId) {
      hint.textContent = "Вы не состоите в группе: запрос увидит только администратор.";
    }
    form.append(desiredLabel, noteLabel, send, hint);

    toggle.addEventListener("click", () => { form.hidden = !form.hidden; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      send.disabled = true;
      try {
        const result = await api("/api/retakes", {
          method: "POST",
          body: { assignmentId, desiredScore: desired.value, note: note.value },
        });
        state.retakes = [...(state.retakes || []), result.retake];
        renderRetakeControls();
      } catch (error) {
        send.disabled = false;
        hint.textContent = error.message;
      }
    });

    retakeBox.append(toggle, message, form);
  };

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
          inputMeta: {
            typed: Math.round(inputMeta.typed),
            pasted: Math.round(inputMeta.pasted),
            pasteEvents: inputMeta.pasteEvents,
          },
          context: sectionContext(section),
        },
      });

      await refreshDashboardData();
      status.textContent = formatEvaluation(result.submission.ai);
      textarea.disabled = true;
      checkButton.textContent = "Оценка сохранена";
      isGraded = true;
      renderRetakeControls();
    } catch (error) {
      checkButton.disabled = false;
      checkButton.textContent = "Проверить с ИИ";
      status.textContent = error.message;
    }
  });


  const status = document.createElement("output");
  status.className = "grade-status";
  status.textContent = savedGrade
    ? formatEvaluation(savedGrade)
    : savedSubmission?.status === "retake_allowed"
      ? `Преподаватель разрешил пересдачу${savedSubmission.previousScore != null ? ` (прошлая оценка: ${savedSubmission.previousScore})` : ""}. Напишите новый ответ.`
      : "Оценка появится здесь после проверки ИИ и сохранится в кабинете.";

  actions.append(checkButton, status);
  renderRetakeControls();
  content.append(title, text, answer, actions, retakeBox);
  wrapper.append(qr, content);

  return wrapper;
}

function formatEvaluation(ai) {
  if (!ai) return "Оценка пока не готова.";
  const mode = ai.inputModeLabel && ai.inputMode !== "typed" ? ` Способ ввода: ${ai.inputModeLabel}, применена своя шкала (до проверки: ${ai.rawScore}).` : "";
  return `Оценка: ${ai.score}/100 (${ai.mark}).${mode} ${ai.comment}`;
}

// ─── Откуда взялся текст: набран или вставлен ───────────────────────────────
// Для каждого символа ответа храним происхождение: t — набран, p — вставлен
// (paste/drop или резкий скачок длины без клавиатуры), u — неизвестно (черновик
// без истории). На каждом input сравниваем старый и новый текст, находим изменённый
// участок и обновляем строку происхождения. Это подсказка для сервера, а не
// доказательство: данные приходят из браузера, и их можно подделать.
const INPUT_JUMP_THRESHOLD = 15;

function loadInputMeta(key, text = "") {
  let prov = "";
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && typeof saved.prov === "string") prov = saved.prov;
    var pasteEvents = Number(saved?.pasteEvents) || 0;
  } catch {
    /* повреждённые данные — начинаем заново */
  }
  // Если история не совпадает с текстом (его правили в обход страницы) — считаем неизвестной.
  if (prov.length !== text.length) prov = "u".repeat(text.length);
  return recountInputMeta({ prov, pasteEvents: pasteEvents || 0 });
}

function recountInputMeta(meta) {
  let typed = 0;
  let pasted = 0;
  for (const mark of meta.prov) {
    if (mark === "t") typed += 1;
    else if (mark === "p") pasted += 1;
  }
  meta.typed = typed;
  meta.pasted = pasted;
  return meta;
}

function trackInputSource(textarea, meta, persist) {
  let prevValue = textarea.value;
  let pendingPaste = false;

  textarea.addEventListener("paste", () => { pendingPaste = true; });
  textarea.addEventListener("drop", () => { pendingPaste = true; });

  textarea.addEventListener("input", (event) => {
    const value = textarea.value;

    // Общий префикс и суффикс старого и нового текста → изменённый участок посередине.
    let start = 0;
    const maxStart = Math.min(prevValue.length, value.length);
    while (start < maxStart && prevValue[start] === value[start]) start += 1;
    let end = 0;
    const maxEnd = Math.min(prevValue.length, value.length) - start;
    while (end < maxEnd && prevValue[prevValue.length - 1 - end] === value[value.length - 1 - end]) end += 1;

    const removed = prevValue.length - start - end;
    const inserted = value.length - start - end;
    const byPaste =
      pendingPaste ||
      /^insertFrom(Paste|Drop)/.test(event.inputType || "") ||
      inserted > INPUT_JUMP_THRESHOLD;

    if (inserted > 0 && byPaste) meta.pasteEvents += 1;
    pendingPaste = false;

    meta.prov =
      meta.prov.slice(0, start) +
      (byPaste ? "p" : "t").repeat(Math.max(0, inserted)) +
      meta.prov.slice(start + removed);
    recountInputMeta(meta);

    prevValue = value;
    persist();
  });
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
