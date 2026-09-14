import { createHmac, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = join(__dirname, "data");
const DB_PATH = join(DATA_DIR, "db.json");
const VIDEOS_PATH = join(DATA_DIR, "videos.json");

// ═══ Постоянное хранение: локальные JSON-файлы + (опционально) PostgreSQL ═══
// Если задана переменная окружения DATABASE_URL — данные (пользователи, группы,
// оценки, видеотека) дублируются в PostgreSQL. Это нужно на Render (бесплатный
// тариф), где диск эфемерный и файлы data/*.json стираются при ре-деплое.
// Без DATABASE_URL поведение не меняется — всё хранится в файлах, как раньше.
// Схема в БД: одна таблица book_state(kind text PRIMARY KEY, data jsonb).

const DEFAULT_DB = { users: [], groups: [], submissions: [] };

let PgPool = null;
let SAVE_QUEUE = Promise.resolve();
let DB_CACHE = null;
let VIDEOS_CACHE = null;

function usePg() {
  return Boolean(process.env.DATABASE_URL);
}

// Асинхронная запись в Postgres, строго по очереди (без гонок).
function enqueuePgSave(kind, value) {
  if (!PgPool) return;
  const payload = JSON.stringify(value);
  SAVE_QUEUE = SAVE_QUEUE.catch(() => {}).then(async () => {
    await PgPool.query(
      `INSERT INTO book_state (kind, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (kind) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [kind, payload]
    );
  });
  SAVE_QUEUE.catch((error) => console.error(`[pg] не удалось сохранить "${kind}":`, error.message));
}

// Загрузка данных при старте: Postgres (если задан) → локальные файлы.
async function bootstrap() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  if (!existsSync(VIDEOS_PATH)) writeFileSync(VIDEOS_PATH, JSON.stringify({}, null, 2));

  DB_CACHE = JSON.parse(readFileSync(DB_PATH, "utf-8"));
  VIDEOS_CACHE = JSON.parse(readFileSync(VIDEOS_PATH, "utf-8"));

  if (!usePg()) return;

  PgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    await PgPool.query(
      `CREATE TABLE IF NOT EXISTS book_state (
         kind text PRIMARY KEY,
         data jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now()
       )`
    );
    const { rows } = await PgPool.query(`SELECT kind, data FROM book_state`);
    const state = Object.fromEntries(rows.map((row) => [row.kind, row.data]));
    if (state.db) DB_CACHE = state.db;
    if (state.videos) VIDEOS_CACHE = state.videos;
    // Первичная синхронизация: если в Postgres строк не было — заливаем локальные файлы.
    enqueuePgSave("db", DB_CACHE);
    enqueuePgSave("videos", VIDEOS_CACHE);
    await SAVE_QUEUE.catch(() => {});
    console.log("[pg] подключён PostgreSQL: хранилище book_state");
  } catch (error) {
    console.error("[pg] подключение не удалось, работаю на локальных файлах:", error.message);
    await PgPool.end().catch(() => {});
    PgPool = null;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

loadEnv();
await bootstrap();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/config.js") {
      return sendPortalConfig(res);
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 500, { error: error.status ? error.message : "Ошибка сервера" });
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер учебника: http://0.0.0.0:${PORT}`);
});

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/health") return sendJson(res, 200, { ok: true });
  if (route === "GET /api/ai/health") return aiHealth(req, res);
  if (route === "POST /api/ai/dialog") return aiDialog(req, res);

  if (route === "POST /api/auth/register") return register(req, res);
  if (route === "POST /api/auth/login") return login(req, res);
  if (route === "GET /api/me") return me(req, res);
  if (route === "POST /api/logout") return logout(req, res);

  if (route === "GET /api/groups") return listGroups(req, res);
  if (route === "POST /api/groups") return createGroup(req, res);

  if (route === "GET /api/users") return listUsers(req, res);
  if (req.method === "PATCH" && url.pathname.startsWith("/api/users/")) {
    return updateUser(req, res, url.pathname.split("/").at(-1));
  }

  if (route === "POST /api/submissions") return submitAnswer(req, res);
  if (route === "GET /api/submissions/my") return mySubmissions(req, res);
  if (route === "GET /api/submissions/teacher") return teacherSubmissions(req, res);
  if (route === "GET /api/submissions/all") return allSubmissions(req, res);
  if (req.method === "PATCH" && url.pathname.startsWith("/api/submissions/")) {
    return reviewSubmission(req, res, url.pathname.split("/").at(-2));
  }

  // --- Видеотека ---
  if (route === "GET /api/videos") return listVideos(req, res);
  if (route === "POST /api/videos/login") return videoAdminLogin(req, res);
  if (req.method === "PUT" && url.pathname.startsWith("/api/videos/")) {
    return updateVideo(req, res, decodeURIComponent(url.pathname.split("/api/videos/")[1]));
  }

  sendJson(res, 404, { error: "Маршрут не найден" });
}

async function register(req, res) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const fullName = String(body.fullName || "").trim();
  const db = readDb();
  if (!email || !email.includes("@")) return sendJson(res, 400, { error: "Введите корректный email" });
  if (password.length < 6) return sendJson(res, 400, { error: "Пароль должен быть не короче 6 символов" });
  if (!isCyrillicFullName(fullName)) {
    return sendJson(res, 400, { error: "ФИО можно вводить только кириллицей: фамилия, имя и при желании отчество" });
  }
  if (db.users.some((user) => user.email === email)) return sendJson(res, 400, { error: "Такой email уже зарегистрирован" });
  const role = "student";
  const user = {
    id: randomUUID(),
    email,
    fullName,
    role,
    groupId: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password),
  };
  db.users.push(user);
  writeDb(db);
  setPortalCookie(res, user, req.headers.host);
  sendJson(res, 200, issueSession(user));
}

