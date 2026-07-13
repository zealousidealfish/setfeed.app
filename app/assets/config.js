(function () {
  "use strict";

  const routes = Object.freeze({
    dashboard: "./index.html",
    send: "./send.html",
    upcoming: "./upcoming.html",
    awaiting: "./awaiting.html",
    inbox: "./inbox.html",
    sent: "./sent.html",
    settings: "./settings.html",
    websiteHome: "../index.html"
  });

  window.SetfeedAppConfig = Object.freeze({
    apiBaseUrl: "https://setfeed-integrations-ocsbsvnzsa-nw