(function(global){
"use strict";
const app=global.SetfeedAppAuth,recipients=global.SetfeedRecipients;if(!app||!recipients)return;
const MAX_BODY=2000,MIN_DELAY_MS=10*60*1000,IDEMPOTENCY=/^[A-Za-z0-9._:-]{8,160}$/,MESSAGE_ID=/^[A-Za-z0-9_-]{1,128}$/;
let presets=[],selected=null,submitting=false,pendingAttempt=null,activeUid="";
const $=id=>document.getElementById(id),plain=value=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
function setMessage(text,bad){const el=$("compose-message");if(!el)return;el