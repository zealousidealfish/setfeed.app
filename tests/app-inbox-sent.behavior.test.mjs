import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const coreSource=readFileSync(new URL('../app/assets/inbox-sent-core.js',import.meta.url),'utf8');
const inboxData=readFileSync(new URL('../app/assets/inbox-data.js',import.meta.url),'utf8');
const sentData=readFileSync(new URL('../app/assets/sent-data.js',import.meta.url),'utf8');
const inboxUi=readFileSync(new URL('../app/assets/inbox-ui.js',import.meta.url),'utf8');
const sentUi=readFileSync(new URL('../app/assets/sent-ui.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../app/assets/shell.js',import.meta.url),'utf8');
const inboxHtml=readFileSync(new URL('../app/inbox.html',import.meta.url),'utf8');
const sentHtml=readFileSync(new URL('../app/sent.html',import.meta.url),'utf8');

const context={window:{},Date,Error,Set,Object,Array,String,Number,Boolean};context.window.window=context.window;
vm.runInNewContext(coreSource,context,{filename:'inbox-sent-core.js'});
const core=context.window.SetfeedInboxSentCore;
const inbox=core.inbox({id:'msg_1',body:'Released text',deliverAt:'2026-08-01T12:00:00Z',releasedAt:'2026-08-01T12:00:01Z',status:'released',origin:'inbound',version:2,senderDisplayName:'Alex'});
assert.equal(inbox.body,'Released text');
assert.throws(()=>core.inbox({id:'msg_1',body:'early',deliverAt:'2026-08-01T12:00:00Z',status:'scheduled',origin:'inbound',version:1}),error=>error.code==='malformed_backend_response');
const outbound=core.outbound({messageId:'msg_2',recipientUsername:'sam',recipientDisplayName:'Sam',status:'scheduled',presetId:'personal',deliverAt:'2026-08-02T12:00:00Z',createdAt:'2026-07-20T12:00:00Z',releasedAt:null,cancelledAt:null,initialNotificationStatus:'sent',releaseNotificationStatus:'not_eligible'});
assert.equal(outbound.recipientUsername,'sam');
assert.throws(()=>core.outbound({...outbound,body:'must never appear'}),error=>error.code==='malformed_backend_response');
assert.equal(core.noticeText('pending'),'Pending');

assert.ok(inboxData.includes('view:"inbox",limit:"50"'));
assert.ok(inboxData.includes('method:"PATCH",body:{placement}'));
assert.ok(sentData.includes('app.request("/v1/outbound-messages",{method:"GET"})'));
assert.ok(inboxUi.includes('message.body'));
assert.doesNotMatch(sentUi,/message\.body/);
assert.ok(inboxHtml.includes('id="inbox-list"'));
assert.ok(sentHtml.includes('id="sent-list"'));
assert.ok(shell.indexOf('inbox-sent-core.js')<shell.indexOf('inbox-data.js'));
assert.ok(shell.indexOf('inbox-sent-core.js')<shell.indexOf('sent-data.js'));
console.log('app Inbox and Sent behavior checks passed');
