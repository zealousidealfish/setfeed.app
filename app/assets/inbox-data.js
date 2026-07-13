(function(global){
"use strict";
const app=global.SetfeedAppAuth,core=global.SetfeedInboxSentCore;if(!app||!core)return;
let items=[],cursor=null,hasMore=false,serial=0,uid="";const listeners=new Set();
function emit(){const state={items:[...items],hasMore};listeners.forEach(fn=>{try{fn(state);}catch(_){}});}
function reset(){serial+=1;items=[];cursor=null;hasMore=false;emit();}
async function load(resetPage){const current=++serial;if(resetPage){items=[];cursor=null;hasMore=false;emit();}const query=new URLSearchParams({view:"inbox",limit:"50"});if(!resetPage&&cursor)query.set("cursor",cursor);const page=core.inboxPage(await app.request(`/v1/messages?${query.toString()}`,{method:"GET"}));if(current!==serial)return null;const known=new Map(items.map(item=>[item.id,item]));page.messages.forEach(item=>known.set(item.id,item));items=[...known.values()].sort((a,b)=>(b.releasedAt||b.deliverAt).localeCompare(a.releasedAt||a.deliverAt));cursor=page.nextCursor;hasMore=page.hasMore;emit();return page;}
async function setPlacement(message,placement){const result=await app.request(`/v1/messages/${encodeURIComponent(message.id)}/placement`,{method:"PATCH",body:{placement}});if(!result||!result.message)throw Object.assign(new Error("Setfeed returned invalid message data."),{code:"malformed_backend_response"});items=items.filter(item=>item.id!==message.id);emit();return result.message;}
app.subscribe(state=>{const next=state.user&&state.profile&&state.profile.onboardingCompleted?state.user.uid:"";if(next===uid)return;uid=next;reset();});
global.addEventListener("setfeed:account-change",reset);
global.SetfeedInboxData=Object.freeze({load,setPlacement,reset,subscribe(fn){listeners.add(fn);fn({items:[...items],hasMore});return()=>listeners.delete(fn);}});
})(window);
