(function(global){
"use strict";
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const SOURCES=new Set(["inbound","discord_self"]);
function plain(v){return Boolean(v)&&typeof v==="object"&&!Array.isArray(v);}
function fail(){const e=new Error("Setfeed returned invalid message data.");e.code="malformed_backend_response";throw e;}
function iso(v){if(typeof v!=="string")fail();const d=new Date(v);if(!Number.isFinite(d.getTime()))fail();return d.toISOString();}
function optionalIso(v){return v===null||v===undefined?null:iso(v);}
function normalize(value){
 if(!plain(value)||!ID.test(value.id||"")||value.status!=="scheduled"||!SOURCES.has(value.source)||!Number.isSafeInteger(value.version)||value.version<1)fail();
 const deliverAt=iso(value.deliverAt),awaitingAt=optionalIso(value.awaitingAt);
 return Object.freeze({
  id:value.id,deliverAt,awaitingAt,source:value.source,origin:value.origin==="inbound"?"inbound":"local",version:value.version,
  senderDisplayName:typeof value.senderDisplayName==="string"&&value.senderDisplayName.trim()?value.senderDisplayName.trim():null,
  senderUsername:typeof value.senderUsername==="string"&&value.senderUsername.trim()?value.senderUsername.trim():null
 });
}
function parsePage(value){
 if(!plain(value)||!Array.isArray(value.messages)||typeof value.hasMore!=="boolean"||!(value.nextCursor===null||typeof value.nextCursor==="string"))fail();
 return Object.freeze({messages:value.messages.filter(v=>plain(v)&&v.status==="scheduled"&&SOURCES.has(v.source)).map(normalize),hasMore:value.hasMore,nextCursor:value.nextCursor,serverTime:typeof value.serverTime==="string"?iso(value.serverTime):null});
}
function split(messages){return {upcoming:messages.filter(m=>!m.awaitingAt),awaiting:messages.filter(m=>Boolean(m.awaitingAt))};}
function mutation(value){
 if(!plain(value)||typeof value.awaiting!=="boolean"||typeof value.discordLinked!=="boolean"||typeof value.receivingEnabled!=="boolean"||!plain(value.message))fail();
 const message=normalize(value.message);
 return Object.freeze({message,awaiting:value.awaiting,discordLinked:value.discordLinked,receivingEnabled:value.receivingEnabled,releaseNotification:value.releaseNotification==="will_ping"||value.releaseNotification==="enable_discord_receiving"||value.releaseNotification==="unavailable"?value.releaseNotification:"unavailable"});
}
function sourceLabel(message){return message.source==="discord_self"?"From /setfeed self":"From "+(message.senderDisplayName||"another Setfeed user");}
function notificationText(result){if(result.releaseNotification==="will_ping")return"Discord release notification is enabled.";if(result.releaseNotification==="enable_discord_receiving")return"Discord is linked, but receiving must be enabled with /setfeed receiving enabled:true.";return"Discord release notification is unavailable until the account is linked.";}
global.SetfeedMessageListsCore=Object.freeze({normalize,parsePage,split,mutation,sourceLabel,notificationText});
})(window);