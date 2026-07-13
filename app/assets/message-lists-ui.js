(function(w){
"use strict";
const d=w.SetfeedMessageListData,c=w.SetfeedMessageListsCore;if(!d||!c)return;
const mode=document.body.dataset.appPage;if(mode!=="upcoming"&&mode!=="awaiting")return;
let s={items:[],hasMore:false},busy="",loading=false;const q=id=>document.getElementById(id);
function note(v,bad){const e=q("messages-status");if(e){e.textContent=v||"";e.classList.toggle("app-error",!!bad);}}
function err(e){return e&&e.message||"Messages could not be loaded.";}
function shown(){const g=c.split(s.items);return mode==="awaiting"?g.awaiting:g.upcoming;}
function fmt(v){return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));}
function card(m){const a=document.createElement("article"),h=document.createElement("h3"),t=document.createElement("time"),p=document.createElement("p"),b=document.createElement("button");a.className="message-card";h.textContent=c.sourceLabel(m);t.dateTime=m.deliverAt;t.textContent=fmt(m.deliverAt);p.className="help";p.textContent="Content is available after release.";b.type="button";b.className=mode==="awaiting"?"btn btn-quiet":"btn btn-primary";b.textContent=mode==="awaiting"?"Remove from Awaiting":"Mark Awaiting";b.disabled=busy===m.id;b.onclick=()=>change(m,mode!=="awaiting");a.append(h,t,p,b);return a;}
function draw(){const l=q("messages-list"),e=q("messages-empty"),m=q("messages-more"),n=q("messages-count"),v=shown();if(l)l.replaceChildren(...v.map(card));if(e)e.hidden=v.length>0||loading;if(m)m.hidden=!s.hasMore;if(n)n.textContent=`${v.length} scheduled message${v.length===1?"":"s"}`;}
async function load(reset){if(loading)return;loading=true;draw();try{note("Loading…",false);await d.load(reset);note("",false);}catch(e){note(err(e),true);}finally{loading=false;draw();}}
async function change(m,on){if(busy)return;busy=m.id;draw();try{const r=await d.setAwaiting(m,on);note(on?c.notificationText(r):"Message returned to Upcoming.",false);}catch(e){note(err(e),true);}finally{busy="";draw();}}
function bind(){const r=q("messages-refresh"),m=q("messages-more");if(r)r.onclick=()=>load(true);if(m)m.onclick=()=>load(false);d.subscribe(v=>{s=v;draw();});w.addEventListener("setfeed:message-list-error",e=>note(err(e.detail),true));}
w.SetfeedMessageListsUI={load,change};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
})(window);