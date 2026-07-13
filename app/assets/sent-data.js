(function(global){
"use strict";
const app=global.SetfeedAppAuth,core=global.SetfeedInboxSentCore;if(!app||!core)return;
let items=[],serial=0,uid="";const listeners=new Set();
function emit(){const state={items:[...items]};listeners.forEach(fn=>{try{fn(state);}catch(_){}});}
function reset(){serial+=1;items=[];emit();}
async function load(){const current=++serial;const list=core.outboundList(await app.request("/v1/outbound-messages",{method:"GET"}));if(current!==serial)return null;items=[...list].sort((a,b)=>b.deliverAt.localeCompare(a.deliverAt));emit();return items;}
app.subscribe(state=>{const next=state.user&&state.profile&&state.profile.onboardingCompleted?state.user.uid:"";if(next===uid)return;uid=next;reset();});
global.addEventListener("setfeed:account-change",reset);
global.SetfeedSentData=Object.freeze({load,reset,subscribe(fn){listeners.add(fn);fn({items:[...items]});return()=>listeners.delete(fn);}});
})(window);
