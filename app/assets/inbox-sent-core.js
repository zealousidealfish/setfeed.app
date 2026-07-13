(function(global){
"use strict";
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const OUTBOUND_STATUS=new Set(["scheduled","released","cancelled"]);
const NOTICE_STATUS=new Set(["not_requested","not_eligible","pending","sent","skipped","failed"]);
function plain(v){return Boolean(v)&&typeof v==="object"&&!Array.isArray(v);}
function fail(){const e=new Error("Setfeed returned invalid message data.");e.code="malformed_backend_response";throw e;}
function iso(v){if(typeof v!=="string")fail();const d=new Date(v);if(!Number.isFinite(d.getTime()))fail();return d.toISOString();}
function optionalIso(v){return v===null||v===undefined?null:iso(v);}
function inbox(value){
 if(!plain(value)||!ID.test(value.id||"")||value.status!=="released"||value.origin!=="inbound"||typeof value.body!=="string"||!Number.isSafeInteger(value.version)||value.version<1)fail();
 return Object.freeze({id:value.id,body:value.body,deliverAt:iso(value.deliverAt),releasedAt:optionalIso(value.releasedAt),senderDisplayName:typeof value.senderDisplayName==="string"&&value.senderDisplayName.trim()?value.senderDisplayName.trim():null,senderUsername:typeof value.senderUsername==="string"&&value.senderUsername.trim()?value.senderUsername.trim():null,version:value.version});
}
function inboxPage(value){if(!plain(value)||!Array.isArray(value.messages)||typeof value.hasMore!=="boolean"||!(value.nextCursor===null||typeof value.nextCursor==="string"))fail();return Object.freeze({messages:value.messages.map(inbox),hasMore:value.hasMore,nextCursor:value.nextCursor});}
function outbound(value){
 if(!plain(value)||!ID.test(value.messageId||"")||!OUTBOUND_STATUS.has(value.status)||typeof value.recipientUsername!=="string"||typeof value.recipientDisplayName!=="string"||typeof value.presetId!=="string"||!NOTICE_STATUS.has(value.initialNotificationStatus)||!NOTICE_STATUS.has(value.releaseNotificationStatus)||Object.prototype.hasOwnProperty.call(value,"body"))fail();
 return Object.freeze({messageId:value.messageId,recipientUsername:value.recipientUsername,recipientDisplayName:value.recipientDisplayName,status:value.status,presetId:value.presetId,deliverAt:iso(value.deliverAt),createdAt:iso(value.createdAt),releasedAt:optionalIso(value.releasedAt),cancelledAt:optionalIso(value.cancelledAt),initialNotificationStatus:value.initialNotificationStatus,releaseNotificationStatus:value.releaseNotificationStatus});
}
function outboundList(value){if(!plain(value)||!Array.isArray(value.messages))fail();return Object.freeze(value.messages.map(outbound));}
function noticeText(status){return ({not_requested:"Not requested",not_eligible:"Not eligible",pending:"Pending",sent:"Sent",skipped:"Skipped",failed:"Failed"})[status]||"Unknown";}
global.SetfeedInboxSentCore=Object.freeze({inbox,inboxPage,outbound,outboundList,noticeText});
})(window);
