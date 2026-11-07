import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {HttpError} from './errors.mjs';
import {reply} from './http.mjs';
import {CATEGORIES} from './catalog.mjs';

const scrypt=promisify(scryptCallback);
const LIMIT_WINDOW=15*60*1000;
const defaults={price:50,slot:25,trust:25};
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,code,message)=>new HttpError(status,code,message);
const invalid=message=>fail(400,'invalid_payload',message);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
function fields(body,allowed,required=[]) {
  if(!plain(body)||Object.keys(body).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(body,key)))throw invalid('Send only the required account or profile fields.');
}
function displayName(value) {
  if(typeof value!=='string'||!value.trim()||value.trim().length>80||/[\u0000-\u001f\u007f]/.test(value))throw invalid('Use a display name from 1 to 80 characters.');
  return value.trim();
}
function emailAddress(value) {
  if(typeof value!=='string')throw invalid('Enter a valid email address.');
  const email=value.trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw invalid('Enter a valid email address.');
  return email;
}
function password(value,registration=false) {
  if(typeof value!=='string'||value.length<(registration?8:1)||value.length>128||Buffer.byteLength(value,'utf8')>512)throw invalid(registration?'Use a password from 8 to 128 characters.':'Enter your email and password.');
  return value;
}
async function derive(value,salt) {
  return scrypt(value,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
}
function parseProfile(text) {try{return JSON.parse(text);}catch{return null;}}
function profileFields(input,existing,accountName) {
  fields(input,['display_name','location_label','default_category','weights']);
  const result={display_name:existing?.display_name??accountName??'',location_label:existing?.location_label??null,default_category:existing?.default_category??null,weights:existing?.weights??{...defaults}};
  if('display_name'in input)result.display_name=displayName(input.display_name);
  if('location_label'in input) {
    if(typeof input.location_label!=='string'||!input.location_label.trim()||input.location_label.trim().length>160||/[\u0000-\u001f\u007f]/.test(input.location_label))throw invalid('Enter a service area from 1 to 160 characters.');
    result.location_label=input.location_label.trim();
  }
  if('default_category'in input){
    if(input.default_category!==null&&!CATEGORIES.some(category=>category.id===input.default_category))throw invalid('Choose a supported default service category.');
    result.default_category=input.default_category;
  }
  if('weights'in input){
    const value=input.weights,keys=['price','slot','trust'];
    if(!plain(value)||Object.keys(value).length!==3||keys.some(key=>!Number.isInteger(value[key])||value[key]<0||value[key]>100)||keys.reduce((sum,key)=>sum+value[key],0)!==100)throw invalid('Priority weights must be integers adding up to 100.');
    result.weights=Object.fromEntries(keys.map(key=>[key,value[key]]));
  }
  if(!result.display_name||!result.location_label)throw invalid('Complete your display name and service area before continuing.');
  return result;
}
/** Named accounts are optional; anonymous consumer sessions keep the same ownership boundary. */
export function createAccounts({store,auth,now=Date.now}={}) {
  if(!store?.transaction||!auth?.bootstrapActor||!auth?.prepareConsumerSession)throw new TypeError('Accounts require persistent storage and session authentication.');
  const first=async(db,sql,params=[]) => (await db.query(sql,params)).rows[0]??null;
  const publicUser=account=>({id:account.actor_id,display_name:account.display_name,email:account.email});
  async function throttle(key,limit) {
    const at=now();
    const allowed=await store.transaction(async tx=>{
      await tx.query('INSERT INTO auth_attempts(key,attempts,window_started,blocked_until) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO NOTHING',[key,0,at,0]);
      await tx.query('UPDATE auth_attempts SET attempts=attempts WHERE key=$1',[key]);
      const row=await first(tx,'SELECT * FROM auth_attempts WHERE key=$1',[key]);
      if(Number(row.blocked_until)>at)return false;
      const expired=Number(row.window_started)+LIMIT_WINDOW<=at;
      const attempts=expired?1:Number(row.attempts)+1,start=expired?at:Number(row.window_started);
      await tx.query('UPDATE auth_attempts SET attempts=$1,window_started=$2,blocked_until=$3 WHERE key=$4',[attempts,start,attempts>limit?start+LIMIT_WINDOW:0,key]);
      return attempts<=limit;
    });
    if(!allowed)throw fail(429,'auth_rate_limited','Too many account attempts. Try again later.');
  }
  const ipKey=req=>digest('ip:'+String(req.socket?.remoteAddress??'unavailable').slice(0,100));
  async function register({req,res,body}) {
    const existing=await auth.bootstrapActor(req);
    fields(body,['display_name','email','password'],['display_name','email','password']);
    const name=displayName(body.display_name),email=emailAddress(body.email),raw=password(body.password,true);
    await throttle('register:'+ipKey(req),20);
    const salt=randomBytes(16).toString('hex'),derived=await derive(raw,salt);
    let account,session;
    try{
      await store.transaction(async tx=>{
        if(existing?.session_id)await tx.query('UPDATE sessions SET generation=generation WHERE id=$1',[existing.session_id]);
        const linked=existing?await first(tx,'SELECT actor_id FROM accounts WHERE actor_id=$1',[existing.actor_id]):null;
        const actorId=existing&&!linked?existing.actor_id:'consumer_'+randomBytes(10).toString('hex');
        const at=now();
        await tx.query('INSERT INTO accounts(actor_id,email,display_name,password_salt,password_hash,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[actorId,email,name,salt,derived.toString('hex'),at,at]);
        session=auth.prepareConsumerSession(req,actorId);await session.save(tx);
        account={actor_id:actorId,email,display_name:name};
      });
    }catch(cause){
      if(cause.code==='23505'||/UNIQUE constraint/i.test(String(cause.message)))throw fail(409,'account_unavailable','An account could not be created with these details.');
      throw cause;
    }
    session.setCookie(res);
    return reply(201,{actor_id:account.actor_id,csrf_token:session.csrf_token,user:publicUser(account)});
  }
  async function login({req,res,body}) {
    await auth.bootstrapActor(req);
    fields(body,['email','password'],['email','password']);
    const email=emailAddress(body.email),raw=password(body.password);
    const emailKey='login:'+digest('email:'+email);
    await throttle('login:'+ipKey(req),60);
    await throttle(emailKey,8);
    const account=await first(store,'SELECT * FROM accounts WHERE email=$1',[email]);
    const actual=await derive(raw,account?.password_salt??'00000000000000000000000000000000');
    const expected=account?Buffer.from(account.password_hash,'hex'):Buffer.alloc(64);
    const matches=actual.length===expected.length&&timingSafeEqual(actual,expected);
    if(!account||!matches)throw fail(401,'invalid_credentials','The email or password is incorrect.');
    const session=auth.prepareConsumerSession(req,account.actor_id);
    await store.transaction(async tx=>{
      await session.save(tx);
      await tx.query('DELETE FROM auth_attempts WHERE key=$1',[emailKey]);
    });
    session.setCookie(res);
    return {actor_id:account.actor_id,csrf_token:session.csrf_token,user:publicUser(account)};
  }
  async function getProfile({req}) {
    const actor=await auth.requireConsumer(req);
    const row=await first(store,'SELECT profile_json FROM profiles WHERE id=$1',[actor.actor_id]);
    return row?parseProfile(row.profile_json):reply(200,null);
  }
  async function putProfile({req,body}) {
    const actor=await auth.requireConsumer(req,{mutation:true});
    return store.transaction(async tx=>{
      await tx.query('UPDATE accounts SET updated_at=updated_at WHERE actor_id=$1',[actor.actor_id]);
      const account=await first(tx,'SELECT display_name FROM accounts WHERE actor_id=$1',[actor.actor_id]);
      const saved=await first(tx,'SELECT profile_json FROM profiles WHERE id=$1',[actor.actor_id]);
      const profile=profileFields(body,saved?parseProfile(saved.profile_json):null,account?.display_name);
      await tx.query('INSERT INTO profiles(id,profile_json,updated_at) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET profile_json=$2,updated_at=$3',[actor.actor_id,JSON.stringify(profile),now()]);
      if(account)await tx.query('UPDATE accounts SET display_name=$1,updated_at=$2 WHERE actor_id=$3',[profile.display_name,now(),actor.actor_id]);
      return profile;
    });
  }
  return {routes:[
    ['POST',/^\/api\/auth\/register$/,register],
    ['POST',/^\/api\/auth\/login$/,login],
    ['GET',/^\/api\/profile$/,getProfile],
    ['PUT',/^\/api\/profile$/,putProfile],
  ]};
}
