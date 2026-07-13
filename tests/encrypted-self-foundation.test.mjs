import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source=readFileSync(new URL('../assets/encrypted-self.js', import.meta.url),'utf8');
function fakeIndexedDB(){ const dbs=new Map(); return { open(name){ const req={}; queueMicrotask(()=>{ let rec=dbs.get(name); const fresh=!rec; if(!rec){ const stores=new Map(); rec={ createObjectStore(n){ stores.set(n,new Map()); }, transaction(n){ const store=stores.get(n); return { objectStore(){ return { get(k){ const r={}; queueMicrotask(()=>{ r.result=store.get(k); r.onsuccess&&r.onsuccess(); }); return r; }, put(v){ const r={}; queueMicrotask(()=>{ store.set(v.uid,v); r.result=v.uid; r.onsuccess&&r.onsuccess(); }); return r; } }; } }; } }; dbs.set(name,rec); } req.result=rec; if(fresh&&req.onupgradeneeded) req.onupgradeneeded(); req.onsuccess&&req.onsuccess(); }); return req; } }; }
function load(fetchImpl,indexedDB=fakeIndexedDB()){ const ctx={crypto:webcrypto, indexedDB, TextEncoder, TextDecoder, URLSearchParams, setTimeout, clearTimeout, AbortController, btoa:s=>Buffer.from(s,'binary').toString('base64'), atob:s=>Buffer.from(s,'base64').toString('binary'), fetch:fetchImpl||(()=>{})}; ctx.globalThis=ctx; vm.runInNewContext(source,ctx); return ctx.SetfeedEncryptedSelf; }
const mod=load();
assert.equal(mod.CONFIG.capabilities.encryptedSelfText,'unavailable');
assert.equal(mod.CONFIG.ui.encryptedSelfViewing,false);
assert.equal(mod.CONFIG.ui.encryptedSelfComposition,false);
assert.equal(mod.CONFIG.ui.releaseEmailSettings,false);
assert.equal(mod.CONFIG.limits.encryptedSelfMaxScheduleDays,365);
assert.equal(mod.CONFIG.limits.receiveCodeMaxScheduleDays,7);
assert.deepEqual([...mod.compose.states], ['idle','key_loading','key_setup_required','recovery_required','draft_reserving','draft_reserved','encrypting','ready_to_finalize','finalizing','scheduled','failed_recoverable','failed_terminal','cancelled']);
assert.equal(mod.crypto.b64u(new Uint8Array([251,255,254])),'-__-');
assert.throws(()=>mod.crypto.b64uToBytes('-__='));
const aad=mod.crypto.textAad({accountKeyId:'ak_123',messageId:'msg_456'});
assert.equal(Buffer.from(aad).toString(),'setfeed:v1:key:ak_123:message:msg_456:part:text');
const idb=fakeIndexedDB();
const provider=new mod.DeviceLocalKeyProvider({uid:'uid1', indexedDB:idb});
const account=await mod.crypto.createAccountKeyRequest({provider,idempotencyKey:'idem-account'});
assert.deepEqual(Object.keys(account.body).sort(),['cryptoVersion','idempotencyKey','keyWrapAlgorithm','recoveryWrappedRootKey'].sort());
assert.equal(account.body.cryptoVersion,1); assert.equal(account.body.keyWrapAlgorithm,'A256KW'); assert.equal(account.body.idempotencyKey,'idem-account'); assert.equal(mod.crypto.b64uToBytes(account.body.recoveryWrappedRootKey).byteLength,40);
assert.throws(()=>mod.crypto.validateAccountKeyResponse({accountKeyId:'browser-generated',version:1,rootKeyAlg:'A256KW',recoveryWrapAlg:'x',recoveryWrappedRootKey:account.body.recoveryWrappedRootKey}), e=>e.code==='malformed_backend_response');
const serverKey=mod.crypto.validateAccountKeyResponse({accountKeyId:'server-ak',cryptoVersion:1,keyWrapAlgorithm:'A256KW',recoveryWrappedRootKey:account.body.recoveryWrappedRootKey,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'});
assert.equal(serverKey.accountKeyId,'server-ak');
const sameBrowserRoot=await new mod.DeviceLocalKeyProvider({uid:'uid1', indexedDB:idb}).unwrapRootKey(mod.crypto.b64uToBytes(serverKey.recoveryWrappedRootKey));
const env=await mod.crypto.encryptText({rootKey:sameBrowserRoot,plaintext:'hello 🔒',accountKeyId:'server-ak',messageId:'msg1',maxPlaintextBytes:100,maxCiphertextBytes:200});
assert.deepEqual(Object.keys(env).sort(),['schemaVersion','accountKeyId','contentEncryption','keyWrap','aadVersion','tagLength','iv','ciphertext','wrappedContentKey'].sort());
assert.equal(env.accountKeyId,'server-ak'); assert.equal(env.contentEncryption,'A256GCM'); assert.equal(env.keyWrap,'A256KW');
assert.equal(await mod.crypto.decryptText({rootKey:sameBrowserRoot,envelope:env,accountKeyId:'server-ak',messageId:'msg1',maxCiphertextBytes:200}),'hello 🔒');
await assert.rejects(()=>mod.crypto.decryptText({rootKey:sameBrowserRoot,envelope:env,accountKeyId:'other-ak',messageId:'msg1',maxCiphertextBytes:200}), e=>e.code==='malformed_backend_response');
assert.throws(()=>mod.crypto.validateEncryptedTextEnvelope({...env, extra:'nope'},{accountKeyId:'server-ak'}), e=>e.code==='malformed_backend_response');
assert.throws(()=>mod.crypto.validateEncryptedTextEnvelope({...env, iv:env.iv+'='},{accountKeyId:'server-ak'}), e=>e.code==='malformed_backend_response');
assert.throws(()=>mod.crypto.validateEncryptedTextEnvelope({...env, ciphertext:mod.crypto.b64u(new Uint8Array(16))},{accountKeyId:'server-ak'}), e=>e.code==='malformed_backend_response');
assert.throws(()=>mod.crypto.validateEncryptedTextEnvelope(env,{accountKeyId:'server-ak',maxCiphertextBytes:10}), e=>e.code==='malformed_backend_response');
await assert.rejects(()=>mod.crypto.encryptText({rootKey:sameBrowserRoot,plaintext:'too long',accountKeyId:'server-ak',messageId:'msg1',maxPlaintextBytes:2,maxCiphertextBytes:200}), e=>e.code==='quota_exceeded');
assert.equal(mod.compose.assertScheduleWithin(Date.parse('2026-01-01T00:00:00.000Z'),'2026-12-31T00:00:00.000Z',365),'2026-12-31T00:00:00.000Z');
assert.throws(()=>mod.compose.assertScheduleWithin(Date.parse('2026-01-01T00:00:00.000Z'),'2027-01-02T00:00:00.000Z',365), e=>e.code==='schedule_invalid');
assert.throws(()=>mod.compose.assertScheduleWithin(Date.parse('2026-01-01T00:00:00.000Z'),'2026-01-09T00:00:00.000Z',7), e=>e.code==='schedule_invalid');
let calls=[]; const auth={currentUser:{uid:'u1',isAnonymous:false,async getIdToken(force){calls.push(['token',force]); return force?'fresh':'old';}}};
const apiMod=load(async (url,init)=>{ calls.push(['fetch',url,init.method||'GET',init.headers,init.body,init.cache]); if(calls.filter(c=>c[0]==='fetch').length===1) return {ok:false,status:401,json:async()=>({error:{code:'expired_token'}})}; return {ok:true,status:200,json:async()=>({accountKeyId:'server-ak',cryptoVersion:1,keyWrapAlgorithm:'A256KW',recoveryWrappedRootKey:account.body.recoveryWrappedRootKey,createdAt:'c',updatedAt:'u'})}; });
const esc=new apiMod.EncryptedSelfClient({auth,baseUrl:'https://api.test'});
await esc.readAccountKey();
const fetchCalls=calls.filter(c=>c[0]==='fetch'); assert.equal(fetchCalls[0][1],'https://api.test/v1/crypto/account-key'); assert.equal(fetchCalls[0][3].Authorization,'Bearer old'); assert.equal(fetchCalls[1][3].Authorization,'Bearer fresh'); assert.equal(fetchCalls[0][5],'no-store'); assert.ok(!('Idempotency-Key' in fetchCalls[0][3]));
calls=[]; const apiMod2=load(async (url,init)=>{ calls.push([url,init.method||'GET',init.body,init.headers]); return {ok:true,status:200,json:async()=>({ok:true})}; }); const c=new apiMod2.EncryptedSelfClient({auth,baseUrl:'https://api.test'});
for (const view of ['upcoming','awaiting','released','feed','cancelled']) await c.listMessages({view}); await c.listMessages({view:'released',limit:25,cursor:'a b&c'}); assert.throws(()=>c.listMessages({view:'now'}), e=>e.code==='malformed_backend_response'); await c.createAccountKey(account.body); await c.reserveDraft({deliverAt:'2026-01-02T00:00:00.000Z',idempotencyKey:'reserve'}); await c.finalizeDraft('draft1',{encryptedText:env,idempotencyKey:'final'}); await c.enableAwaiting('m',{expectedVersion:2}); await c.restoreUpcoming('m',{expectedVersion:3}); await c.cancel('m',{expectedVersion:4}); await c.restore('m',{expectedVersion:5}); await c.changePlacement('m',{placement:'feed',expectedVersion:6}); await c.updateReleaseEmailPreference(true);
const apiCalls=calls.filter(x=>typeof x[0]==='string'&&x[0].startsWith('https://'));
assert.deepEqual(apiCalls.slice(0,5).map(x=>x[0]),['https://api.test/v1/self-messages?view=upcoming','https://api.test/v1/self-messages?view=awaiting','https://api.test/v1/self-messages?view=released','https://api.test/v1/self-messages?view=feed','https://api.test/v1/self-messages?view=cancelled']);
assert.equal(apiCalls[5][0],'https://api.test/v1/self-messages?view=released&limit=25&cursor=a+b%26c'); assert.ok(!apiCalls.some(x=>x[0].includes('kind=')||x[0].includes('undefined')||x[0].includes('null')));
assert.equal(apiCalls[6][0],'https://api.test/v1/crypto/account-key'); assert.equal(apiCalls[6][2],JSON.stringify(account.body));
assert.equal(apiCalls[7][0],'https://api.test/v1/self-message-drafts'); assert.equal(apiCalls[7][2],JSON.stringify({deliverAt:'2026-01-02T00:00:00.000Z',hasText:true,hasImage:false,idempotencyKey:'reserve'}));
assert.equal(apiCalls[8][0],'https://api.test/v1/self-message-drafts/draft1/finalize'); assert.equal(apiCalls[8][2],JSON.stringify({expectedDraftVersion:1,encryptedText:env,finalizedAssetId:null,idempotencyKey:'final'}));
assert.equal(apiCalls[9][0],'https://api.test/v1/self-messages/m/awaiting'); assert.equal(apiCalls[10][0],'https://api.test/v1/self-messages/m/restore-upcoming'); assert.equal(apiCalls[11][0],'https://api.test/v1/self-messages/m/cancel'); assert.equal(apiCalls[12][0],'https://api.test/v1/self-messages/m/restore'); assert.equal(apiCalls[13][0],'https://api.test/v1/self-messages/m/placement'); assert.equal(apiCalls[13][1],'PATCH'); assert.equal(apiCalls[14][2],JSON.stringify({releaseEmailEnabled:true})); assert.equal(apiCalls[14][0],'https://api.test/v1/notification-preferences/release-email'); assert.ok(apiCalls.every(x=>!('Idempotency-Key' in x[3])));
calls=[]; const inbox=new apiMod2.InboxMessageClient({auth,baseUrl:'https://api.test'}); await inbox.enableAwaiting('legacy'); await inbox.disableAwaiting('legacy'); const inboxCalls=calls.filter(x=>typeof x[0]==='string'&&x[0].startsWith('https://')); assert.equal(inboxCalls[0][0],'https://api.test/v1/messages/legacy/awaiting'); assert.equal(inboxCalls[0][1],'PUT'); assert.equal(inboxCalls[1][1],'DELETE'); assert.equal(inbox.releaseEmailCapability(),'backend_bridge_required');
let callableNames=[]; const receive=new apiMod2.ReceiveCodeSendClient({auth,functions:{httpsCallable(name){ callableNames.push(name); return async payload=> name==='getReceiveCodes'?{data:{personal:{code:'personal-code'},secure:{code:'secure-code'},rolling:{code:'rolling-code',expiresAtMillis:null}}}:{data:{name,payload}}; }}}); assert.equal(receive.maxScheduleDays(),7); assert.equal(await receive.getOwnSecureReceiveCode(),'secure-code'); await receive.sendSignedCiphertext({ciphertext:'x'}); await receive.createSignedAttachmentUpload({image:true}); assert.deepEqual(callableNames,['getReceiveCodes','sendSignedCiphertext','createSignedAttachmentUpload']);
for (const bad of [{personal:{code:'p'},rolling:{code:'r',expiresAtMillis:null}},{personal:{code:'p'},secure:{},rolling:{code:'r',expiresAtMillis:null}},{personal:{code:'p'},secure:{code:''},rolling:{code:'r',expiresAtMillis:null}},{codes:[{kind:'Secure',code:'old'}]}]) { const rc=new apiMod2.ReceiveCodeSendClient({auth,functions:{httpsCallable(){ return async()=>({data:bad}); }}}); await assert.rejects(()=>rc.getOwnSecureReceiveCode(), e=>e.code==='malformed_backend_response'); }
assert.doesNotMatch(source,/console\.(log|warn|error|info|debug)/); assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|location\.(href|assign|replace)/); assert.doesNotMatch(source,/Idempotency-Key/); assert.doesNotMatch(JSON.stringify(calls),/secure-code|personal-code|rolling-code/);

async function retryScenario(action, expectedPath, expectedBody, expectedMethod='POST') {
  let seen=[]; const retryAuth={currentUser:{uid:'u2',isAnonymous:false,async getIdToken(force){seen.push(['token',force]); return force?'fresh':'old';}}};
  const retryMod=load(async (url,init)=>{ seen.push(['fetch',url,init.method||'GET',init.body,init.headers.Authorization]); return {ok:seen.filter(x=>x[0]==='fetch').length>1,status:seen.filter(x=>x[0]==='fetch').length>1?200:401,json:async()=> seen.filter(x=>x[0]==='fetch').length>1?{ok:true}:{error:{code:'expired_token'}}}; });
  await action(retryMod,retryAuth);
  const f=seen.filter(x=>x[0]==='fetch'); assert.equal(f.length,2); assert.equal(f[0][1],expectedPath); assert.equal(f[1][1],expectedPath); assert.equal(f[0][2],expectedMethod); assert.equal(f[1][2],expectedMethod); assert.equal(f[0][3],expectedBody); assert.equal(f[1][3],expectedBody); assert.equal(f[0][4],'Bearer old'); assert.equal(f[1][4],'Bearer fresh'); assert.deepEqual(seen.filter(x=>x[0]==='token').map(x=>x[1]),[false,true]); assert.ok(f.every(x=>!String(x[4]).includes('Idempotency-Key')));
}
await retryScenario((m,a)=>new m.EncryptedSelfClient({auth:a,baseUrl:'https://api.test'}).createAccountKey(account.body),'https://api.test/v1/crypto/account-key',JSON.stringify(account.body));
await retryScenario((m,a)=>new m.EncryptedSelfClient({auth:a,baseUrl:'https://api.test'}).reserveDraft({deliverAt:'2026-01-02T00:00:00.000Z',idempotencyKey:'reserve'}),'https://api.test/v1/self-message-drafts',JSON.stringify({deliverAt:'2026-01-02T00:00:00.000Z',hasText:true,hasImage:false,idempotencyKey:'reserve'}));
await retryScenario((m,a)=>new m.EncryptedSelfClient({auth:a,baseUrl:'https://api.test'}).finalizeDraft('draft1',{encryptedText:env,idempotencyKey:'final'}),'https://api.test/v1/self-message-drafts/draft1/finalize',JSON.stringify({expectedDraftVersion:1,encryptedText:env,finalizedAssetId:null,idempotencyKey:'final'}));
await retryScenario((m,a)=>new m.EncryptedSelfClient({auth:a,baseUrl:'https://api.test'}).cancel('m',{expectedVersion:9}),'https://api.test/v1/self-messages/m/cancel',JSON.stringify({expectedVersion:9}));
await retryScenario((m,a)=>new m.InboxMessageClient({auth:a,baseUrl:'https://api.test'}).enableAwaiting('legacy'),'https://api.test/v1/messages/legacy/awaiting',undefined,'PUT');
for (const status of [409,429,500]) { let n=0; const noRetryMod=load(async()=>{ n++; return {ok:false,status,json:async()=>({error:{code:status===409?'conflict':'backend_unavailable'}})}; }); await assert.rejects(()=>new noRetryMod.EncryptedSelfClient({auth,baseUrl:'https://api.test'}).cancel('m',{expectedVersion:1})); assert.equal(n,1); }
let timeoutCalls=0; const timeoutMod=load(async (_url,init)=>new Promise((_,reject)=>{ timeoutCalls++; init.signal.addEventListener('abort',()=>reject(new Error('aborted')), {once:true}); })); await assert.rejects(()=>new timeoutMod.EncryptedSelfClient({auth,baseUrl:'https://api.test',timeoutMs:1}).cancel('m',{expectedVersion:1}), e=>e.code==='network_timeout'); assert.equal(timeoutCalls,1);
let abortCalls=0; const abortMod=load(async()=>{ abortCalls++; throw Object.assign(new Error('aborted'), { name:'AbortError' }); }); await assert.rejects(()=>new abortMod.EncryptedSelfClient({auth,baseUrl:'https://api.test'}).cancel('m',{expectedVersion:1}), e=>e.code==='backend_unavailable'); assert.equal(abortCalls,1);
console.log('encrypted-self foundation checks passed');
