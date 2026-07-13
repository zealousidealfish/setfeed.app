(function () {
  "use strict";

  const config = window.SetfeedAppConfig;
  if (!config) throw new Error("Setfeed app configuration is missing.");

  const pages = [
    ["dashboard", "Home"],
    ["send", "Send"],
    ["upcoming", "Upcoming"],
    ["awaiting", "Awaiting"],
    ["inbox", "Inbox"],
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

  function navigation(activePage, className) {
    return `<nav class="${className}" aria-label="Setfeed app">${pages.map(([key, label]) => {
      const current = key === activePage ? ' aria-current="page"' : "";
      return `<a href="${config.routes[key]}"${current}>${escapeHtml(label)}</a>`;
    }).join("")}</nav>`;
  }

  function applyTheme() {
    const root = document.documentElement;
    let stored = "system";
    try { stored = localStorage.getItem("sf_theme_mode") || "system"; } catch (_) {}
    if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);
    else root.removeAttribute("data-theme");
  }

  function render() {
    applyTheme();
    const page = document.body.dataset.appPage || "dashboard";
    const title = document.body.dataset.appTitle || "Setfeed";
    const description = document.body.dataset.appDescription || "Manage your Setfeed account.";
    const content = document.getElementById("app-page-content");
    const root = document.getElementById("setfeed-app");
    if (!content || !root) return;

    root.innerHTML = `
      <header class="site-header">
        <div class="header-inner">
          <a class="brand-mark" href="${config.routes.websiteHome}" aria-label="Setfeed home"><img class="logo" src="../logo.png" alt="" aria-hidden="true"></a>
          <a class="brand-title" href="${config.routes.dashboard}">Setfeed</a>
          <a class="btn btn-quiet" href="${config.routes.websiteHome}">Website</a>
        </div>
      </header>
      <main class="wrap">
        ${navigation(page, "app-mobile-nav")}
        <div class="app-layout">
          <aside class="app-sidebar">${navigation(page, "app-nav")}</aside>
          <section class="app-main" aria-labelledby="app-page-title">
            <div class="app-topbar">
              <div><p class="app-kicker">Setfeed web app</p><h1 class="app-title" id="app-page-title">${escapeHtml(title)}</h1><p class="lead">${escapeHtml(description)}</p></div>
              <span class="app-status" id="app-auth-status">Sign-in connection pending</span>
            </div>
            <div id="app-content-slot"></div>
          </section>
        </div>
      </main>`;

    const slot = document.getElementById("app-content-slot");
    if (slot) slot.append(content);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