async function login(req, res) {
  const body = await readBody(req);
  const db = readDb();
  const user = db.users.find((item) => item.email === normalizeEmail(body.email) && item.isActive);
  if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
    return sendJson(res, 401, { error: "Неверный email или пароль" });
  }
  setPortalCookie(res, user, req.headers.host);
  sendJson(res, 200, issueSession(user));
}

function listGroups(req, res) {
  const user = requireUser(req);
  const db = readDb();
  const groups = user.role === "teacher" ? db.groups.filter((group) => group.teacherId === user.id) : db.groups;
  sendJson(res, 200, { groups });
}

async function createGroup(req, res) {
  const user = requireRole(req, ["admin", "teacher"]);
  const body = await readBody(req);
  const name = String(body.name || "").trim();
  if (!name) return sendJson(res, 400, { error: "Введите название класса или группы" });
  const db = readDb();
  const group = {
    id: randomUUID(),
    name,
    teacherId: user.role === "teacher" ? user.id : String(body.teacherId || user.id),
    createdAt: new Date().toISOString(),
  };
  db.groups.push(group);
  writeDb(db);
  sendJson(res, 200, { group });
}

function listUsers(req, res) {
  const user = requireRole(req, ["admin", "teacher"]);
  const db = readDb();
  let users = db.users.map(publicUser);
  if (user.role === "teacher") {
    const ownGroups = new Set(db.groups.filter((group) => group.teacherId === user.id).map((group) => group.id));
    users = users.filter((item) => item.role === "student" && (!item.groupId || ownGroups.has(item.groupId)));
  }
  sendJson(res, 200, { users });
}

async function updateUser(req, res, userId) {
  const actor = requireRole(req, ["admin", "teacher"]);
  const body = await readBody(req);
  const db = readDb();
  const target = db.users.find((user) => user.id === userId);
  if (!target) return sendJson(res, 404, { error: "Пользователь не найден" });
  if (actor.role === "admin" && body.role && ["admin", "teacher", "student"].includes(body.role)) {
    target.role = body.role;
  }
  if (body.groupId !== undefined) {
    const groupId = body.groupId || null;
    if (actor.role === "teacher") {
      const group = db.groups.find((item) => item.id === groupId && item.teacherId === actor.id);
      if (!group && groupId) return sendJson(res, 403, { error: "Можно назначать только свои группы" });
      if (target.role !== "student") return sendJson(res, 403, { error: "Преподаватель назначает группы только ученикам" });
    }
    target.groupId = groupId;
  }
  writeDb(db);
  sendJson(res, 200, { user: publicUser(target) });
}

