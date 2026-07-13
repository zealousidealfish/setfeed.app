import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const coreSource=readFileSync(new URL('../app/assets/message-lists-core.js',import.meta.url),'utf8');
const dataSource=readFileSync(new URL('../app/assets/message-lists-data.js',import.meta.url),'utf8');
const uiSource=readFileSync(new URL('../app/assets/message-lists-ui.js',import.meta.url),'utf8');
const shellSource=readFileSync(new URL('../app/assets/shell.js',import.meta.url),'utf8');
const upcoming=readFileSync(new URL('../app/upcoming.html',import.meta.url),'utf8');
const awaiting=readFileSync(new URL('../app/awaiting.html',import.meta.url),'utf8');

const context={window:{},Date,Error,Set,Object,Array,String,Number,Boolean};
context.window.window=context.window;
vm.runInNewContext(coreSource,context,{filename:'message-lists-core.js'});
const core=context.window.SetfeedMessageListsCore;
const normalized=core.normalize({id:'msg_123',body:'must not survive',deliverAt:'2026-08-01T12:00:00Z',awaitingAt:null,status:'scheduled',source:'inbound',origin:'inbound',version:3,senderDisplayName:'Alex',senderUsername:'alex'});
assert.equal(Object.prototype.hasOwnProperty.call(normalized,'body'),false);
assert.deepEqual(Object.keys(normalized),['id','deliverAt','awaitingAt','source','origin','version','senderDisplayName','senderUsername']);
const page=core.parsePage({messages:[{id:'msg_1',body:'hidden',deliverAt:'2026-08-01T12:00:00Z',awaitingAt:null,status:'scheduled',source:'inbound',origin:'inbound',version:1,senderDisplayName:'Alex'},{id:'msg_2',body:'self hidden',deliverAt:'2026-08-02T12:00:00Z',awaitingAt:'2026-07-20T12:00:00Z',status:'scheduled',source:'discord_self',origin:'local',version:2},{id:'msg_3',deliverAt:'2026-08-03T12:00:00Z',awaitingAt:null,status:'scheduled',source:'website',origin:'local',version:1}],hasMore:false,nextCursor:null,serverTime:'2026-07-20T12:00:00Z'});
assert.equal(page.messages.length,2);
assert.equal(core.split(page.messages).upcoming.length,1);
assert.equal(core.split(page.messages).awaiting.length,1);
assert.equal(core.sourceLabel(page.messages[0]),'From Alex');
const mutation=core.mutation({awaiting:true,discordLinked:true,receivingEnabled:true,releaseNotification:'will_ping',message:{id:'msg_1',body:'hidden',deliverAt:'2026-08-01T12:00:00Z',awaitingAt:'2026-07-20T12:00:00Z',status:'scheduled',source:'inbound',origin:'inbound',version:2}});
assert.equal(mutation.message.body,undefined);
assert.equal(core.notificationText(mutation),'Discord release notification is enabled.');

assert.ok(dataSource.includes('view:"future",limit:"50"'));
assert.ok(dataSource.includes('method:enabled?"PUT":"DELETE"'));
const messageBodyAccess=/\b(?:message|item|value|m)\.body\b/;
assert.doesNotMatch(dataSource,messageBodyAccess);
assert.doesNotMatch(uiSource,messageBodyAccess);
for(const html of [upcoming,awaiting]){
 assert.ok(html.includes('id="messages-list"'));
 assert.ok(html.includes('id="messages-more"'));
 assert.ok(html.includes('message-lists.css'));
}
assert.ok(shellSource.indexOf('message-lists-core.js')<shellSource.indexOf('message-lists-data.js'));
assert.ok(shellSource.indexOf('message-lists-data.js')<shellSource.indexOf('message-lists-ui.js'));
console.log('app message list behavior checks passed');