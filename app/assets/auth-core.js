(function(){
"use strict";
const cfg=window.SetfeedAppConfig;
if(!cfg||!window.firebase)return;
let auth=null,user=null,profile=null,generation=0,controller=new AbortController();
const listeners=new Set();
function notify(){listeners.forEach(fn=>{try{fn({user,profile});}catch(_){}});}
function reset(next){generation+=1;controller.abort();controller=new AbortController();user=next||null;profile=null;notify();window.dispatchEvent(new CustomEvent("setfeed:account-change",{detail:{uid:user?user.uid:null}}));}
async function token(force){if(!user||typeof user.getIdToken!=="function")throw new Error("not_signed_in");return user.getIdToken(Boolean(force));}
async function request(path,options){const opts=options||{};const headers=Object.assign({Accept:"application/json"},opts.headers||{});if(opts.body!==undefined&&!headers["Content-Type"])headers["Content-Type"]="application/json";headers.Authorization=`Bearer ${await token(false)}`;let response=await fetch(cfg.apiBaseUrl+path,Object.assign({},opts,{headers,signal:opts.signal||controller.signal}));if(response.status===401){headers.Authorization=`Bearer ${await token(true)}`;response=await fetch(cfg.apiBaseUrl+path,Object.assign({},opts,{headers,signal:opts.signal||controller.signal}));}let json=null;try{json=await response.json();}catch(_){}if(!response.ok){const error=new Error(json&&json.error&&json.error.message||"Request failed.");error.code=json&&json.error&&json.error.code||`http_${response.status}`;error.status=response.status;throw error;}return json;}
async function loadProfile(){const current=generation;try{const result=await request("/v1/profile",{method:"GET"});if(current!==generation)return null;profile=result.profile;notify();return profile;}catch(error){if(error.code!=="profile_not_initialized")throw error;const result=await request("/v1/profile/bootstrap",{method:"POST",body:"{}"});if(current!==generation)return null;profile=result.profile;notify();return profile;}}
async function saveProfile(patch){const result=await request("/v1/profile",{method:"PATCH",body:JSON.stringify(patch)});profile=result.profile;notify();return profile;}
async function signOut(){if(auth)await auth.signOut();}
function subscribe(fn){listeners.add(fn);fn({user,profile});return()=>listeners.delete(fn);}
async function init(){if(!firebase.apps||firebase.apps.length===0)firebase.initializeApp(cfg.firebaseConfig);auth=firebase.auth();window.sfAuth=auth;try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(_){}auth.onAuthStateChanged(async next=>{reset(next);if(next&&next.isAnonymous){await auth.signOut();return;}if(next){try{await loadProfile();}catch(error){window.dispatchEvent(new CustomEvent("setfeed:auth-error",{detail:{code:error.code||"profile_load_failed",message:error.message}}));}}});}
window.SetfeedAppAuth={init,subscribe,request,loadProfile,saveProfile,signOut,get user(){return user;},get profile(){return profile;}};
})();