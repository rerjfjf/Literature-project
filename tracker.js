/**
 * tracker.js — единый сборщик событий для Book / dialog / litfair.
 *
 * Подключение (в конце <body>, перед закрывающим тегом):
 *   <script src="/tracker.js" data-service="book" data-hub="https://admin.example.com"></script>
 *
 * data-service — обязателен: 'book' | 'dialog' | 'litfair'
 * data-hub     — базовый URL сервиса hub (без слэша на конце).
 *                Если не указан — берётся window.HUB_URL, иначе '' (same-origin, если настроен прокси в nginx).
 *
 * Автоматически:
 *  - создаёт/переиспользует anon_id (localStorage, живёт до регистрации и после)
 *  - шлёт page_view при загрузке страницы и при смене hash (для SPA-разделов учебника)
 *  - шлёт ai_request и task_click, если на странице вызывают window.hubTrack(...)
 *    или кликают по элементам с атрибутом data-track="тип:label"
 */
(function () {
  const scriptTag = document.currentScript;
  const SERVICE = scriptTag?.dataset?.service || 'unknown';
  const HUB_BASE = scriptTag?.dataset?.hub || window.HUB_URL || '';
  const ANON_KEY = 'hub_anon_id';
  // Если навигация в приложении идёт через history.pushState (а не через
  // изменение location.hash напрямую) — событие 'hashchange' не сработает.
  // В этом случае ставьте data-manual-pageview="true" и вызывайте
  // window.hubTrack('page_view', {...}) вручную из точки рендера раздела.
  const MANUAL_PAGEVIEW = scriptTag?.dataset?.manualPageview === 'true';

  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    // Фолбэк для старых браузеров
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getAnonId() {
    try {
      let id = localStorage.getItem(ANON_KEY);
      if (!id) {
        id = uuid();
        localStorage.setItem(ANON_KEY, id);
      }
      return id;
    } catch {
      // localStorage недоступен (приватный режим и т.п.) — используем сессионный id в памяти
      window.__hubAnonFallback = window.__hubAnonFallback || uuid();
      return window.__hubAnonFallback;
    }
  }

  const anonId = getAnonId();

  function send(eventType, { entityId, label, payload } = {}) {
    const body = JSON.stringify({
      anonId,
      service: SERVICE,
      eventType,
      entityId,
      label,
      payload,
      path: location.pathname + location.hash,
    });

    const url = (HUB_BASE || '') + '/api/track';

    // sendBeacon переживает уход со страницы (важно для page_view при переходе).
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'include',
    }).catch(() => {
      // Тихо игнорируем сетевые ошибки трекинга — не должно ломать основной сайт
    });
  }

  function trackPageView() {
    send('page_view', {
      entityId: location.hash || location.pathname,
      label: document.title,
    });
  }

  // Публичный API — вызывайте вручную для AI-запросов, отправки заданий и т.п.
  // Примеры:
  //   window.hubTrack('ai_request', { entityId: 'tvardovsky:section-1', label: 'Вопрос об авторе' });
  //   window.hubTrack('task_click', { entityId: taskId, label: taskTitle });
  window.hubTrack = function (eventType, opts) {
    send(eventType, opts || {});
  };

  // Автоматический сбор кликов по элементам с data-track="тип:label"
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (!el) return;
    const [eventType, ...labelParts] = el.dataset.track.split(':');
    send(eventType || 'click', {
      entityId: el.dataset.trackId || null,
      label: labelParts.join(':') || el.textContent?.trim()?.slice(0, 120),
    });
  });

  // page_view при первой загрузке и при смене раздела (hash-роутинг).
  // В ручном режиме (MANUAL_PAGEVIEW) ничего не шлём автоматически —
  // вызывающий код сам решает, когда считать это "просмотром страницы".
  if (!MANUAL_PAGEVIEW) {
    trackPageView();
    window.addEventListener('hashchange', trackPageView);
    window.addEventListener('popstate', trackPageView);
  }
})();
