(function(global){
"use strict";
const app=global.SetfeedAppAuth,core=global.SetfeedMessageListsCore;if(!app||!core)return;
let items=[],cursor=null,hasMore=false,serial=0,uid="";const listeners=new Set();
function emit(){const state={items:[...items],hasMore};listeners.forEach(fn=>{try{fn(state);}catch(_){}});}
function reset(){serial+=1;items=[];cursor=null;hasMore=false;emit();}
async function load(resetPage){
 const current=++serial;if(resetPage){items=[];cursor=null;hasMore=false;emit();}
 const query=new URLSearchParams({view:"future",limit:"50"});if(!resetPage&&cursor)query.set("cursor",cursor);
 const page=core.parsePage(await app.request(`/v1/messages?${query.toString()}`,{method:"GET"}));if(current!==serial)return null;
 const known=new Map(items.map(item=>[item.id,item]));page.messages.forEach(item=>known.set(item.id,item));items=[...known.values()].sort((a,b)=>a.deliverAt.localeCompare(b.deliverAt)||a.id.localeCompare(b.id));cursor=page.nextCursor;hasMore=page.hasMore;emit();return page;
}
async function setAwaiting(message,enabled){
 const result=core.mutation(await app.request(`/v1/messages/${encodeURIComponent(message.id)}/awaiting`,{method:enabled?"PUT":"DELETE"}));items=items.map(item=>item.id===message.id?result.message:item);emit();return result;
}
app.subscribe(state=>{const next=state.user&&state.profile&&state.profile.onboardingCompleted?state.user.uid:"";if(next===uid)return;uid=next;reset();if(uid)load(true).catch(error=>global.dispatchEvent(new CustomEvent("setfeed:message-list-error",{detail:error})));});
global.addEventListener("setfeed:account-change",reset);
global.SetfeedMessageListData=Object.freeze({load,setAwaiting,reset,subscribe(fn){listeners.add(fn);fn({items:[...items],hasMore});return()=>listeners.delete(fn);}});
})(window);