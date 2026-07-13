(function () {
  "use strict";

  const routes = Object.freeze({
    dashboard: "./index.html",
    send: "./send.html",
    upcoming: "./upcoming.html",
    awaiting: "./awaiting.html",
    inbox: "./inbox.html",
    feed: "./feed.html",
    sent: "./sent.html",
    settings: "./settings.html",
    websiteHome: "../index.html"
  });

  const firebaseConfig = Object.freeze({
    apiKey: "AIzaSyCECKG-00tijJrt5qvRy3L27ZzE7bocNrU",
    authDomain: "setfeed-fcd7a.firebaseapp.com",
    projectId: "setfeed-fcd7a",
    storageBucket: "setfeed-fcd7a.firebasestorage.app",
    messagingSenderId: "553573263069",
    appId: "1:553573263069:web:e5c9884101ca38eaee1d34"
  });

  window.SetfeedAppConfig = Object.freeze({
    apiBaseUrl: "https://setfeed-integrations-ocsbsvnzsa-nw.a.run.app",
    firebaseConfig,
    routes
  });
})();
