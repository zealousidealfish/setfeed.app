(function () {
  "use strict";
  const API_BASE_URL = "https://setfeed-integrations-ocsbsvnzsa-nw.a.run.app";
  const VERIFIER_KEY = "sf_discord_oauth_verifier_v1";
  const STARTED_KEY = "sf_discord_oauth_started_ms_v1";
  const DESTINATION_KEY = "sf_discord_oauth_destination_v1";
  const INTENT_KEY = "sf_discord_oauth_intent_v1";
  const IN_FLIGHT_KEY = "sf_discord_oauth_exchange_in_flight_v1";
  const STATE_TTL_MS = 10 * 60 * 1000;
  const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  const RESULT_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
  const ALLOWED_DESTINATIONS = new Set(["/", "/index.html", "/send.html", "/send.html#signin", "/inbox.html", "/inbox.html#hidden", "/receive.html", "/discord-link.html"]);
  const DEFAULT_DESTINATION = "/inbox.html";
  const errorMessages = {
    access_denied: ["Sign-in cancelled", "Discord sign-in was cancelled. You can start again when you are ready."],
    invalid_or_expired_state: ["Sign-in expired", "This Discord sign-in expired. Start a new Discord sign-in to continue."],
    invalid_or_expired_result: ["Sign-in expired", "This Discord sign-in result expired or was already used. Start a new Discord sign-in."],
    discord_exchange_failed: ["Discord sign-in failed", "Discord sign-in could not be completed. Start a new Discord sign-in to try again."],
    discord_profile_failed: ["Discord unavailable", "Discord profile verification failed. Try again later."],
    discord_not_linked: ["Discord account not linked", "This Discord account is not linked to Setfeed. Create a new Setfeed account with Discord, or use another sign-in method for an existing account."],
    invalid_intent: ["Restart required", "That Discord sign-in option was invalid. Start again."],
    malformed_intent: ["Restart required", "This Discord sign-in type was invalid. Start a new Discord sign-in."],
    already_signed_in: ["Already signed in", "Sign out before creating a separate Setfeed account with Discord."],
    active_session_changed: ["Another Setfeed session is active", "Setfeed did not replace the active session. Sign out, then use Continue with Discord with the same Discord account."],
    discord_already_linked: ["Use Continue with Discord", "This Discord account already has a Setfeed account. Use Continue with Discord to sign in."],
    firebase_uid_already_linked: ["Account could not be created", "Setfeed could not safely create this account. Nothing was reassigned. Try again later."],
    firebase_provisioning_unavailable: ["Account creation unavailable", "Setfeed could not create your account right now. Try again later."],
    provisioning_conflict: ["Account creation could not continue", "Setfeed could not safely finish creating this account. Nothing was merged or reassigned. Try again later."],
    firebase_account_mismatch: ["Different Setfeed account", "That Discord account is associated with a different Setfeed account. Sign out only if you intentionally want to use a different account; Setfeed will not merge or switch accounts automatically."],
    firebase_user_unavailable: ["Setfeed account unavailable", "Your Setfeed session was unavailable. Sign in again, then start a new Discord sign-in."],
    rate_limited: ["Try again later", "Too many attempts. Wait a little while, then start a new Discord sign-in."],
    invalid_firebase_token: ["Sign in again", "Your Setfeed session could not be verified. Sign in again, then start a new Discord sign-in."],
    internal_error: ["Service unavailable", "Setfeed could not complete Discord sign-in right now. Try again later."],
    missing_result: ["Restart required", "The Discord sign-in result was missing or malformed. Start a new Discord sign-in."],
    missing_verifier: ["Restart required", "This tab no longer has the Discord sign-in verifier. Start a new Discord sign-in."],
    malformed_verifier: ["Restart required", "The Discord sign-in verifier was invalid. Start a new Discord sign-in."],
    stale_verifier: ["Sign-in expired", "This Discord sign-in is too old. Start a new Discord sign-in."],
    unsafe_destination: ["Safe redirect blocked", "Setfeed blocked an unsafe return destination. Start again from the page you want to use."],
    network_failure: ["Network issue", "Setfeed could not reach the Discord sign-in service. Check your connection and start again."],
    ambiguous_exchange_outcome: ["Sign-in not confirmed", "Setfeed could not confirm whether this single-use Discord sign-in succeeded. Start a completely new Discord sign-in."],
    backend_unavailable: ["Service unavailable", "Discord sign-in is temporarily unavailable. Try again later."],
    malformed_json_response: ["Service response invalid", "Setfeed received an invalid sign-in response. Start a new Discord sign-in."],
    invalid_authorization_url: ["Service response invalid", "Setfeed received an invalid Discord authorization URL and did not redirect."],
    firebase_custom_token_sign_in_failed: ["Setfeed sign-in failed", "Firebase could not complete this Discord sign-in. Start a new Discord sign-in."],
  };
  function base64url(bytes) { let s = btoa(String.fromCharCode(...bytes)); return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  async function sha256Base64url(value) { const data = new TextEncoder().encode(value); return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", data))); }
  function generateVerifier() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return base64url(bytes); }
  function sanitizeDestination(input) {
    const fallback = DEFAULT_DESTINATION;
    if (!input) return fallback;
    let raw = String(input).trim();
    try { raw = decodeURIComponent(raw); } catch (_) {}
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return fallback;
    let url;
    try { url = new URL(raw, window.location.origin); } catch (_) { return fallback; }
    if (url.origin !== window.location.origin) return fallback;
    if (url.searchParams.has("discord_result") || url.searchParams.has("discord_error")) return fallback;
    const value = url.pathname + url.search + url.hash;
    const allowedKey = url.pathname + url.hash;
    return ALLOWED_DESTINATIONS.has(allowedKey) && !url.search ? value : fallback;
  }
  function clearState() { [VERIFIER_KEY, STARTED_KEY, DESTINATION_KEY, INTENT_KEY, IN_FLIGHT_KEY].forEach((k) => { try { sessionStorage.removeItem(k); } catch (_) {} }); }
  function validateIntent(intent) {
    if (intent === undefined || intent === "continue") return "continue";
    if (intent === "create_account") return "create_account";
    throw { code:"invalid_intent" };
  }
  function storeState(verifier, destination, intent) { clearState(); sessionStorage.setItem(VERIFIER_KEY, verifier); sessionStorage.setItem(STARTED_KEY, String(Date.now())); sessionStorage.setItem(DESTINATION_KEY, sanitizeDestination(destination)); sessionStorage.setItem(INTENT_KEY, intent); }
  function validateStoredState() {
    let verifier = "", started = "", destination = "", storedIntent = null;
    try { verifier = sessionStorage.getItem(VERIFIER_KEY) || ""; started = sessionStorage.getItem(STARTED_KEY) || ""; destination = sessionStorage.getItem(DESTINATION_KEY) || ""; storedIntent = sessionStorage.getItem(INTENT_KEY); } catch (_) { clearState(); return { ok:false, code:"missing_verifier" }; }
    if (!verifier) { clearState(); return { ok:false, code:"missing_verifier" }; }
    if (!VERIFIER_PATTERN.test(verifier)) { clearState(); return { ok:false, code:"malformed_verifier" }; }
    const startedMs = Number(started);
    if (!Number.isFinite(startedMs) || startedMs <= 0 || Date.now() - startedMs > STATE_TTL_MS) { clearState(); return { ok:false, code:"stale_verifier" }; }
    const safeDestination = sanitizeDestination(destination);
    if (!destination || safeDestination !== destination) { clearState(); return { ok:false, code:"unsafe_destination" }; }
    const intent = storedIntent === null ? "continue" : storedIntent;
    if (intent !== "continue" && intent !== "create_account") { clearState(); return { ok:false, code:"malformed_intent" }; }
    return { ok:true, verifier, destination: safeDestination, intent };
  }
  function validateAuthorizationUrl(value) {
    let url; try { url = new URL(value); } catch (_) { return false; }
    if (url.protocol !== "https:" || url.hostname !== "discord.com" || url.port || url.pathname !== "/oauth2/authorize" || url.username || url.password || url.hash) return false;
    for (const key of ["client_id", "redirect_uri", "response_type", "scope", "state"]) {
      const all = url.searchParams.getAll(key); if (all.length !== 1 || !all[0]) return false;
    }
    if (url.searchParams.get("response_type") !== "code") return false;
    return url.searchParams.get("scope").split(/\s+/).includes("identify");
  }
  async function waitForInitialAuthState(auth) {
    if (!auth) return null;
    if (typeof auth.authStateReady === "function") {
      try { await auth.authStateReady(); }
      catch (_) { throw { code:"firebase_user_unavailable" }; }
      return auth.currentUser || null;
    }
    if (typeof auth.onAuthStateChanged === "function") {
      return await new Promise((resolve, reject) => {
        let unsubscribe = null;
        let shouldUnsubscribe = false;
        const finish = (user) => {
          if (unsubscribe) unsubscribe();
          else shouldUnsubscribe = true;
          resolve(user || null);
        };
        const fail = () => {
          if (unsubscribe) unsubscribe();
          else shouldUnsubscribe = true;
          reject({ code:"firebase_user_unavailable" });
        };
        try {
          unsubscribe = auth.onAuthStateChanged(finish, fail);
          if (shouldUnsubscribe && unsubscribe) unsubscribe();
        } catch (_) {
          reject({ code:"firebase_user_unavailable" });
        }
      });
    }
    return auth.currentUser || null;
  }
  async function currentIdToken(auth) {
    if (!auth || !auth.currentUser || typeof auth.currentUser.getIdToken !== "function") return "";
    try { return await auth.currentUser.getIdToken(); }
    catch (_) { clearState(); throw { code:"firebase_user_unavailable" }; }
  }
  function stableErrorCode(json) {
    if (json && json.error && typeof json.error.code === "string" && json.error.code) return json.error.code;
    if (json && typeof json.error === "string" && json.error) return json.error;
    return "";
  }
  function responseFallbackCode(response) {
    return response && response.status >= 500 ? "backend_unavailable" : "internal_error";
  }
  async function startDiscordSignIn({ auth, destination, intent = "continue" } = {}) {
    const safeIntent = validateIntent(intent);
    if (safeIntent === "create_account" && await waitForInitialAuthState(auth)) throw { code:"already_signed_in" };
    const verifier = generateVerifier();
    if (!VERIFIER_PATTERN.test(verifier)) throw { code:"malformed_verifier" };
    const challenge = await sha256Base64url(verifier);
    storeState(verifier, destination, safeIntent);
    const headers = { "Content-Type": "application/json" };
    let token = ""; try { token = await currentIdToken(auth); } catch (error) { throw error; }
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetch(`${API_BASE_URL}/v1/auth/discord/start`, { method:"POST", headers, body: JSON.stringify(safeIntent === "create_account" ? { codeChallenge: challenge, intent: "create_account" } : { codeChallenge: challenge }) }); } catch (_) { clearState(); throw { code:"network_failure" }; }
    let json = null; try { json = await response.json(); } catch (_) {}
    if (!response.ok) { const code = stableErrorCode(json) || responseFallbackCode(response); clearState(); throw { code, retryAfter: parseRetryAfter(response) }; }
    if (!json || typeof json.authorizationUrl !== "string") { clearState(); throw { code:"malformed_json_response" }; }
    if (!validateAuthorizationUrl(json.authorizationUrl)) { clearState(); throw { code:"invalid_authorization_url" }; }
    return json.authorizationUrl;
  }
  function parseRetryAfter(response) { const raw = response && response.headers && response.headers.get("Retry-After"); return /^\d+$/.test(raw || "") ? Number(raw) : null; }
  function parseResultFragment(hash) {
    const raw = (hash || "").replace(/^#/, ""); if (!raw) return { ok:false, code:"missing_result" };
    const params = new URLSearchParams(raw); const keys = Array.from(params.keys());
    if (keys.some((k) => k !== "discord_result" && k !== "discord_error")) return { ok:false, code:"missing_result" };
    const results = params.getAll("discord_result"), errors = params.getAll("discord_error");
    if ((results.length === 1) === (errors.length === 1) || results.length > 1 || errors.length > 1) return { ok:false, code:"missing_result" };
    if (results.length === 1) return RESULT_PATTERN.test(results[0]) ? { ok:true, resultCode:results[0] } : { ok:false, code:"missing_result" };
    return errors[0] ? { ok:false, code: errors[0] } : { ok:false, code:"missing_result" };
  }
  async function exchangeDiscordResult({ auth, resultCode } = {}) {
    if (!RESULT_PATTERN.test(resultCode || "")) { clearState(); throw { code:"missing_result" }; }
    if (sessionStorage.getItem(IN_FLIGHT_KEY) === "1") throw { code:"ambiguous_exchange_outcome" };
    const state = validateStoredState(); if (!state.ok) throw { code: state.code };
    sessionStorage.setItem(IN_FLIGHT_KEY, "1");
    const headers = { "Content-Type":"application/json" }; let token = ""; try { token = await currentIdToken(auth); } catch (error) { clearState(); throw error; } if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetch(`${API_BASE_URL}/v1/auth/discord/exchange`, { method:"POST", headers, body: JSON.stringify({ resultCode, codeVerifier: state.verifier }) }); } catch (_) { clearState(); throw { code:"ambiguous_exchange_outcome" }; }
    let json = null; try { json = await response.json(); } catch (_) {}
    if (!response.ok) { const code = stableErrorCode(json) || responseFallbackCode(response); clearState(); throw { code, retryAfter: parseRetryAfter(response) }; }
    if (!json || typeof json.firebaseCustomToken !== "string" || !json.firebaseCustomToken) { clearState(); throw { code:"malformed_json_response" }; }
    return { firebaseCustomToken: json.firebaseCustomToken, destination: state.destination, intent: state.intent };
  }
  function mapError(code, retryAfter) { const pair = errorMessages[code] || errorMessages.internal_error; const line = code === "rate_limited" && Number.isInteger(retryAfter) ? `Too many attempts. Try again in ${retryAfter} seconds.` : pair[1]; return { title: pair[0], message: line, code: errorMessages[code] ? code : "internal_error" }; }
  window.SetfeedDiscordAuth = { API_BASE_URL, DEFAULT_DESTINATION, STATE_TTL_MS, startDiscordSignIn, exchangeDiscordResult, parseResultFragment, validateAuthorizationUrl, validateStoredState, sanitizeDestination, clearState, mapError, waitForInitialAuthState, _test: { generateVerifier, sha256Base64url, stableErrorCode, waitForInitialAuthState, VERIFIER_KEY, STARTED_KEY, DESTINATION_KEY, INTENT_KEY, IN_FLIGHT_KEY } };
})();
