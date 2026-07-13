(function (global) {
  "use strict";

  const MAX_BODY = 2000;
  const MIN_DELAY_MS = 10 * 60 * 1000;
  const MAX_ZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

  function error(code, message) {
    const value = new Error(message);
    value.code = code;
    return value;
  }

  function parseLocal(dateValue, timeValue) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ""));
    const clock = /^(\d{2}):(\d{2})$/.exec(String(timeValue || ""));
    if (!match || !clock) throw error("invalid_schedule", "Choose a valid delivery date and time.");
    const parts = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(clock[1]),
      minute: Number(clock[2]),
    };
    const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
    if (
      check.getUTCFullYear() !== parts.year ||
      check.getUTCMonth() + 1 !== parts.month ||
      check.getUTCDate() !== parts.day ||
      check.getUTCHours() !== parts.hour ||
      check.getUTCMinutes() !== parts.minute
    ) throw error("invalid_schedule", "Choose a valid delivery date and time.");
    return parts;
  }

  function formatter(timeZone) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    } catch (_) {
      throw error("invalid_time_zone", "Enter a valid IANA time zone, such as Europe/London.");
    }
  }

  function zonedParts(format, instantMs) {
    const values = {};
    for (const part of format.formatToParts(new Date(instantMs))) {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    }
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
    };
  }

  function sameMinute(left, right) {
    return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute;
  }

  function localToInstant(dateValue, timeValue, timeZone) {
    const target = parseLocal(dateValue, timeValue);
    const format = formatter(String(timeZone || "").trim());
    const naive = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
    const offsets = new Set();
    for (let hours = -48; hours <= 48; hours += 6) {
      const sample = naive + hours * 60 * 60 * 1000;
      const local = zonedParts(format, sample);
      const represented = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second || 0);
      offsets.add(represented - sample);
    }
    const candidates = [];
    for (const offset of offsets) {
      if (!Number.isFinite(offset) || Math.abs(offset) > MAX_ZONE_OFFSET_MS) continue;
      const candidate = naive - offset;
      if (sameMinute(zonedParts(format, candidate), target)) candidates.push(candidate);
    }
    const unique = [...new Set(candidates)];
    if (unique.length === 0) throw error("nonexistent_local_time", "That local time does not exist because the clocks change. Choose another time.");
    if (unique.length > 1) throw error("ambiguous_local_time", "That local time occurs twice because the clocks change. Choose another time.");
    return new Date(unique[0]);
  }

  function validateBody(value) {
    const body = String(value || "").trim();
    if (!body) throw error("blank_message", "Write a message before scheduling it.");
    if ([...body].length > MAX_BODY) throw error("message_too_long", `Messages can contain up to ${MAX_BODY} characters.`);
    for (const character of body) {
      const code = character.codePointAt(0) || 0;
      if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
        throw error("invalid_message", "The message contains an unsupported control character.");
      }
    }
    return body;
  }

  function validateSchedule(deliverAt, nowValue) {
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(deliverAt.getTime())) throw error("invalid_schedule", "Choose a valid delivery time.");
    if (deliverAt.getTime() < now.getTime() + MIN_DELAY_MS) throw error("delivery_too_soon", "Schedule the message at least 10 minutes from now.");
    const maximum = new Date(now.getTime());
    maximum.setUTCFullYear(maximum.getUTCFullYear() + 1);
    if (deliverAt.getTime() > maximum.getTime()) throw error("delivery_too_late", "Schedule the message no more than one year from now.");
    return deliverAt.toISOString();
  }

  function createIdempotencyKey(cryptoImpl) {
    const source = cryptoImpl || global.crypto;
    if (source && typeof source.randomUUID === "function") return `web-person:${source.randomUUID()}`;
    if (!source || typeof source.getRandomValues !== "function") throw error("random_unavailable", "A secure request identifier could not be created.");
    const bytes = new Uint8Array(24);
    source.getRandomValues(bytes);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `web-person:${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
  }

  function fingerprint(payload) {
    return JSON.stringify([
      payload.recipientPublicProfileId,
      payload.body,
      payload.presetId,
      payload.deliverAt,
    ]);
  }

  function buildPayload(input) {
    if (!input.recipient || typeof input.recipient.publicProfileId !== "string") throw error("recipient_required", "Choose a recipient before scheduling the message.");
    const presetId = String(input.presetId || "");
    if (!presetId) throw error("invalid_preset", "Choose a message preset.");
    const body = validateBody(input.body);
    const deliverAt = validateSchedule(localToInstant(input.date, input.time, input.timeZone), input.now);
    return {
      recipientPublicProfileId: input.recipient.publicProfileId,
      body,
      presetId,
      deliverAt,
    };
  }

  global.SetfeedComposeCore = Object.freeze({
    MAX_BODY,
    MIN_DELAY_MS,
    localToInstant,
    validateBody,
    validateSchedule,
    createIdempotencyKey,
    fingerprint,
    buildPayload,
  });
})(window);
