import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {openStore} from '../server/store.mjs';
import {createAuth} from '../server/auth.mjs';
import {createAccounts} from '../server/accounts.mjs';
import {createAppServer} from '../server/http.mjs';
const ORIGIN='http://localhost:5180',SECRET='accounts-tests-private-session-secret-32-bytes';
const credential={display_name:'Dina',email:'dina@example.test',password:'a private password 123'};
async function setup(t,{file=':memory:',authOptions={}}={}) {
  let time=1794012900000,closed=false;
  const store=await openStore({sqliteFile:file,databaseUrl:'',production:false});
  const auth=createAuth({store,now:()=>time,secret:SECRET,allowedOrigins:[ORIGIN],publicOrigin:ORIGIN,...authOptions});
  const accounts=createAccounts({store,auth,now:()=>time});
  const server=createAppServer({distDir:resolve('dist'),routes:[...auth.routes,...accounts.routes,
    ['GET',/^\/api\/test\/requests\/([^/]+)$/,async({req,params})=>({id:(await auth.ownRequest(req,params[0])).request.id})],
  ]});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const base='http://127.0.0.1:'+server.address().port;
  async function close(){if(closed)return;closed=true;await new Promise(done=>server.close(done));await store.close();}
  t.after(close);
  async function request(path,{method='GET',body,cookie,csrf,origin=ORIGIN,bearer,headers={}}={}) {
    const response=await fetch(base+path,{method,headers:{...(origin==null?{}:{Origin:origin}),...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],setCookie:response.headers.get('set-cookie')};
  }
  const register=(body=credential,cookie)=>request('/api/auth/register',{method:'POST',body,cookie});
  const login=(body={email:credential.email,password:credential.password},cookie)=>request('/api/auth/login',{method:'POST',body,cookie});
  const demo=()=>request('/api/demo/session',{method:'POST',body:{}});
  const one=async(sql,params=[])=>(await store.query(sql,params)).rows[0];
  return {store,auth,accounts,request,register,login,demo,one,close,advance:ms=>{time+=ms;}};
}
test('registration adopts a demo actor, preserves owned jobs and rotates the prior cookie',async t=>{
  const f=await setup(t),demo=await f.demo();
  assert.equal((await f.request('/api/profile',{cookie:demo.cookie})).data,null);
  await f.store.query('INSERT INTO requests(id,user_id,status,created_at) VALUES($1,$2,$3,$4)',['request_account01',demo.data.actor_id,'contacting',1794012900000]);
  const result=await f.register(credential,demo.cookie);
  assert.equal(result.status,201);assert.equal(result.data.actor_id,demo.data.actor_id);
  assert.notEqual(result.cookie,demo.cookie);assert.notEqual(result.data.csrf_token,demo.data.csrf_token);
  assert.deepEqual(result.data.user,{id:demo.data.actor_id,display_name:'Dina',email:'dina@example.test'});
  assert.equal((await f.request('/api/auth/me',{cookie:demo.cookie})).data.user,null);
  assert.equal((await f.request('/api/test/requests/request_account01',{cookie:result.cookie})).status,200);
  assert.equal((await f.request('/api/profile',{cookie:result.cookie})).data,null);
  const me=await f.request('/api/auth/me',{cookie:result.cookie});
  assert.equal(me.data.user.display_name,'Dina');assert.equal(me.data.user.email,credential.email);
  const repeated=await f.request('/api/demo/session',{method:'POST',body:{},cookie:result.cookie});
  assert.equal(repeated.data.actor_id,result.data.actor_id);assert.equal(repeated.data.csrf_token,result.data.csrf_token);
  const account=await f.one('SELECT * FROM accounts');
  assert.notEqual(account.password_hash,credential.password);assert.match(account.password_hash,/^[a-f0-9]{128}$/);
  assert.match(account.password_salt,/^[a-f0-9]{32}$/);
  const stored=JSON.stringify(await f.one('SELECT * FROM sessions'));
  assert.equal(stored.includes(result.cookie.split('=')[1]),false);assert.equal(stored.includes(result.data.csrf_token),false);
  assert.match(result.setCookie,/HttpOnly/);assert.match(result.setCookie,/SameSite=Strict/);
});
test('named identity and password login survive reload and logout without losing ownership',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'wasit-accounts-'));let first,second;
  t.after(async()=>{await second?.close();await first?.close();await rm(dir,{recursive:true,force:true});});
  const file=join(dir,'accounts.sqlite');first=await setup(t,{file});const registered=await first.register();
  const actorId=registered.data.actor_id;
  await first.store.query('INSERT INTO requests(id,user_id,status) VALUES($1,$2,$3)',['request_reload01',actorId,'contacting']);
  const logout=await first.request('/api/auth/logout',{method:'POST',body:{},cookie:registered.cookie,csrf:registered.data.csrf_token});
  assert.equal(logout.status,200);await first.close();
  second=await setup(t,{file});const logged=await second.login();
  assert.equal(logged.status,200);assert.equal(logged.data.actor_id,actorId);
  assert.equal((await second.request('/api/test/requests/request_reload01',{cookie:logged.cookie})).status,200);
  assert.equal((await second.request('/api/auth/me',{cookie:registered.cookie})).data.user,null);
});
test('account switching keeps separate actor data and invalidates the replaced session',async t=>{
  const f=await setup(t),a=await f.register();
  await f.store.query('INSERT INTO requests(id,user_id,status) VALUES($1,$2,$3)',['request_private01',a.data.actor_id,'contacting']);
  const b=await f.register({display_name:'Bima',email:'bima@example.test',password:credential.password},a.cookie);
  assert.equal(b.status,201);assert.notEqual(a.data.actor_id,b.data.actor_id);
  assert.equal((await f.request('/api/test/requests/request_private01',{cookie:b.cookie})).status,404);
  assert.equal((await f.request('/api/auth/me',{cookie:a.cookie})).data.user,null);
  const back=await f.login(undefined,b.cookie);
  assert.equal(back.data.actor_id,a.data.actor_id);
  assert.equal((await f.request('/api/auth/me',{cookie:b.cookie})).data.user,null);
  assert.equal((await f.request('/api/test/requests/request_private01',{cookie:back.cookie})).status,200);
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM accounts')).count,2);
});
test('registration and login require exact origin, JSON content and the consumer role',async t=>{
  const f=await setup(t);
  assert.equal((await f.request('/api/auth/register',{method:'POST',body:credential,origin:'https://attacker.example'})).status,403);
  assert.equal((await f.request('/api/auth/login',{method:'POST',body:{email:credential.email,password:credential.password},origin:null})).status,403);
  assert.equal((await f.request('/api/auth/register',{method:'POST',body:credential,bearer:'provider-link'})).status,403);
  assert.equal((await f.request('/api/auth/register',{method:'POST',body:credential,headers:{'Content-Type':'text/plain'}})).status,400);
  assert.equal((await f.register({...credential,role:'admin'})).status,400);
  assert.equal((await f.register({...credential,password:'short'})).status,400);
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM accounts')).count,0);
});
test('profile is private, read-only on GET and requires CSRF plus complete onboarding on first save',async t=>{
  const f=await setup(t),a=await f.demo(),b=await f.demo();
  assert.equal((await f.request('/api/profile')).status,401);
  assert.equal((await f.request('/api/profile',{cookie:a.cookie})).data,null);
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM profiles')).count,0);
  const profile={display_name:'Alya',location_label:'Kelapa Gading',default_category:'ac_service',weights:{price:60,slot:25,trust:15}};
  assert.equal((await f.request('/api/profile',{method:'PUT',body:profile,cookie:a.cookie})).status,403);
  assert.equal((await f.request('/api/profile',{method:'PUT',body:profile,cookie:a.cookie,csrf:a.data.csrf_token,origin:'https://attacker.example'})).status,403);
  assert.equal((await f.request('/api/profile',{method:'PUT',body:{display_name:'Alya'},cookie:a.cookie,csrf:a.data.csrf_token})).status,400);
  const saved=await f.request('/api/profile',{method:'PUT',body:profile,cookie:a.cookie,csrf:a.data.csrf_token});
  assert.equal(saved.status,200);assert.deepEqual(saved.data,profile);
  assert.equal((await f.request('/api/profile',{cookie:b.cookie})).data,null);
  assert.deepEqual((await f.request('/api/profile',{cookie:a.cookie})).data,profile);
  assert.equal((await f.request('/api/profile',{method:'PUT',body:{actor_id:b.data.actor_id},cookie:a.cookie,csrf:a.data.csrf_token})).status,400);
  assert.equal((await f.request('/api/profile',{method:'PUT',body:{weights:{price:100,slot:10,trust:0}},cookie:a.cookie,csrf:a.data.csrf_token})).status,400);
  assert.equal((await f.request('/api/profile',{method:'PUT',body:{default_category:'unsupported'},cookie:a.cookie,csrf:a.data.csrf_token})).status,400);
});
test('profile updates persist and synchronize the named display name without exposing account secrets',async t=>{
  const f=await setup(t),a=await f.register();
  const initial=await f.request('/api/profile',{method:'PUT',body:{location_label:'Tebet'},cookie:a.cookie,csrf:a.data.csrf_token});
  assert.equal(initial.status,200);assert.equal(initial.data.display_name,'Dina');
  assert.deepEqual(initial.data.weights,{price:50,slot:25,trust:25});assert.equal(initial.data.default_category,null);
  const changed=await f.request('/api/profile',{method:'PUT',body:{display_name:'Dina Putri',default_category:'washer'},cookie:a.cookie,csrf:a.data.csrf_token});
  assert.equal(changed.data.location_label,'Tebet');
  assert.equal((await f.request('/api/auth/me',{cookie:a.cookie})).data.user.display_name,'Dina Putri');
  assert.equal(JSON.stringify(changed.data).includes('password'),false);
});
test('login normalizes email and uses the same generic error for missing accounts and wrong passwords',async t=>{
  const f=await setup(t);await f.register({...credential,email:' Dina@Example.Test '});
  const wrong=await f.login({email:'dina@example.test',password:'wrong-password-123'});
  const absent=await f.login({email:'nobody@example.test',password:'wrong-password-123'});
  assert.equal(wrong.status,401);assert.equal(absent.status,401);assert.deepEqual(wrong.data,absent.data);
  assert.equal(wrong.data.error,'invalid_credentials');
  const good=await f.login({email:'DINA@EXAMPLE.TEST',password:credential.password});
  assert.equal(good.status,200);assert.equal(good.data.user.email,'dina@example.test');
  const duplicate=await f.register({...credential,email:'DINA@EXAMPLE.TEST'});
  assert.equal(duplicate.status,409);assert.equal((await f.one('SELECT COUNT(*) AS count FROM accounts')).count,1);
});
test('login throttling persists across service instances and recovers after its window',async t=>{
  const f=await setup(t);await f.register();
  for(let i=0;i<8;i++)assert.equal((await f.login({email:credential.email,password:'incorrect-password'})).status,401);
  assert.equal((await f.login()).status,429);
  const second=createAccounts({store:f.store,auth:f.auth,now:()=>1794012900000});
  const handler=second.routes.find(([method,regex])=>method==='POST'&&regex.test('/api/auth/login'))[2];
  await assert.rejects(handler({req:{headers:{origin:ORIGIN,'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}},res:{setHeader(){}},body:{email:credential.email,password:credential.password}}),{status:429});
  const records=(await f.store.query('SELECT * FROM auth_attempts')).rows;
  assert.equal(JSON.stringify(records).includes(credential.email),false);
  f.advance(15*60*1000+1);
  assert.equal((await f.login()).status,200);
});
test('concurrent registrations cannot link two named accounts to the same demo actor',async t=>{
  const f=await setup(t),demo=await f.demo();
  const [a,b]=await Promise.all([f.register(credential,demo.cookie),f.register({...credential,display_name:'Rani',email:'rani@example.test'},demo.cookie)]);
  assert.equal(a.status,201);assert.equal(b.status,201);
  assert.notEqual(a.data.actor_id,b.data.actor_id);
  assert.ok([a.data.actor_id,b.data.actor_id].includes(demo.data.actor_id));
  assert.equal((await f.one('SELECT COUNT(*) AS count FROM accounts')).count,2);
});
test('named sessions retain secure host cookie attributes in production configuration',async t=>{
  const f=await setup(t,{authOptions:{secure:true,publicOrigin:'https://wasit.example',allowedOrigins:['https://wasit.example']}});
  const registered=await f.request('/api/auth/register',{method:'POST',body:credential,origin:'https://wasit.example'});
  assert.equal(registered.status,201);assert.match(registered.setCookie,/^__Host-wasit_session=/);
  assert.match(registered.setCookie,/; Secure/);assert.match(registered.setCookie,/HttpOnly/);assert.match(registered.setCookie,/SameSite=Strict/);
});
