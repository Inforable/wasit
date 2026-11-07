import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {openStore} from '../server/store.mjs';
const origin=process.env.WASIT_SMOKE_ORIGIN??'http://127.0.0.1:3330';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'}),page=await context.newPage(),checks=[],errors=[];
const check=(name,value=true)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
page.on('pageerror',error=>errors.push(error.message));
await mkdir('results/topbar',{recursive:true});
try{
 const boot=await context.request.post(origin+'/api/demo/session',{headers:{Origin:origin},data:{}}),session=await boot.json();
 const headers={Origin:origin,'X-CSRF-Token':session.csrf_token};
 const api=async(path,{method='GET',body}={})=>{const response=await context.request.fetch(origin+path,{method,headers,...(body?{data:body}:{})});const value=await response.json();assert.ok(response.ok(),JSON.stringify(value));return value;};
 await api('/api/profile',{method:'PUT',body:{display_name:'Header Customer',location_label:'Kelapa Gading',default_category:null,weights:{price:50,slot:25,trust:25}}});
 const baseline=await api('/api/settings/models');
 await page.goto(origin+'/home');await page.getByRole('textbox',{name:'Your request',exact:true}).waitFor();
 await page.getByRole('button',{name:/AI model:/}).waitFor();check('Home exposes one compact model control in the topbar',await page.locator('.shell-header .model-trigger').count()===1&&await page.getByText('AI ready',{exact:true}).count()===0);
 await page.getByRole('button',{name:/AI model:/}).click();const menu=page.getByRole('dialog',{name:'Choose AI model'});await menu.getByRole('combobox',{name:'Default request model'}).waitFor();
 await menu.getByRole('combobox').selectOption('gpt-6.1-terra');await menu.getByRole('button',{name:'Save default',exact:true}).click();await menu.getByText('New requests will use GPT-6.1 Terra.',{exact:true}).waitFor();
 const changedDefault=await api('/api/settings/models');check('Home selection saves only the request default and keeps the bill model',changedDefault.selected.request_model==='gpt-6.1-terra'&&changedDefault.selected.bill_model===baseline.selected.bill_model);
 await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});check('Escape closes the picker and returns keyboard focus to its header trigger',await page.locator('.model-trigger').evaluate(element=>element===document.activeElement));
 await page.getByRole('button',{name:/AI model:/}).click();await menu.waitFor();await page.getByRole('textbox',{name:'Your request',exact:true}).click();await menu.waitFor({state:'hidden'});check('Clicking outside closes the anchored picker');
 const snapshot=await api('/api/demo/scenarios/ac_service',{method:'POST',body:{}}),requestId=snapshot.id,initial=await api('/api/requests/'+requestId+'/models');
 let processCalls=0;page.on('request',request=>{if(request.url().endsWith('/process')&&request.method()==='POST')processCalls++;});
 await page.goto(origin+'/requests/'+requestId);await page.locator('.proc-track').waitFor();await page.getByRole('button',{name:/AI model:/}).click();await menu.getByRole('combobox',{name:'Negotiation model'}).waitFor();const beforePause=processCalls;
 await page.waitForTimeout(1900);check('Opening the request picker pauses future processing calls while stages remain visible',processCalls===beforePause&&await page.getByText('Automatic negotiation is paused while you choose.',{exact:false}).count()===1);
 check('Progress uses the centered mark, stage card, animated fill, numbered steps and request quotation',await page.locator('.proc-hero .proc-mark').count()===1&&await page.locator('.glass .proc-track[role="progressbar"]').count()===1&&await page.locator('.steps li').count()===4&&await page.locator('.request-quote').count()===1&&await page.locator('.clock').count()===0);
 const stage=Number(await page.locator('.proc-track').getAttribute('aria-valuenow'));check('Progress percentage is stage based and has an honest accessible description',[3,12,30,60,88,100].includes(stage)&&(await page.locator('.proc-track').getAttribute('aria-valuetext')).includes('not remaining time'));
 await page.screenshot({path:'results/topbar/request-picker-mobile.png',fullPage:true});
 await menu.getByRole('combobox').selectOption('gpt-6-luna');await menu.getByRole('button',{name:'Apply to next actions',exact:true}).click();await menu.getByText('This request will use GPT-6 Luna for its next AI actions.',{exact:true}).waitFor();
 const current=await api('/api/requests/'+requestId+'/models'),global=await api('/api/settings/models');check('Request selection changes future actions with immutable initial settings and independent account default',current.selected.request_model==='gpt-6-luna'&&current.initial.request_model===initial.initial.request_model&&current.selected.bill_model===initial.selected.bill_model&&global.selected.request_model==='gpt-6.1-terra'&&current.revision===1);
 await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});await page.getByRole('tab',{name:/Negotiation room/}).click();check('The negotiation room no longer contains a model settings card',await page.locator('.room .request-model-picker').count()===0);
 await page.getByRole('button',{name:/AI model:/}).click();await menu.getByRole('combobox').waitFor();await page.keyboard.press('Escape');await page.getByRole('tab',{name:'Scoreboard',exact:true}).click();
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'results/topbar/progress-mobile.png',fullPage:true});check('The model control and stage card fit a 390px screen',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Use dark theme'}).click();await page.screenshot({path:'results/topbar/progress-dark.png',fullPage:true});check('Progress supports the dark topbar theme without a light glass border',await page.locator('.proc-hero').evaluate(element=>getComputedStyle(element).getPropertyValue('--proc-glow').trim()==='transparent'));
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'results/topbar/progress-desktop.png',fullPage:true});check('Progress remains within the established desktop shell',await page.locator('.shell').evaluate(element=>element.getBoundingClientRect().width<=innerWidth));
 await page.setViewportSize({width:320,height:780});await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:/AI model:/}).click();await menu.waitFor();check('Header picker remains visible at 320px without horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&await menu.evaluate(element=>{const bounds=element.getBoundingClientRect();return bounds.left>=0&&bounds.right<=innerWidth;}));await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});
 let final;for(let turn=0;turn<32;turn++){final=await api('/api/requests/'+requestId+'/process',{method:'POST',body:{max_steps:2}});if(['awaiting_customer','no_match','locked'].includes(final.status))break;}
 await page.goto(origin+'/requests/'+requestId+'/compare');await page.getByRole('heading',{name:'Offers for you',exact:true}).waitFor();
 const ranked=new Set(final.comparison.groups.flatMap(group=>group.quote_ids)),other=final.branches.filter(branch=>!ranked.has(branch.quote?.id));
 check('Offers view displays every provider outcome, including unranked and awaiting replies',await page.locator('.offer').count()===final.branches.length&&await page.locator('.provider-outcome').count()===other.length);
 check('Every incomplete outcome shows its reason and keeps review disabled',await page.locator('.provider-outcome .outcome-reason').count()===other.length&&await page.locator('.provider-outcome button[aria-label^="Review unavailable"]:disabled').count()===other.length);
 check('Results summary separates actual provider count from comparable offers',(await page.locator('.results-summary').innerText()).includes(final.branches.length+' provider')&&(await page.locator('.results-summary').innerText()).includes((final.branches.length-other.length)+' offer'));
 if(other.length){await page.locator('.provider-outcome').first().getByRole('button',{name:'Details and conversation',exact:true}).click();check('Unranked provider conversation and source details remain inspectable',await page.locator('.provider-outcome .offer-details').count()===1);}
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'results/topbar/all-provider-results.png',fullPage:true});
 await page.getByRole('button',{name:/AI model:/}).click();await menu.getByRole('combobox').waitFor();check('The fast Nano model is available as a third explicit option',await menu.getByRole('option',{name:'GPT-5.4 Nano (Fast)',exact:true}).count()===1&&await menu.getByRole('option').count()===3);
 await menu.getByRole('combobox').selectOption('gpt-5.4-nano');await menu.getByRole('button',{name:'Apply to next actions',exact:true}).click();await menu.getByText('This request will use GPT-5.4 Nano (Fast) for its next AI actions.',{exact:true}).waitFor();await page.keyboard.press('Escape');
 const nano=await api('/api/requests/'+requestId+'/models');check('Nano selection is explicit and keeps account and bill defaults intact',nano.selected.request_model==='gpt-5.4-nano'&&(await api('/api/settings/models')).selected.request_model==='gpt-6.1-terra'&&nano.selected.bill_model===baseline.selected.bill_model);
 await page.setViewportSize({width:320,height:780});await page.waitForTimeout(200);check('The selected Nano label fits the narrow topbar',await page.locator('.model-trigger').innerText().then(text=>text.includes('Nano'))&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 if(process.env.WASIT_SMOKE_SQLITE){
  const fixture=await openStore({databaseUrl:'',sqliteFile:process.env.WASIT_SMOKE_SQLITE,production:false});
  try{await fixture.query("UPDATE branches SET deadline_at=0 WHERE request_id=$1 AND mode='human'",[requestId]);await fixture.query("UPDATE tasks SET due_at=0 WHERE request_id=$1 AND kind='timeout' AND status='pending'",[requestId]);}finally{await fixture.close();}
  await api('/api/requests/'+requestId+'/process',{method:'POST',body:{max_steps:2}});await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('heading',{name:'Offers for you',exact:true}).waitFor();
  check('A provider reply deadline is labeled separately from AI processing',await page.getByText('No provider reply',{exact:true}).count()===1&&await page.getByText('No provider reply within the 90-second reply window. Existing messages remain available.',{exact:true}).count()===1);await page.screenshot({path:'results/topbar/provider-reply-window.png',fullPage:true});
 }
 check('No browser runtime errors',errors.length===0);await writeFile('results/topbar/checks.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
