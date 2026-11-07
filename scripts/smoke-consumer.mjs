import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

export async function smokeConsumer({origin=process.env.WASIT_SMOKE_ORIGIN??'http://127.0.0.1:3311'}={}) {
 await mkdir('results/consumer',{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'}),page=await context.newPage(),checks=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const check=(name,condition=true)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name);};
 try {
  await page.goto(origin);await page.getByRole('heading',{name:'Better deals from local pros. No surprise extras.'}).waitFor();
  check('Entry is centered, chrome-less, and Light under a dark OS preference',await page.locator('.shell-header').count()===0&&await page.locator('html').getAttribute('data-theme')==='light');
  await page.screenshot({path:'results/consumer/welcome-mobile-after.png',fullPage:true});
  await page.getByRole('button',{name:'Find my best deal'}).click();await page.getByRole('heading',{name:'A little about you'}).waitFor();
  check('Entry advances to profile setup without an email gate');
  await page.getByRole('textbox',{name:/Display name/}).fill('Demo River');await page.getByRole('combobox',{name:'District',exact:true}).selectOption('Kelapa Gading');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Lock Trust',exact:true}).click();
  await page.getByRole('slider',{name:'Price',exact:true}).focus();await page.keyboard.press('End');
  const values=await page.locator('.pref-head strong').allTextContents();
  check('Locked priority stays fixed while other factors redistribute to 100%',values.includes('25%')&&values.reduce((sum,value)=>sum+Number(value.replace('%','')),0)===100);
  await page.getByRole('button',{name:'Save and start'}).click();await page.getByRole('textbox',{name:'Your request',exact:true}).waitFor();
  check('Setup opens the compact composer with history and settings',await page.locator('.shell-header').count()===1&&await page.locator('.prompt').count()===1);
  await page.getByRole('button',{name:'Set service, budget and priorities'}).click();
  check('Saved location and priorities prefill, but spending cap stays blank',await page.getByRole('textbox',{name:'Service area',exact:true}).inputValue()==='Kelapa Gading'&&await page.getByRole('spinbutton',{name:'Maximum budget (Rp)',exact:true}).inputValue()==='');
  await page.getByRole('button',{name:'Hide request details'}).click();
  await page.getByRole('textbox',{name:'Your request',exact:true}).fill('Please clean my AC.');await page.getByRole('textbox',{name:'Your request',exact:true}).press('Enter');
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  check('Incomplete requests open the canonical clarification bottom sheet inline');
  await dialog.getByRole('button',{name:'Tomorrow morning',exact:true}).click();await dialog.getByRole('button',{name:'Rp250.000',exact:true}).click();
  await dialog.getByRole('button',{name:'Confirm and find providers'}).click();await page.waitForURL('**/requests/*');const requestURL=page.url();
  await page.getByRole('heading',{name:/Wasit is contacting providers|Wasit is negotiating for you/}).waitFor();
  check('Canonical clarification advances through the launch into the live scoreboard',await page.locator('.scoreboard').count()===1);
  await page.getByRole('tab',{name:/Negotiation room/}).click();await page.locator('.room-chips button').filter({hasText:'Dingin'}).click();
  const takeover=page.getByRole('switch',{name:'Take over this conversation'});await takeover.click();await page.getByRole('textbox',{name:'Message this provider'}).fill('Please bring a protective cover.');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.locator('.pthread .bubble.human').filter({hasText:'Please bring a protective cover.'}).waitFor();
  check('Takeover switch sends a stable-ID customer message in the selected branch');await takeover.click();
  await page.waitForFunction(()=>document.querySelector('[role="switch"][aria-label="Take over this conversation"]')?.getAttribute('aria-checked')==='false');check('Customer explicitly hands the conversation back to Wasit');
  await page.getByRole('tab',{name:'Scoreboard',exact:true}).focus();await page.keyboard.press('ArrowRight');check('Room tabs support arrow-key navigation',await page.getByRole('tab',{name:/Negotiation room/}).getAttribute('aria-selected')==='true');
  await page.getByRole('button',{name:'Compare',exact:true}).click();await page.getByRole('button',{name:'Review',exact:true}).first().waitFor({timeout:90000});
  check('Verified scope groups render as the expandable offer list',await page.locator('.offer').count()>0);
  await page.getByRole('button',{name:'Cheapest',exact:true}).click();await page.getByRole('button',{name:'Details and conversation',exact:true}).first().click();await page.getByText('View provider source',{exact:true}).first().click();
  check('Offer details expose exact item quantities and provider source snippets',await page.locator('.consumer-source blockquote').first().isVisible());
  await page.locator('.consumer-planning > summary').first().click();check('Optional planning remains advisory and separate from agreed charges',await page.getByText('Each scenario adds one optional item to the quoted scope.',{exact:false}).first().isVisible());
  await page.locator('.alt > summary').click();check('Incomplete offers retain an explicit exclusion reason',await page.locator('.alt').innerText().then(text=>text.includes('detail')));
  check('Offer comparison has no horizontal overflow at 390px',await page.evaluate(()=>document.documentElement.scrollWidth<=390));await page.screenshot({path:'results/consumer/compare-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Review',exact:true}).first().click();await page.waitForURL('**/deals/*');check('Choosing an offer opens immutable agreement review without accepting it');
  await page.goto(origin+'/account');await page.getByRole('button',{name:'Sign out and switch account'}).click();await page.getByRole('button',{name:'Create account',exact:true}).click();
  const email='river-'+Date.now()+'@example.test',password='River-demo-password-42';
  await page.getByRole('textbox',{name:'Display name',exact:true}).fill('River Account');await page.getByRole('textbox',{name:'Email address',exact:true}).fill(email);await page.locator('input[autocomplete="new-password"]').fill(password);await page.getByRole('button',{name:'Create my account',exact:true}).click();await page.getByRole('heading',{name:'A little about you'}).waitFor();
  check('Named registration uses the real backend and starts a separate persistent profile');
  await page.getByRole('combobox',{name:'City',exact:true}).selectOption('South Jakarta');await page.getByRole('combobox',{name:'District',exact:true}).selectOption('Tebet');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Save and start'}).click();await page.getByRole('textbox',{name:'Your request',exact:true}).waitFor();
  check('Named profile is saved to its own account and used by the composer',await page.locator('.prompt-area').innerText().then(text=>text.includes('Tebet')));
  await page.reload();await page.getByRole('textbox',{name:'Your request',exact:true}).waitFor();check('Named session and persistent profile restore after reload',await page.locator('.greeting').innerText().then(text=>text.includes('River Account')));
  await page.goto(origin+'/account');await page.getByRole('button',{name:'Sign out and switch account'}).click();await page.getByRole('textbox',{name:'Email address',exact:true}).fill(email);await page.locator('input[autocomplete="current-password"]').fill('wrong-password');await page.getByRole('button',{name:'Sign in',exact:true}).last().click();await page.getByRole('alert').waitFor();check('Invalid sign-in shows a real server error and preserves the entered email',await page.getByRole('textbox',{name:'Email address',exact:true}).inputValue()===email);
  await page.locator('input[autocomplete="current-password"]').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).last().click();await page.getByRole('heading',{name:'Edit your profile and area'}).waitFor();check('Explicit account sign-out and sign-in restores only that account profile',await page.getByRole('combobox',{name:'District',exact:true}).inputValue()==='Tebet');
  await page.goto(origin+'/home');await page.getByRole('textbox',{name:'Your request',exact:true}).fill('My draft survives navigation.');await page.goto(origin+'/settings');await page.goto(origin+'/home');await page.getByRole('textbox',{name:'Your request',exact:true}).waitFor();check('Composer draft survives navigation in its account session',await page.getByRole('textbox',{name:'Your request',exact:true}).inputValue()==='My draft survives navigation.');
  await page.setViewportSize({width:1440,height:1000});check('Desktop composer has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=1440));await page.screenshot({path:'results/consumer/composer-desktop.png',fullPage:true});
  await page.goto(origin+'/demo');await page.getByRole('heading',{name:'Demo controls',exact:true}).waitFor();check('Demo provides explicit app and welcome returns',await page.getByRole('button',{name:'Back to app',exact:true}).count()===1&&await page.getByRole('button',{name:'Back to welcome',exact:true}).count()===1);
  const presentation=page.getByRole('button',{name:'Presentation view',exact:true});if(await presentation.isEnabled()){await presentation.click();await page.waitForFunction(()=>Boolean(document.fullscreenElement));await page.getByRole('button',{name:'Exit presentation view',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);check('Presentation view enters and exits explicitly');}
  await page.getByRole('button',{name:'Back to welcome',exact:true}).click();await page.getByRole('heading',{name:'Better deals from local pros. No surprise extras.'}).waitFor();check('Returning to welcome keeps the current account and does not reset data');
  check('No browser runtime exceptions occurred',errors.length===0);
  await writeFile('results/consumer/report.json',JSON.stringify({origin,checks,errors},null,2));return {checks,errors};
 }catch(error){await page.screenshot({path:'results/consumer/failure.png',fullPage:true}).catch(()=>{});await writeFile('results/consumer/failure.txt',page.url()+'\n'+String(error)+'\n'+await page.locator('body').innerText()).catch(()=>{});throw error;}finally{await browser.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)smokeConsumer().then(result=>console.log(result.checks.length+' consumer browser checks passed.')).catch(error=>{console.error(error);process.exitCode=1;});