async function submitAnswer(req, res) {
  const user = requireRole(req, ["student", "teacher", "admin"]);
  const body = await readBody(req);
  const assignmentId = String(body.assignmentId || "");
  const sectionId = String(body.sectionId || "");
  const blockIndex = Number(body.blockIndex);
  const question = String(body.question || "").trim();
  const answer = String(body.answer || "").trim();
  const context = String(body.context || "").slice(0, 8000);
  const author = String(body.author || "");
  const topic = String(body.topic || "");
  if (!assignmentId || !question || !answer) return sendJson(res, 400, { error: "Нужны задание и ответ" });
  if (answer.length < 80) return sendJson(res, 400, { error: "Ответ слишком короткий для честной оценки. Напишите подробнее." });
  const db = readDb();
  const existing = db.submissions.find((item) => item.studentId === user.id && item.assignmentId === assignmentId);
  if (existing?.locked) return sendJson(res, 409, { error: "Эта работа уже оценена и заблокирована", submission: existing });
  const submission = existing || {
    id: randomUUID(),
    studentId: user.id,
    assignmentId,
    sectionId,
    blockIndex,
    author,
    topic,
    question,
    createdAt: new Date().toISOString(),
  };
  submission.answer = answer;
  submission.status = "processing";
  submission.updatedAt = new Date().toISOString();
  if (!existing) db.submissions.push(submission);
  writeDb(db);
  try {
    const evaluation = await evaluateWithAi({ author, topic, question, answer, context });
    submission.ai = evaluation;
    submission.finalScore = evaluation.score;
    submission.status = "ai_done";
    submission.locked = true;
    submission.evaluatedAt = new Date().toISOString();
    writeDb(db);
    sendJson(res, 200, { submission });
  } catch (error) {
    submission.status = "failed";
    submission.error = error.message;
    writeDb(db);
    sendJson(res, 500, { error: "ИИ не смог оценить ответ.", detail: publicAiError(error.message), submission });
  }
}

async function aiHealth(req, res) {
  requireUser(req);
  try {
    const api = getAiConfig();
    const response = await fetch(api.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: api.model,
        messages: [{ role: "user", content: "Ответь JSON: {\"ok\":true}" }],
        temperature: 0,
        max_tokens: 20,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return sendJson(res, 500, {
        ok: false,
        provider: api.provider,
        model: api.model,
        error: publicAiError(`AI API ${response.status}: ${text}`),
      });
    }
    sendJson(res, 200, { ok: true, provider: api.provider, model: api.model });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: publicAiError(error.message) });
  }
}

async function aiDialog(req, res) {
  const body = await readBody(req);
  const prompt = String(body.prompt || "").trim();
  const author = String(body.author || "").trim();
  const topic = String(body.topic || "").trim();
  const context = String(body.context || "").slice(0, 7000);
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  if (!prompt) return sendJson(res, 400, { error: "Введите вопрос для ИИ" });
  try {
    const answer = await dialogWithAi({ prompt, author, topic, context, history });
    sendJson(res, 200, { answer });
  } catch (error) {
    sendJson(res, 500, { error: "ИИ-диалог сейчас недоступен.", detail: publicAiError(error.message) });
  }
}

function mySubmissions(req, res) {
  const user = requireRole(req, ["student"]);
  const db = readDb();
  sendJson(res, 200, { submissions: db.submissions.filter((item) => item.studentId === user.id) });
}

function teacherSubmissions(req, res) {
  const user = requireRole(req, ["teacher", "admin"]);
  const db = readDb();
  const teacherGroupIds = new Set(
    db.groups.filter((group) => user.role === "admin" || group.teacherId === user.id).map((group) => group.id)
  );
  const students = new Set(
    db.users.filter((item) => item.role === "student" && teacherGroupIds.has(item.groupId)).map((item) => item.id)
  );
  const submissions = db.submissions
    .filter((item) => user.role === "admin" || students.has(item.studentId))
    .map((item) => ({ ...item, student: publicUser(db.users.find((student) => student.id === item.studentId)) }));
  sendJson(res, 200, { submissions });
}

function allSubmissions(req, res) {
  requireRole(req, ["admin"]);
  const db = readDb();
  sendJson(res, 200, {
    submissions: db.submissions.map((item) => ({
      ...item,
      student: publicUser(db.users.find((student) => student.id === item.studentId)),
    })),
  });
}

