(function(){
"use strict";
const cfg=window.SetfeedAppConfig;
if(!cfg||!window.firebase||!window.SetfeedJsonApiClient)return;
let auth=null,user=null,profile=null,generation=0,controller=new AbortController(),api=null;
const listeners=new Set();
function notify(){listeners.forEach(fn=>{try{fn({user,profile});}catch(_){}});}
function reset(next){generation+=1;controller.abort();controller=new AbortController();user=next||null;profile=null;notify();window.dispatchEvent(new CustomEvent("setfeed:account-change",{detail:{uid:user?user.uid:null}}));}
function buildApi(){api=new window.SetfeedJsonApiClient({baseUrl:cfg.apiBaseUrl,getUser:()=>user,getGeneration:()=>generation,getAccountSignal:()=>controller.signal});}
async function request(path,options){if(!api)buildApi();return api.request(path,options);}
async function loadProfile(){const current=generation;try{const result=await request("/v1/profile",{method:"GET"});if(current!==generation)return null;profile=result.profile;notify();return profile;}catch(error){if(error.code!=="profile_not_initialized")throw error;const result=await request("/v1/profile/bootstrap",{method:"POST",body:{}});if(current!==generation)return null;profile=result.profile;notify();return profile;}}
async function saveProfile(patch){const result=await request("/v1/profile",{method:"PATCH",body:patch});profile=result.profile;notify();return profile;}
async function signOut(){if(auth)await auth.signOut();}
function subscribe(fn){listeners.add(fn);fn({user,profile});return()=>listeners.delete(fn);}
async function init(){if(!firebase.apps||firebase.apps.length===0)firebase.initializeApp(cfg.firebaseConfig);auth=firebase.auth();window.sfAuth=auth;try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(_){}buildApi();auth.onAuthStateChanged(async next=>{reset(next);if(next&&next.isAnonymous){await auth.signOut();return;}if(next){try{await loadProfile();}catch(error){window.dispatchEvent(new CustomEvent("setfeed:auth-error",{detail:{code:error.code||"profile_load_failed",message:error.message,retryAfterSeconds:error.retryAfterSeconds||null}}));}}});}
window.SetfeedAppAuth={init,subscribe,request,loadProfile,saveProfile,signOut,get user(){return user;},get profile(){return profile;},get generation(){return generation;},get accountSignal(){return controller.signal;}};
})();
