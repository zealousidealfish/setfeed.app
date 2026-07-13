(function(global){
"use strict";
const data=global.SetfeedSentData,core=global.SetfeedInboxSentCore;if(!data||!core)return;
let state={items:[]},loading=false;const q=id=>document.getElementById(id);
function note(text,bad){const el=q("sent-status");if(el){el.textContent=text||"";el.classList.toggle("app-error",!!bad);}}
function fmt(value){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}
function card(message){const article=document.createElement("article"),title=document.createElement("h3"),time=document.createElement("time"),status=document.createElement("p"),notices=document.createElement("dl");article.className="message-card";title.textContent=`To ${message.recipientDisplayName} (@${message.recipientUsername})`;time.dateTime=message.deliverAt;time.textContent=fmt(message.deliverAt);status.className="message-status";status.textContent=`Status: ${message.status}`;notices.className="message-notices";for(const [label,value] of [["Scheduled Discord notice",message.initialNotificationStatus],["Release Discord notice",message.releaseNotificationStatus]]){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=core.noticeText(value);notices.append(dt,dd);}article.append(title,time,status,notices);return article;}
function draw(){const list=q("sent-list"),empty=q("sent-empty"),count=q("sent-count");if(list)list.replaceChildren(...state.items.map(card));if(empty)empty.hidden=state.items.length>0||loading;if(count)count.textContent=`${state.items.length} sent message${state.items.length===1?"":"s"}`;}
async function load(){if(loading)return;loading=true;draw();try{note("Loading…",false);await data.load();note("",false);}catch(error){note(error&&error.message||"Sent messages could not be loaded.",true);}finally{loading=false;draw();}}
function bind(){const refresh=q("sent-refresh");if(refresh)refresh.onclick=load;data.subscribe(value=>{state=value;draw();});}
global.SetfeedSentUI={load};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})(window);