async function reviewSubmission(req, res, submissionId) {
  const user = requireRole(req, ["teacher", "admin"]);
  const body = await readBody(req);
  const db = readDb();
  const submission = db.submissions.find((item) => item.id === submissionId);
  if (!submission) return sendJson(res, 404, { error: "Работа не найдена" });
  const score = Number(body.finalScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) return sendJson(res, 400, { error: "Оценка должна быть от 0 до 100" });
  submission.teacherReview = {
    teacherId: user.id,
    finalScore: Math.round(score),
    comment: String(body.comment || ""),
    reviewedAt: new Date().toISOString(),
  };
  submission.finalScore = submission.teacherReview.finalScore;
  submission.locked = true;
  submission.status = "reviewed";
  writeDb(db);
  sendJson(res, 200, { submission });
}

// --- Видеотека: публичное чтение + смена ссылок по паролю ---

function listVideos(req, res) {
  sendJson(res, 200, { videos: readVideosDb() });
}

async function videoAdminLogin(req, res) {
  const body = await readBody(req);
  const password = String(body.password || "");
  const expected = process.env.VIDEO_ADMIN_PASSWORD || "";
  if (!expected) {
    return sendJson(res, 500, { error: "VIDEO_ADMIN_PASSWORD не задан в .env" });
  }
  if (password !== expected) {
    return sendJson(res, 401, { error: "Неверный пароль" });
  }
  sendJson(res, 200, { token: signToken({ scope: "video-admin" }) });
}

async function updateVideo(req, res, videoId) {
  requireVideoAdmin(req);
  if (!videoId) return sendJson(res, 400, { error: "Не передан id видео" });
  const body = await readBody(req);
  const db = readVideosDb();
  const entry = db[videoId] || {};
  entry.url = String(body.url || "").trim();
  if (body.title !== undefined) entry.title = String(body.title).trim();
  entry.updatedAt = new Date().toISOString();
  db[videoId] = entry;
  writeVideosDb(db);
  sendJson(res, 200, { id: videoId, entry });
}

function requireVideoAdmin(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload || payload.scope !== "video-admin") {
    throw Object.assign(new Error("Нужен вход в панель видео"), { status: 401 });
  }
  return payload;
}

function readVideosDb() {
  return VIDEOS_CACHE;
}

