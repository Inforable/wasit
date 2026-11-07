import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppServer } from '../server/http.mjs';
import { openStore } from '../server/store.mjs';
import { createAuth, SESSION_TTL_MS, PROVIDER_TTL_MS } from '../server/auth.mjs';

const SECRET = 'wasit-auth-tests-private-secret-32-bytes-minimum';
const ORIGIN = 'http://localhost:5180';
async function setup(t, options = {}) {
  const store = await openStore({ sqliteFile: options.file ?? ':memory:',databaseUrl:'',production:false });
  let time = 1794012900000;
  const auth = createAuth({store,secret:SECRET,publicOrigin:ORIGIN,allowedOrigins:[ORIGIN],now:()=>time,...options.auth});
  const routes = [...auth.routes,
    ['GET',/^\/api\/test\/customer$/,async({req})=>{const actor=await auth.requireConsumer(req);return {actor_id:actor.actor_id,role:actor.role};}],
    ['POST',/^\/api\/test\/mutate$/,async({req})=>{const actor=await auth.requireConsumer(req,{mutation:true});return {actor_id:actor.actor_id,ok:true};}],
    ['GET',/^\/api\/test\/requests\/([^/]+)$/,async({req,params})=>{const actor=await auth.ownRequest(req,params[0]);return {actor_id:actor.actor_id};}],
    ['GET',/^\/api\/test\/deals\/([^/]+)$/,async({req,params})=>{const actor=await auth.ownDeal(req,params[0]);return {actor_id:actor.actor_id};}],
    ['GET',/^\/api\/test\/versions\/([^/]+)\/([^/]+)$/,async({req,params})=>{const actor=await auth.ownVersion(req,params[0],params[1]);return {actor_id:actor.actor_id};}],
    ['GET',/^\/api\/provider\/([^/]+)$/,async({req,params})=>{const actor=await auth.requireProvider(req,params[0]);return {role:actor.role,branch_id:actor.branch_id,actor_id:actor.actor_id};}],
  ];
  const server=createAppServer({distDir:resolve('dist'),routes});
  await new Promise((done)=>server.listen(0,'127.0.0.1',done));
  const base='http://127.0.0.1:'+server.address().port;
  let closed=false;
  const close=async()=>{if(closed)return;closed=true;await new Promise((done)=>server.close(done));await store.close();};
  t.after(close);
  async function request(path,{method='GET',cookie,csrf,bearer,origin=options.origin??ORIGIN,body,headers={}}={}) {
    const response=await fetch(base+path,{method,headers:{
      ...(origin==null?{}:{Origin:origin}),...(cookie?{Cookie:cookie}:{}),
      ...(csrf?{'X-CSRF-Token':csrf}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{}),
      ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers,
    },...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();
    return {status:response.status,data,setCookie:response.headers.get('set-cookie'),response};
  }
  async function bootstrap(cookie) {
    const result=await request('/api/demo/session',{method:'POST',cookie,body:{}});
    return {...result,cookie:result.setCookie?.split(';')[0]??cookie};
  }
  async function seed(actorId,{requestId='request_auth01',branchId='branch_human01',mode='human'}={}) {
    await store.query('INSERT INTO requests (id,user_id,status,created_at) VALUES ($1,$2,$3,$4)',[requestId,actorId,'negotiating',time]);
    await store.query('INSERT INTO branches (id,request_id,provider_id,mode,status) VALUES ($1,$2,$3,$4,$5)',[branchId,requestId,'provider_dingin01',mode,'awaiting_reply']);
    return {requestId,branchId};
  }
  return {store,auth,server,request,bootstrap,seed,close,advance:(ms)=>{time+=ms;}};
}

test('HTTP session bootstrap requires exact origin, persists only hashes, and preserves the actor on reload',async(t)=>{
  const ctx=await setup(t);
  assert.equal((await ctx.request('/api/demo/session',{method:'POST',origin:null,body:{}})).status,403);
  assert.equal((await ctx.request('/api/demo/session',{method:'POST',origin:'http://localhost:5180.attacker.example',body:{}})).status,403);
  assert.equal((await ctx.request('/api/demo/session',{method:'POST',body:{actor_id:'consumer_attacker01'}})).status,400);
  const first=await ctx.bootstrap();
  assert.equal(first.status,201);assert.match(first.data.actor_id,/^consumer_/);
  assert.match(first.setCookie,/HttpOnly/);assert.match(first.setCookie,/SameSite=Strict/);assert.match(first.setCookie,/Path=\//);
  assert.ok(!first.setCookie.includes('Secure'));
  const raw=first.cookie.split('=')[1], rows=(await ctx.store.query('SELECT * FROM sessions')).rows;
  assert.equal(rows.length,1);assert.notEqual(rows[0].id,raw);assert.match(rows[0].id,/^[0-9a-f]{64}$/);
  assert.notEqual(rows[0].csrf_hash,first.data.csrf_token);
  assert.ok(!JSON.stringify(rows).includes(raw));
  const replay=await ctx.bootstrap(first.cookie);
  assert.equal(replay.status,200);assert.equal(replay.data.actor_id,first.data.actor_id);assert.equal(replay.data.csrf_token,first.data.csrf_token);
  const me=await ctx.request('/api/auth/me',{cookie:first.cookie});
  assert.deepEqual(me.data,{user:{id:first.data.actor_id,role:'consumer'}});
});

test('HTTP mutations require the session, matching CSRF and allowed origin',async(t)=>{
  const ctx=await setup(t),session=await ctx.bootstrap();
  assert.equal((await ctx.request('/api/test/mutate',{method:'POST',body:{}})).status,401);
  assert.equal((await ctx.request('/api/test/mutate',{method:'POST',cookie:session.cookie,body:{}})).status,403);
  assert.equal((await ctx.request('/api/test/mutate',{method:'POST',cookie:session.cookie,csrf:'x'.repeat(64),body:{}})).status,403);
  assert.equal((await ctx.request('/api/test/mutate',{method:'POST',cookie:session.cookie,csrf:session.data.csrf_token,origin:'https://attacker.example',body:{}})).status,403);
  assert.equal((await ctx.request('/api/test/mutate',{method:'POST',cookie:session.cookie,csrf:session.data.csrf_token,body:{}})).status,200);
  const tampered=session.cookie.slice(0,-1)+(session.cookie.endsWith('a')?'b':'a');
  assert.equal((await ctx.request('/api/test/customer',{cookie:tampered})).status,401);
  assert.equal((await ctx.request('/api/test/customer',{cookie:session.cookie+'; '+session.cookie})).status,401);
  ctx.advance(SESSION_TTL_MS);
  assert.equal((await ctx.request('/api/test/customer',{cookie:session.cookie})).status,401);
});

test('logout invalidates persistent sessions and expires the exact cookie',async(t)=>{
  const ctx=await setup(t),session=await ctx.bootstrap();
  assert.equal((await ctx.request('/api/auth/logout',{method:'POST',cookie:session.cookie,body:{}})).status,403);
  const logout=await ctx.request('/api/auth/logout',{method:'POST',cookie:session.cookie,csrf:session.data.csrf_token,body:{}});
  assert.equal(logout.status,200);assert.match(logout.setCookie,/Max-Age=0/);
  assert.equal((await ctx.request('/api/auth/me',{cookie:session.cookie})).data.user,null);
  assert.equal((await ctx.store.query('SELECT COUNT(*) AS n FROM sessions')).rows[0].n,0);
});

test('consumer session survives an actual database close and server recreation',async(t)=>{
  const folder=await mkdtemp(join(tmpdir(),'wasit-auth-'));
  assert.equal(dirname(folder),resolve(tmpdir()));
  const file=join(folder,'sessions.sqlite');
  const first=await setup(t,{file}),session=await first.bootstrap();
  await first.close();
  const second=await setup(t,{file});
  const replay=await second.bootstrap(session.cookie);
  assert.equal(replay.data.actor_id,session.data.actor_id);
  assert.equal(replay.data.csrf_token,session.data.csrf_token);
  await second.close();
  await rm(folder,{recursive:true,force:true});
});

test('provider grants are branch-bound, stored as hashes, reusable on GET and rotated only on POST',async(t)=>{
  const ctx=await setup(t),session=await ctx.bootstrap();
  const {requestId,branchId}=await ctx.seed(session.data.actor_id);
  const path='/api/requests/'+requestId+'/branches/'+branchId+'/link';
  assert.equal((await ctx.request(path,{cookie:session.cookie})).status,409);
  assert.equal((await ctx.request(path,{method:'POST',cookie:session.cookie,body:{}})).status,403);
  const issued=await ctx.request(path,{method:'POST',cookie:session.cookie,csrf:session.data.csrf_token,body:{}});
  assert.equal(issued.status,200);
  const url=new URL(issued.data.provider_url),token=new URLSearchParams(url.hash.slice(1)).get('token');
  assert.equal(url.origin,ORIGIN);assert.equal(url.search,'');assert.match(token,/^[A-Za-z0-9_-]{43}$/);
  const stored=(await ctx.store.query('SELECT token,token_hash,token_nonce,token_expires_at FROM branches WHERE id=$1',[branchId])).rows[0];
  assert.equal(stored.token,null);assert.notEqual(stored.token_hash,token);assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal((await ctx.request(path,{cookie:session.cookie})).data.provider_url,issued.data.provider_url);
  assert.equal((await ctx.request('/api/provider/'+branchId,{bearer:token})).status,200);
  assert.equal((await ctx.request('/api/provider/'+branchId,{cookie:session.cookie})).status,403);
  assert.equal((await ctx.request('/api/provider/branch_other01',{bearer:token})).status,403);
  assert.equal((await ctx.request('/api/test/customer',{bearer:token})).status,403);
  const tampered=token.slice(0,-1)+(token.endsWith('a')?'b':'a');
  assert.equal((await ctx.request('/api/provider/'+branchId,{bearer:tampered})).status,403);
  const rotated=await ctx.request(path,{method:'POST',cookie:session.cookie,csrf:session.data.csrf_token,body:{}});
  assert.notEqual(rotated.data.provider_url,issued.data.provider_url);
  assert.equal((await ctx.request('/api/provider/'+branchId,{bearer:token})).status,403);
  const newToken=new URLSearchParams(new URL(rotated.data.provider_url).hash.slice(1)).get('token');
  ctx.advance(PROVIDER_TTL_MS);
  assert.equal((await ctx.request('/api/provider/'+branchId,{bearer:newToken})).status,403);
});

test('resource ownership and request-branch-deal-version relationships are checked in SQL',async(t)=>{
  const ctx=await setup(t),owner=await ctx.bootstrap(),other=await ctx.bootstrap();
  const {requestId,branchId}=await ctx.seed(owner.data.actor_id);
  await ctx.store.query('INSERT INTO deals (id,request_id,branch_id,provider_label) VALUES ($1,$2,$3,$4)',['deal_auth01',requestId,branchId,'Dingin Jaya']);
  await ctx.store.query('INSERT INTO agreement_versions (id,deal_id,number,status,terms_json,terms_digest,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',['version_auth01','deal_auth01',1,'draft','{}','digest',1]);
  assert.equal((await ctx.request('/api/test/requests/'+requestId,{cookie:owner.cookie})).status,200);
  assert.equal((await ctx.request('/api/test/requests/'+requestId,{cookie:other.cookie})).status,404);
  assert.equal((await ctx.request('/api/test/deals/deal_auth01',{cookie:other.cookie})).status,404);
  assert.equal((await ctx.request('/api/test/versions/deal_auth01/version_auth01',{cookie:owner.cookie})).status,200);
  assert.equal((await ctx.request('/api/test/versions/deal_auth01/version_other01',{cookie:owner.cookie})).status,404);
  assert.equal((await ctx.request('/api/requests/'+requestId+'/branches/'+branchId+'/link',{cookie:other.cookie})).status,404);
  await ctx.seed(other.data.actor_id,{requestId:'request_other01',branchId:'branch_other01'});
  assert.equal((await ctx.request('/api/requests/'+requestId+'/branches/branch_other01/link',{cookie:owner.cookie})).status,404);
});

test('script branches never receive human bearer grants and token-only responses expose no private data',async(t)=>{
  const ctx=await setup(t),session=await ctx.bootstrap();
  await ctx.seed(session.data.actor_id,{branchId:'branch_script01',mode:'script'});
  await assert.rejects(ctx.auth.mintProviderGrant('branch_script01'),(error)=>error.status===404);
  await ctx.seed(session.data.actor_id,{requestId:'request_human02',branchId:'branch_human02'});
  const grant=await ctx.auth.mintProviderGrant('branch_human02');
  const publicResult=await ctx.request('/api/provider/branch_human02',{bearer:grant.token});
  assert.equal(publicResult.status,200);
  const text=JSON.stringify(publicResult.data);
  for(const privateName of ['max_budget','spending_limit','csrf','token','events','session_id']) assert.ok(!text.includes(privateName));
  const changedSecret=createAuth({store:ctx.store,secret:'different-private-secret-more-than-32-characters',publicOrigin:ORIGIN,allowedOrigins:[ORIGIN]});
  const request={headers:{cookie:session.cookie}};
  await assert.rejects(changedSecret.requireConsumer(request),(error)=>error.status===401);
});

test('production requires a private secret and HTTPS and uses host-only Secure cookies',async(t)=>{
  const broken=await setup(t,{auth:{secure:true,secret:'',publicOrigin:'https://wasit.test',allowedOrigins:['https://wasit.test']},origin:'https://wasit.test'});
  assert.equal((await broken.bootstrap()).status,503);
  const insecure=await setup(t,{auth:{secure:true,secret:SECRET,publicOrigin:'http://wasit.test',allowedOrigins:['http://wasit.test']},origin:'http://wasit.test'});
  assert.equal((await insecure.bootstrap()).status,503);
  const valid=await setup(t,{auth:{secure:true,secret:SECRET,publicOrigin:'https://wasit.test',allowedOrigins:['https://wasit.test']},origin:'https://wasit.test'});
  const session=await valid.bootstrap();
  assert.equal(session.status,201);assert.match(session.setCookie,/^__Host-wasit_session=/);
  assert.match(session.setCookie,/; Secure/);assert.ok(!session.setCookie.includes('Domain='));
  assert.equal((await valid.request('/api/auth/me',{cookie:session.cookie})).status,200);
});

test('provider grants are revoked by secret rotation or nonce corruption',async t=>{
  const ctx=await setup(t),session=await ctx.bootstrap();
  const {branchId}=await ctx.seed(session.data.actor_id);
  const original=await ctx.auth.mintProviderGrant(branchId),request={headers:{authorization:'Bearer '+original.token}};
  assert.equal((await ctx.auth.requireProvider(request,branchId)).branch_id,branchId);
  const rotated=createAuth({store:ctx.store,secret:'rotated-provider-secret-at-least-32-characters',publicOrigin:ORIGIN,allowedOrigins:[ORIGIN]});
  await assert.rejects(rotated.requireProvider(request,branchId),error=>error.status===403&&error.code==='invalid_provider_token');
  const fresh=await rotated.mintProviderGrant(branchId);
  assert.equal((await rotated.requireProvider({headers:{authorization:'Bearer '+fresh.token}},branchId)).branch_id,branchId);
  await assert.rejects(ctx.auth.requireProvider({headers:{authorization:'Bearer '+fresh.token}},branchId),error=>error.status===403);
  await ctx.store.query('UPDATE branches SET token_nonce=$1 WHERE id=$2',['x'.repeat(43),branchId]);
  await assert.rejects(rotated.requireProvider({headers:{authorization:'Bearer '+fresh.token}},branchId),error=>error.status===403);
});
