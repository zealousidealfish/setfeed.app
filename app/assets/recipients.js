(function (global) {
  "use strict";

  const app = global.SetfeedAppAuth;
  if (!app) return;

  const PROFILE_ID_PATTERN = /^prof_[A-Za-z0-9_-]{16,64}$/;
  const CONTACT_ID_PATTERN = /^ct_[A-Za-z0-9_-]{16,64}$/;
  const listeners = new Set();
  let selected = null;
  let contacts = [];
  let activeUid = "";
  let loadSequence = 0;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray