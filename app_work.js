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
    authorId:
      chapter.authorId ||
      book.authorId ||
      authors[0].id,
  }))
);

const state = {
  activeId:
    location.hash.replace("#", "") ||
    flatSections[0].id,

  selectedAuthorId: null,
  query: "",

  token:
    localStorage.getItem("reader-token") || "",

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

  chapterKicker:
    document.querySelector("#chapterKicker"),

  sectionTitle:
    document.querySelector("#sectionTitle"),

  sectionLead:
    document.querySelector("#sectionLead"),

  sectionBody:
    document.querySelector("#sectionBody"),

  progressLabel:
    document.querySelector("#progressLabel"),

  progressBar:
    document.querySelector("#progressBar"),

  prevSection:
    document.querySelector("#prevSection"),

  nextSection:
    document.querySelector("#nextSection"),

  searchInput:
    document.querySelector("#searchInput"),

  accountToggle:
    document.querySelector("#accountToggle"),

  aiDialogToggle:
    document.querySelector("#aiDialogToggle"),

  accountPanel:
    document.querySelector("#accountPanel"),

  accountClose:
    document.querySelector("#accountClose"),

  dashboard:
    document.querySelector("#dashboard"),

  dashboardBody:
    document.querySelector("#dashboardBody"),

  userName:
    document.querySelector("#userName"),

  roleLabel:
    document.querySelector("#roleLabel"),

  logoutButton:
    document.querySelector("#logoutButton"),

  themeToggle:
    document.querySelector("#themeToggle"),

  tocToggle:
    document.querySelector("#tocToggle"),

  tocClose:
    document.querySelector("#tocClose"),

  tocPanel:
    document.querySelector("#tocPanel"),

  overlay:
    document.querySelector("#overlay"),
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

  state.selectedAuthorId =
    getActiveSection().authorId;

  renderToc();
  renderSection();
  bindEvents();
  restoreSession();

  if (
    localStorage.getItem("reader-theme") ===
    "dark"
  ) {
    document.documentElement.classList.add(
      "theme-dark"
    );
  }
}