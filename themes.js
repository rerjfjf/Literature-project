// themes.js — переключатель оформлений (Классика / Книга / Яркий).
// Подключать в <head> после themes.css, чтобы нужный скин применялся без «мигания».
(function () {
  "use strict";

  var KEY = "reader-skin";
  var SKINS = [
    { id: "classic", name: "Классика", desc: "Как сейчас", sw: "linear-gradient(135deg,#f5f1e8,#b94a2b)" },
    { id: "book", name: "Книга", desc: "Бумага, обрез страниц, перелистывание", sw: "linear-gradient(135deg,#5a3a20,#f1e7cc)" },
    { id: "vivid", name: "Яркий", desc: "Цвета, свечение, анимации", sw: "linear-gradient(135deg,#ec4899,#8b5cf6,#3b82f6)" },
  ];
  var CONFETTI_COLORS = ["#ec4899", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b"];

  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function readSkin() {
    try {
      var saved = localStorage.getItem(KEY);
      if (SKINS.some(function (s) { return s.id === saved; })) return saved;
    } catch (e) {
      // localStorage недоступен: остаёмся на классике
    }
    return "classic";
  }

  var skin = readSkin();
  root.setAttribute("data-skin", skin);

  // ───────────── Выбор оформления ─────────────
  var menu = null;
  var optionButtons = [];

  function setSkin(id) {
    skin = id;
    root.setAttribute("data-skin", id);
    try {
      localStorage.setItem(KEY, id);
    } catch (e) {
      // не страшно
    }
    optionButtons.forEach(function (b) {
      b.setAttribute("aria-checked", String(b.getAttribute("data-skin") === id));
    });
    if (id === "vivid") retrigger();
  }

  function mountSwitch() {
    var host =
      document.querySelector(".topbar__actions") ||
      document.querySelector(".films-header > div:last-child, .videos-header > div:last-child");
    if (!host) return;

    var wrap = document.createElement("div");
    wrap.className = "skin-switch";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "skin-switch__btn";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("title", "Оформление");
    btn.innerHTML = '<span class="skin-switch__icon" aria-hidden="true"></span><span class="skin-switch__text">Оформление</span>';

    menu = document.createElement("div");
    menu.className = "skin-menu";
    menu.hidden = true;
    menu.setAttribute("role", "radiogroup");
    menu.setAttribute("aria-label", "Оформление сайта");

    SKINS.forEach(function (s) {
      var opt = document.createElement("button");
      opt.type = "button";
      opt.className = "skin-opt";
      opt.setAttribute("role", "radio");
      opt.setAttribute("data-skin", s.id);
      opt.setAttribute("aria-checked", String(s.id === skin));
      opt.innerHTML =
        '<span class="skin-opt__sw" style="background:' + s.sw + '"></span>' +
        "<span><strong>" + s.name + "</strong><small>" + s.desc + "</small></span>";
      opt.addEventListener("click", function () {
        setSkin(s.id);
        closeMenu();
      });
      optionButtons.push(opt);
      menu.appendChild(opt);
    });

    function closeMenu() {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    var themeBtn = document.getElementById("themeToggle");
    if (themeBtn && themeBtn.parentNode === host) host.insertBefore(wrap, themeBtn);
    else host.appendChild(wrap);
  }

  // ───────────── Яркий: появление страницы, световое пятно, конфетти ─────────────
  function retrigger() {
    var page = document.getElementById("bookPage");
    if (!page || skin !== "vivid") return;
    page.classList.remove("skin-enter");
    void page.offsetWidth; // перезапуск анимации
    page.classList.add("skin-enter");
  }

  function burst(x, y) {
    if (reduceMotion) return;
    for (var i = 0; i < 18; i++) {
      var p = document.createElement("span");
      var angle = Math.random() * Math.PI * 2;
      var dist = 50 + Math.random() * 90;
      p.className = "vivid-confetti";
      p.style.left = x + "px";
      p.style.top = y + "px";
      p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--dy", Math.sin(angle) * dist + 30 + "px");
      p.style.setProperty("--r", Math.round(Math.random() * 720 - 360) + "deg");
      document.body.appendChild(p);
      setTimeout(function (el) { el.remove(); }, 1000, p);
    }
  }

  function trackPointer() {
    if (!window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;
    var raf = 0;
    window.addEventListener(
      "pointermove",
      function (e) {
        if (skin !== "vivid" || raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          root.style.setProperty("--mx", e.clientX + "px");
          root.style.setProperty("--my", e.clientY + "px");
        });
      },
      { passive: true }
    );
  }

  // ───────────── Книга: перелистывание страницы ─────────────
  function flip(dir) {
    if (skin !== "book" || reduceMotion) return;
    var page = document.getElementById("bookPage");
    if (!page || !page.parentNode) return;

    function run() {
      var r = page.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var top = Math.max(r.top, 0);
      var bottom = Math.min(r.bottom, vh);
      if (bottom - top < 120) return;

      var wrap = document.createElement("div");
      wrap.className = "page-flip" + (dir < 0 ? " page-flip--prev" : "");
      wrap.style.left = r.left + "px";
      wrap.style.top = top + "px";
      wrap.style.width = r.width + "px";
      wrap.style.height = bottom - top + "px";

      var leaf = document.createElement("div");
      leaf.className = "page-flip__leaf";
      var clip = document.createElement("div");
      clip.className = "page-flip__clip";

      var clone = page.cloneNode(true);
      clone.removeAttribute("id");
      clone.removeAttribute("tabindex");
      clone.setAttribute("aria-hidden", "true");
      Array.prototype.forEach.call(clone.querySelectorAll("[id]"), function (n) { n.removeAttribute("id"); });
      Array.prototype.forEach.call(clone.querySelectorAll("iframe,video,audio"), function (n) { n.remove(); });
      clone.style.width = r.width + "px";
      clone.style.top = r.top - top + "px";
      clip.appendChild(clone);

      var shade = document.createElement("div");
      shade.className = "page-flip__shade";

      leaf.appendChild(clip);
      leaf.appendChild(shade);
      wrap.appendChild(leaf);
      page.parentNode.appendChild(wrap);

      leaf.addEventListener("animationend", function (e) {
        if (e.target === leaf) wrap.remove();
      });
      setTimeout(function () { wrap.remove(); }, 1300);
    }

    // Вперёд: копируем старую страницу до того, как приложение её заменит.
    // Назад: ждём, пока появится новая страница, и «опускаем» её на место.
    if (dir > 0) run();
    else setTimeout(run, 0);
  }

  document.addEventListener(
    "click",
    function (e) {
      var b = e.target.closest ? e.target.closest("#nextSection, #prevSection") : null;
      if (!b || b.disabled) return;
      var dir = b.id === "nextSection" ? 1 : -1;
      if (skin === "book") flip(dir);
      if (skin === "vivid") {
        var rect = b.getBoundingClientRect();
        burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    },
    true
  );

  // Свайп влево/вправо по странице листает разделы (только в «Книге»)
  var sx = null, sy = 0, st = 0;
  document.addEventListener(
    "touchstart",
    function (e) {
      sx = null;
      if (skin !== "book" || e.touches.length !== 1) return;
      var t = e.target;
      if (!t.closest || !t.closest("#bookPage")) return;
      if (t.closest("input,textarea,select,button,a,table,pre,iframe,video,[contenteditable]")) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
    },
    { passive: true }
  );
  document.addEventListener(
    "touchend",
    function (e) {
      if (sx === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx;
      var dy = t.clientY - sy;
      sx = null;
      if (Date.now() - st > 600 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      if (window.getSelection && String(window.getSelection())) return; // человек выделяет текст
      var btn = document.getElementById(dx < 0 ? "nextSection" : "prevSection");
      if (btn && !btn.disabled) btn.click();
    },
    { passive: true }
  );

  // ───────────── Запуск ─────────────
  function init() {
    mountSwitch();
    trackPointer();
    var title = document.getElementById("sectionTitle");
    if (title) {
      new MutationObserver(retrigger).observe(title, { childList: true, characterData: true, subtree: true });
    }
    retrigger();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.ReaderSkins = { set: setSkin, get: function () { return skin; } };
})();
