(function (global) {
  "use strict";

  const app = global.SetfeedAppAuth;
  const recipients = global.SetfeedRecipients;
  const core = global.SetfeedComposeCore;
  if (!app || !recipients || !core) return;

  let presets = [];
  let selected = null;
  let pendingAttempt = null;
  let submitting = false;
  let activeUid = "";
  let previousPresetText = "";

  const byId = (id) => document.getElementById(id);
  const plain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

  function showMessage(text, isError) {
    const element = byId("compose-message");
    if (!element) return;
    element.textContent = text || "";
    element.classList.toggle("app-error", Boolean(isError));
  }

  function setBusy(value) {
    submitting = value;
    const button = byId("compose-submit");
    if (button) {
      button.disabled = value || !selected;
      button.setAttribute("aria-busy", value ? "true" : "false");
      button.textContent = value ? "Scheduling…" : "Schedule Setfeed";
    }
  }

  function updateRecipientState() {
    const fieldset = byId("compose-fields");
    if (fieldset) fieldset.disabled = !selected || submitting;
    setBusy(submitting);
  }

  function countCharacters() {
    const textarea = byId("compose-body");
    const counter = byId("compose-count");
    if (counter) counter.textContent = `${textarea ? [...textarea.value].length : 0} / ${core.MAX_BODY}`;
  }

  function defaultSchedule() {
    const dateInput = byId("compose-date");
    const timeInput = byId("compose-time");
    if (!dateInput || !timeInput || dateInput.value || timeInput.value) return;
    const value = new Date(Date.now() + 60 * 60 * 1000);
    value.setMinutes(Math.ceil(value.getMinutes() / 5) * 5, 0, 0);
    dateInput.value = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    timeInput.value = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }

  function fillTimeZone(profile) {
    const input = byId("compose-timezone");
    if (!input || input.value) return;
    input.value = profile && profile.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  function validatePreset(value) {
    if (!plain(value) || typeof value.id !== "string" || typeof value.label !== "string" || typeof value.previewText !== "string" || value.version !== 1) {
      throw Object.assign(new Error("Setfeed returned invalid message presets."), { code: "malformed_backend_response" });
    }
    return Object.freeze({ id: value.id, label: value.label, previewText: value.previewText });
  }

  function renderPresets() {
    const select = byId("compose-preset");
    if (!select) return;
    select.replaceChildren();
    for (const preset of presets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      select.append(option);
    }
    const preferred = presets.find((preset) => preset.id === "personal") || presets[0];
    if (preferred) {
      select.value = preferred.id;
      applyPreset(preferred.id, true);
    }
  }

  async function loadPresets() {
    const result = await app.request("/v1/message-presets", { method: "GET" });
    if (!plain(result) || !Array.isArray(result.presets)) throw Object.assign(new Error("Setfeed returned invalid message presets."), { code: "malformed_backend_response" });
    presets = result.presets.map(validatePreset);
    if (!presets.length) throw Object.assign(new Error("No message presets are available."), { code: "malformed_backend_response" });
    renderPresets();
    return [...presets];
  }

  function applyPreset(id, force) {
    const preset = presets.find((item) => item.id === id);
    const textarea = byId("compose-body");
    if (!preset || !textarea) return;
    const mayReplace = force || !textarea.value.trim() || textarea.value === previousPresetText;
    previousPresetText = preset.previewText;
    if (mayReplace) textarea.value = preset.previewText;
    countCharacters();
  }

  function requestFingerprint(payload) {
    return core.fingerprint(payload);
  }

  function idempotencyFor(payload) {
    const value = requestFingerprint(payload);
    if (!pendingAttempt || pendingAttempt.fingerprint !== value) {
      pendingAttempt = { fingerprint: value, key: core.createIdempotencyKey() };
    }
    return pendingAttempt.key;
  }

  function isUncertain(error) {
    return Boolean(error) && ["network_timeout", "backend_unavailable", "request_cancelled"].includes(error.code);
  }

  function friendlyError(error) {
    const code = error && error.code;
    if (code === "recipient_unavailable" || code === "not_found") return "That recipient is no longer available.";
    if (code === "rate_limited") return error.retryAfterSeconds ? `Too many scheduling attempts. Try again in ${error.retryAfterSeconds} seconds.` : "Too many scheduling attempts. Try again later.";
    if (code === "idempotency_conflict" || code === "conflict") return "This draft changed during a previous attempt. Review it and try again.";
    if (code === "account_changed") return "The active account changed. Review the draft before trying again.";
    return error && error.message || "The Setfeed could not be scheduled.";
  }

  function resetForm() {
    const form = byId("compose-form");
    if (form) form.reset();
    pendingAttempt = null;
    previousPresetText = "";
    renderPresets();
    defaultSchedule();
    fillTimeZone(app.profile);
    countCharacters();
  }

  function renderSuccess(result) {
    const panel = byId("compose-success");
    const text = byId("compose-success-text");
    if (!panel || !text) return;
    const outbound = plain(result.outbound) ? result.outbound : {};
    const recipient = typeof outbound.recipientDisplayName === "string" ? outbound.recipientDisplayName : selected && selected.displayName || "the recipient";
    const delivery = typeof outbound.deliverAt === "string" ? new Date(outbound.deliverAt) : null;
    text.textContent = delivery && Number.isFinite(delivery.getTime())
      ? `Scheduled for ${recipient} on ${delivery.toLocaleString()}.`
      : `Scheduled for ${recipient}.`;
    panel.hidden = false;
  }

  function validateResponse(result) {
    if (!plain(result) || typeof result.messageId !== "string" || !/^msg_[A-Za-z0-9_-]+$/.test(result.messageId) || !plain(result.outbound) || result.sealed !== true || typeof result.created !== "boolean") {
      throw Object.assign(new Error("Setfeed returned an invalid scheduling response."), { code: "malformed_backend_response" });
    }
    return result;
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const success = byId("compose-success");
    if (success) success.hidden = true;
    try {
      setBusy(true);
      showMessage("Checking the schedule…", false);
      const payload = core.buildPayload({
        recipient: selected,
        presetId: byId("compose-preset") && byId("compose-preset").value,
        body: byId("compose-body") && byId("compose-body").value,
        date: byId("compose-date") && byId("compose-date").value,
        time: byId("compose-time") && byId("compose-time").value,
        timeZone: byId("compose-timezone") && byId("compose-timezone").value,
        now: new Date(),
      });
      const idempotencyKey = idempotencyFor(payload);
      showMessage("Scheduling securely…", false);
      const result = validateResponse(await app.request("/v1/person-messages", {
        method: "POST",
        body: { ...payload, idempotencyKey },
        retryAuth: true,
      }));
      pendingAttempt = null;
      renderSuccess(result);
      showMessage(result.created ? "Setfeed scheduled." : "Setfeed schedule confirmed.", false);
      resetForm();
      recipients.select(null);
    } catch (error) {
      if (isUncertain(error) && pendingAttempt) {
        showMessage(`${friendlyError(error)} Retry this unchanged draft to safely check the same request.`, true);
      } else {
        if (error && ["idempotency_conflict", "conflict", "account_changed"].includes(error.code)) pendingAttempt = null;
        showMessage(friendlyError(error), true);
      }
    } finally {
      setBusy(false);
      updateRecipientState();
    }
  }

  function bind() {
    const form = byId("compose-form");
    const preset = byId("compose-preset");
    const body = byId("compose-body");
    if (form) form.addEventListener("submit", submit);
    if (preset) preset.addEventListener("change", () => applyPreset(preset.value, false));
    if (body) body.addEventListener("input", countCharacters);
    defaultSchedule();
    countCharacters();
    recipients.subscribe((state) => {
      selected = state.selected;
      updateRecipientState();
      if (selected) showMessage("Recipient selected. Complete the message and schedule.", false);
    });
    app.subscribe((state) => {
      const uid = state.user && state.profile && state.profile.onboardingCompleted ? state.user.uid : "";
      fillTimeZone(state.profile);
      if (uid === activeUid) return;
      activeUid = uid;
      pendingAttempt = null;
      if (uid) loadPresets().catch((error) => showMessage(friendlyError(error), true));
    });
  }

  global.addEventListener("setfeed:account-change", () => {
    pendingAttempt = null;
    selected = null;
    const body = byId("compose-body");
    if (body) body.value = "";
    updateRecipientState();
  });

  global.SetfeedCompose = {
    loadPresets,
    submit,
    resetForm,
    get pendingIdempotencyKey() { return pendingAttempt && pendingAttempt.key || null; },
    _test: { validatePreset, requestFingerprint, idempotencyFor, isUncertain, validateResponse },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(window);
