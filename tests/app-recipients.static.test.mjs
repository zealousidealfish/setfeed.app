import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const moduleText=readFileSync(new URL('../app/assets/recipients.js',import.meta.url),'utf8');
const sendHtml=readFileSync(new URL('../app/send.html',import.meta.url),'utf8');
const shellText=readFileSync(new URL('../app/assets/shell.js',import.meta.url),'utf8');
const appCss=readFileSync(new URL('../app/assets/app.css',import.meta.url),'utf8');
const includes=(haystack,needle,message)=>assert.ok(haystack.includes(needle),message);

includes(moduleText,'app.request("/v1/contacts",{method:"GET"})','contacts use exact GET contract');
includes(moduleText,'app.request("/v1/people/resolve",{method:"POST",body:{username:normalized}})','lookup uses exact POST contract');
includes(moduleText,'recipient_unavailable','unavailable recipient gets stable generic handling');
includes(moduleText,'Too many searches','rate-limit state is user-readable');
includes(moduleText,'textContent','recipient data is rendered as text');
assert.doesNotMatch(moduleText,/innerHTML|insertAdjacentHTML|localStorage|sessionStorage/,'recipient data is not injected or persisted');
includes(moduleText,'setfeed:account-change','account changes clear recipient state');
includes(moduleText,'SetfeedRecipients={loadContacts,resolveUsername,select,clear,subscribe','compose task receives a small selection API');
includes(moduleText,'value.recipient.availability!=="available"','unavailable saved contacts are skipped');
includes(moduleText,'.map(contact).filter(Boolean)','one unavailable contact does not break the contact list');
includes(moduleText,'const value=isContact?item.recipient:item','contact cards retain contact metadata');
includes(moduleText,'isContact&&item.alias?item.alias:value.displayName','saved contact aliases are displayed');
includes(moduleText,'card(item,true)','contact records, not bare recipients, are rendered');
includes(moduleText,'if(!activeUid)throw Object.assign(new Error("Sign in to find a recipient.")','lookup rejects signed-out callers');
includes(moduleText,'input.disabled=!available','username input is disabled while signed out');
includes(moduleText,'button.disabled=!available','search button is disabled while signed out');
includes(moduleText,'setAvailable(Boolean(uid))','recipient controls follow authenticated profile state');
includes(moduleText,'activeUid="";setAvailable(false);clear()','account changes immediately lock and clear recipient controls');
includes(appCss,'[hidden]{display:none!important}','hidden private page content cannot be overridden by grid styles');
includes(appCss,'.app-auth-panel{max-width:620px;margin-bottom:var(--s-4)}','sign-in panel has consistent spacing below it');

for(const id of ['recipient-search-form','recipient-username','recipient-search-button','recipient-search-result','recipient-contacts','recipient-selected','recipient-clear'])includes(sendHtml,`id="${id}"`,`Send page contains ${id}`);
includes(sendHtml,'./assets/recipients.css','Send page loads picker styles');
includes(shellText,'document.body.dataset.appPage','shell reads the active page');
assert.match(shellText,/if\s*\(\s*[A-Za-z_$][\w$]*\s*===\s*"send"\s*\)/,'picker is page-scoped');
includes(shellText,'./assets/recipients.js','shell loads recipient module');

console.log('app recipient static checks passed');