function writeVideosDb(db) {
  VIDEOS_CACHE = db;
  try {
    writeFileSync(VIDEOS_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Не удалось сохранить data/videos.json:", error.message);
  }
  enqueuePgSave("videos", db);
}

async function evaluateWithAi({ author, topic, question, answer, context }) {
  const api = getAiConfig();
  const prompt = `Ты строгий, но справедливый преподаватель литературы. Оцени письменный ответ ученика по 100-балльной шкале.

Автор: ${author}
Тема раздела: ${topic}
Задание: ${question}
Фрагмент учебного материала для проверки фактов: ${context || "Материал не передан."}
Ответ ученика: ${answer}

Правила оценивания:
1. Не завышай оценку за общий пересказ без конкретики.
2. Если нет опоры на текст, образы, эпизоды или авторскую позицию, итог не выше 60.
3. Если ответ почти не по теме, итог не выше 40.
4. Если ответ слишком короткий или состоит из общих фраз, итог не выше 35.
5. Учитывай грамотность, но главнее понимание литературы и аргументация.

Верни только валидный JSON без markdown:
{
  "score": число от 0 до 100,
  "mark": "2|3|4|5",
  "criteria": [
    {"name":"Соответствие заданию","score":0-20,"comment":"коротко"},
    {"name":"Понимание текста","score":0-25,"comment":"коротко"},
    {"name":"Аргументация и примеры","score":0-25,"comment":"коротко"},
    {"name":"Самостоятельность вывода","score":0-15,"comment":"коротко"},
    {"name":"Речь и структура","score":0-15,"comment":"коротко"}
  ],
  "strengths": ["1-2 сильные стороны"],
  "improvements": ["2-3 конкретных совета"],
  "comment": "четкий комментарий преподавателя 4-6 предложений"
}`;
  const response = await fetch(api.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: api.model,
      messages: [
        { role: "system", content: "Ты профессиональный преподаватель литературы. Отвечай только JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.15,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`AI API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";
  const parsed = parseAiJson(raw);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  return {
    score,
    mark: parsed.mark || scoreToMark(score),
    criteria: Array.isArray(parsed.criteria) ? parsed.criteria : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    comment: String(parsed.comment || "ИИ вернул неполный комментарий."),
    model: api.model,
  };
}

async function dialogWithAi({ prompt, author, topic, context, history }) {
  const api = getAiConfig();
  const messages = [
    {
      role: "system",
      content: `Ты литературный наставник в электронном учебнике. Отвечай по-русски, точно, без сленга и без неопределённых слов. Опирайся на факты, военный контекст, авторскую позицию и текст произведений. Не ставь оценку за задания в диалоге: для оценивания есть отдельная кнопка проверки.`,
    },
    {
      role: "user",
      content: `Контекст текущего раздела.
Автор: ${author || "не указан"}
Тема: ${topic || "не указана"}
Материал: ${context || "Материал не передан."}`,
    },
    ...history
      .filter((item) => ["user", "assistant"].includes(item.role) && item.text)
      .map((item) => ({ role: item.role, content: String(item.text).slice(0, 1200) })),
    { role: "user", content: prompt },
  ];
  const response = await fetch(api.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${api.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: api.model, messages, temperature: 0.25, max_tokens: 900 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`AI API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || "ИИ не вернул ответ.").trim();
}

function parseAiJson(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("ИИ вернул не JSON");
  }
}

function getAiConfig() {
  const key = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  if (!key) throw new Error("В .env нет API-ключа");
  const isGroq = key.startsWith("gsk_") || process.env.AI_PROVIDER === "groq";
  return {
    key,
    provider: isGroq ? "groq" : "openai-compatible",
    url: process.env.AI_API_URL || (isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions"),
    // Модель по умолчанию для GROQ. ВАЖНО: выборка моделей зависит от тарифа/ключа.
    // Проверить доступные: GET https://api.groq.com/openai/v1/models
    // Переопределить через переменную окружения SCORING_MODEL.
    model: process.env.SCORING_MODEL || (isGroq ? "qwen/qwen3.8-27b" : "gpt-4o-mini"),
  };
}

function publicAiError(message) {
  return String(message || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [hidden]")
    .replace(/gsk_[A-Za-z0-9_-]+/g, "gsk_[hidden]")
    .slice(0, 1200);
}

// Конфигурация портала: адреса трёх связанных проектов (Учебник / ИИ-диалог / LitFair).
// Значения по умолчанию можно переопределить через переменные окружения (см. start.sh).
function sendPortalConfig(res) {
  const config = {
    bookUrl: process.env.BOOK_URL || `http://localhost:${PORT}`,
    dialogUrl: process.env.DIALOG_URL || "http://localhost:3001",
    litfairUrl: process.env.LITFAIR_URL || "http://localhost:5002",
  };
  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(`window.PORTAL_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
}

// ═══ Единый вход (SSO): общий портал-токен в cookie на домене localhost ═══════
// Все три платформы (Учебник / ИИ-диалог / LitFair) подписывают один и тот же
// токен секретом PORTAL_SECRET. Cookie не привязаны к порту, поэтому, войдя на
// одной платформе, пользователь автоматически «узнаётся» на остальных.

const PORTAL_SECRET = process.env.PORTAL_SECRET || "portal-dev-secret";
const PORTAL_MAX_AGE = 30 * 24 * 60 * 60; // секунд (30 дней)
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Атрибуты cookie: Secure только в продакшене (HTTPS), чтобы не ломать локальную dev-сборку.
function portalCookieSuffix() {
  return `HttpOnly; Max-Age=${PORTAL_MAX_AGE}; SameSite=Lax` + (IS_PRODUCTION ? `; Secure` : ``);
}

function b64url(value) {
  return Buffer.from(String(value)).toString("base64url");
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function signPortalToken(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "portal" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", PORTAL_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function verifyPortalToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", PORTAL_SECRET).update(`${header}.${body}`).digest("base64url");
  if (!safeEqual(expected, sig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function hostDomain(host) {
  // PORTAL_COOKIE_DOMAIN позволяет задать один домен для всех сервисов
  // (например, .example.com для кросс-субдоменных cookie в SSO).
  if (process.env.PORTAL_COOKIE_DOMAIN) return process.env.PORTAL_COOKIE_DOMAIN;
  return String(host || "localhost").split(":")[0] || "localhost";
}

function setPortalCookie(res, user, host) {
  const token = signPortalToken({
    email: normalizeEmail(user.email),
    name: user.fullName || user.name || "",
    role: user.role || "student",
    exp: Date.now() + PORTAL_MAX_AGE * 1000,
  });
  res.setHeader(
    "Set-Cookie",
    `portal_token=${token}; Path=/; Domain=${hostDomain(host)}; ${portalCookieSuffix()}`
  );
}

function clearPortalCookie(res, host) {
  const suffix = IS_PRODUCTION ? `HttpOnly; Max-Age=0; SameSite=Lax; Secure` : `HttpOnly; Max-Age=0; SameSite=Lax`;
  res.setHeader(
    "Set-Cookie",
    `portal_token=; Path=/; Domain=${hostDomain(host)}; ${suffix}`
  );
}

function portalUserFrom(req) {
  const cookie = parseCookies(req.headers.cookie);
  if (!cookie.portal_token) return null;
  const payload = verifyPortalToken(cookie.portal_token);
  if (!payload || !payload.email) return null;
  return {
    email: normalizeEmail(payload.email),
    name: String(payload.name || ""),
    role: ["admin", "teacher", "student"].includes(payload.role) ? payload.role : "student",
  };
}

function logout(req, res) {
  clearPortalCookie(res, req.headers.host);
  sendJson(res, 200, { ok: true });
}

// GET /api/me — сначала обычный Bearer-токен, затем (если его нет) общий
// портал-токен из cookie. Пользователь, который вошёл на другой платформе,
// автоматически создаётся/находится здесь без пароля.
function me(req, res) {
  try {
    const user = requireUser(req);
    return sendJson(res, 200, { user: publicUser(user) });
  } catch {
    /* нет/недействителен Bearer-токен — пробуем cookie */
  }
  const portal = portalUserFrom(req);
  if (!portal) return sendJson(res, 401, { error: "Нужен вход" });

  const db = readDb();
  let user = db.users.find((item) => item.email === portal.email);
  if (!user) {
    user = {
      id: randomUUID(),
      email: portal.email,
      fullName: portal.name || "",
      role: portal.role,
      groupId: null,
      isActive: true,
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword("portal:" + randomBytes(16).toString("hex")),
    };
    db.users.push(user);
    writeDb(db);
  }
  // Выдаём локальный токен, чтобы фронтенд дальше работал через Authorization.
  const token = signToken({ id: user.id, role: user.role });
  sendJson(res, 200, { user: publicUser(user), token });
}

function serveStatic(res, pathname) {
  const cleanPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname).replace(/^\/+/, "");
  if (cleanPath.includes("..") || cleanPath === ".env" || cleanPath.startsWith("data/")) {
    return sendText(res, 403, "Forbidden");
  }
  const filePath = join(__dirname, cleanPath);
  if (!existsSync(filePath)) return sendText(res, 404, "Not found");
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(filePath));
}

function readDb() {
  return DB_CACHE;
}

function writeDb(db) {
  DB_CACHE = db;
  try {
    writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Не удалось сохранить data/db.json:", error.message);
  }
  enqueuePgSave("db", db);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function loadEnv() {
  const path = join(__dirname, ".env");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf-8").trim();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.includes("=")) {
      if (trimmed.startsWith("gsk_")) process.env.GROQ_API_KEY = trimmed;
      else process.env.AI_API_KEY = trimmed;
      continue;
    }
    const [key, ...value] = trimmed.split("=");
    process.env[key.trim()] = value.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

function issueSession(user) {
  return { user: publicUser(user), token: signToken({ id: user.id, role: user.role }) };
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isCyrillicFullName(value) {
  return /^[А-ЯЁ][а-яё]+(?:[ -][А-ЯЁ][а-яё]+){1,3}$/.test(value);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", getJwtSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", getJwtSecret()).update(body).digest("base64url");
  if (expected !== signature) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
  if (payload.exp < Date.now()) return null;
  return payload;
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = "local-dev-secret-change-me";
  return process.env.JWT_SECRET;
}

function requireUser(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload) throw Object.assign(new Error("Нужен вход"), { status: 401 });
  const user = readDb().users.find((item) => item.id === payload.id && item.isActive);
  if (!user) throw Object.assign(new Error("Пользователь не найден"), { status: 401 });
  return user;
}

function requireRole(req, roles) {
  const user = requireUser(req);
  if (!roles.includes(user.role)) throw Object.assign(new Error("Недостаточно прав"), { status: 403 });
  return user;
}

function scoreToMark(score) {
  if (score >= 85) return "5";
  if (score >= 70) return "4";
  if (score >= 50) return "3";
  return "2";
}

