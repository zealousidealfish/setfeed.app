import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app/assets/dashboard.js',import.meta.url),'utf8');
const context={window:{},Object,Array,String,Promise};
context.window.window=context.window;
context.window.SetfeedAppAuth={
 subscribe(){},
 request(){throw new Error('network not expected');},
};
context.window.addEventListener=()=>{};
vm.runInNewContext(source,context,{filename:'app/assets/dashboard.js'});
const dashboard=context.window.SetfeedDashboard;

const page={messages:[
 {id:'upcoming',status:'scheduled',source:'inbound',awaitingAt:null},
 {id:'awaiting',status:'scheduled',source:'inbound',awaitingAt:'2026-07-13T12:00:00Z'},
 {id:'self',status:'scheduled',source:'discord_self',awaitingAt:null},
 {id:'website',status:'scheduled',source:'website',awaitingAt:null},
 {id:'released',status:'released',source:'inbound',awaitingAt:null},
]};
assert.equal(dashboard._test.upcomingCount(page),2,'Upcoming summary excludes Awaiting, released, and unsupported sources');
assert.equal(dashboard._test.upcomingCount({messages:[]}),0);
assert.equal(dashboard._test.upcomingCount(null),0);
for(const endpoint of [
 '/v1/messages?view=future&limit=100',
 '/v1/messages?view=inbox&limit=100',
 '/v1/messages?view=feed&limit=100',
]) assert.ok(source.includes(endpoint),`dashboard includes ${endpoint}`);
assert.doesNotMatch(source,/\.body\b/,'dashboard never reads message bodies');
console.log('app dashboard behavior checks passed');
