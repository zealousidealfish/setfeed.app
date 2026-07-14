(function () {
  "use strict";

  const config = window.SetfeedAppConfig;
  if (!config) throw new Error("Setfeed app configuration is missing.");

  if (typeof window.fetch === "function") {
    window.fetch = window.fetch.bind(window);
  }

  window.addEventListener("setfeed:auth-error", (event) => {
    const detail = event && event.detail ? event.detail : {};
    const text = detail.message || detail.code || "Account could not be loaded.";
    window.setTimeout(() => {
      const status = document.getElementById("app-auth-status");
      if (!status) return;
      status.textContent = `Account error: ${text}`;
      status.dataset.kind = "warn";
    }, 0);
  });

  const pages = [
    ["dashboard", "Home"],
    ["send", "Send"],
    ["upcoming", "Upcoming"],
    ["awaiting", "Awaiting"],
    ["inbox", "Inbox"],
    ["feed", "Feed"],
    ["sent", "Sent"],
    ["settings", "Settings"]
  ];

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }

  function navigation(active, className) {
    return `<nav class="${className}" aria-label="Setfeed app">${pages
      .map(([key, label]) => `<a href="${config.routes[key]}"${key === active ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`)
      .join("")}</nav>`;
  }

  function applyTheme() {
    let value = "system";
    try {
      value = localStorage.getItem("sf_theme_mode") || "system";
    } catch (_) {}
    if (value === "light" || value === "dark") {
      document.documentElement.setAttribute("data-theme", value);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function load(source) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${source}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") resolve();
        else existing.addEventListener("load", resolve, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = source;
      script.onload = () => {
        script.dataset.loaded = "1";
        resolve();
      };
      script.onerror = reject;
      document.head.append(script);
    });
  }

  async function start() {
    try {
      if (!window.firebase) await load("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
      if (!window.firebase || !firebase.auth) await load("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js");
      if (!window.SetfeedDiscordAuth) await load("../assets/discord-auth.js");
      if (!window.SetfeedJsonApiClient) await load("./assets/api.js");
      if (!window.SetfeedAppAuth) await load("./assets/auth-core.js");
      await load("./assets/auth-ui.js");

      const page = document.body.dataset.appPage;
      if (page === "dashboard") await load("./assets/dashboard.js");
      if (page === "settings") await load("./assets/settings-status.js");
      if (page === "send") {
        await load("./assets/recipients.js");
        await load("./assets/compose-core.js");
        await load("./assets/compose.js");
      }
      if (page === "upcoming" || page === "awaiting") {
        await load("./assets/message-lists-core.js");
        await load("./assets/message-lists-data.js");
        await load("./assets/message-lists-ui.js");
      }
      if (page === "inbox" || page === "sent") await load("./assets/inbox-sent-core.js");
      if (page === "inbox") {
        await load("./assets/inbox-data.js");
        await load("./assets/inbox-ui.js");
      }
      if (page === "sent") {
        await load("./assets/sent-data.js");
        await load("./assets/sent-ui.js");
      }
      if (page === "feed") {
        await load("./assets/feed-core.js");
        await load("./assets/feed-data.js");
        await load("./assets/feed-ui.js");
      }
    } catch (_) {
      const status = document.getElementById("app-auth-status");
      if (status) status.textContent = "Sign-in unavailable";
    }
  }

  function render() {
    applyTheme();
    const page = document.body.dataset.appPage || "dashboard";
    const title = document.body.dataset.appTitle || "Setfeed";
    const description = document.body.dataset.appDescription || "Manage your Setfeed account.";
    const content = document.getElementById("app-page-content");
    const root = document.getElementById("setfeed-app");
    if (!content || !root) return;

    root.innerHTML = `<header class="site-header"><div class="header-inner"><a class="brand-mark" href="${config.routes.websiteHome}" aria-label="Setfeed home"><img class="logo" src="../logo.png" alt="" aria-hidden="true"></a><a class="brand-title" href="${config.routes.dashboard}">Setfeed</a><a class="btn btn-quiet" href="${config.routes.websiteHome}">Website</a></div></header><main class="wrap">${navigation(page, "app-mobile-nav")}<div class="app-layout"><aside class="app-sidebar">${navigation(page, "app-nav")}</aside><section class="app-main" aria-labelledby="app-page-title"><div class="app-topbar"><div><p class="app-kicker">Setfeed web app</p><h1 class="app-title" id="app-page-title">${escapeHtml(title)}</h1><p class="lead">${escapeHtml(description)}</p></div><span class="app-status" id="app-auth-status">Checking sign-in…</span></div><div id="app-content-slot"></div></section></div></main>`;
    document.getElementById("app-content-slot").append(content);
    document.body.classList.add("app-shell-ready");
    start();
  }

  window.SetfeedAppShell = { render };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
})();