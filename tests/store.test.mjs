import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, createPostgresStore } from '../server/store.mjs';

test('local port persists across reopening, binds repeated parameters and rolls back failed transactions', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'wasit-store-'));
  const file = join(folder, 'test.sqlite');
  let store = await openStore({ sqliteFile: file, databaseUrl: '', production: false });
  try {
    await store.query('INSERT INTO requests(id,user_id,status) VALUES ($1,$2,$3)', ['request_port01','consumer_port01','submitted']);
    assert.equal((await store.query('SELECT id FROM requests WHERE id=$1 OR id=$1',['request_port01'])).rows.length,1);
    await assert.rejects(store.transaction(async tx => {
      await tx.query('UPDATE requests SET status=$1 WHERE id=$2',['changed','request_port01']);
      throw new Error('abort');
    }),/abort/);
    assert.equal((await store.query('SELECT status FROM requests')).rows[0].status,'submitted');
    await Promise.all(Array.from({length:4},()=>store.transaction(async tx=>{
      const row=(await tx.query('SELECT generation FROM sessions WHERE id=$1',['session_port01'])).rows[0];
      if(!row) await tx.query('INSERT INTO sessions(id,generation) VALUES ($1,$2)',['session_port01',1]);
      else await tx.query('UPDATE sessions SET generation=$1 WHERE id=$2',[row.generation+1,'session_port01']);
    })));
    assert.equal((await store.query('SELECT generation FROM sessions')).rows[0].generation,4);
    await store.close(); store=await openStore({sqliteFile:file,databaseUrl:'',production:false});
    assert.equal((await store.query('SELECT user_id FROM requests')).rows[0].user_id,'consumer_port01');
  } finally {
    await store.close();
    assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
    await rm(folder,{recursive:true,force:true});
  }
});
test('production never silently falls back to a local SQLite file', async () => {
  await assert.rejects(openStore({databaseUrl:'',production:true}), /persistent production database/i);
  await assert.rejects(openStore({databaseUrl:'https://invalid.example',production:true}), /PostgreSQL/);
});
test('PostgreSQL transactions use a single checked-out client and release after rollback', async () => {
  const calls=[];
  const client={query:async(sql)=>{calls.push(sql);return {rows:[],rowCount:0};},release:()=>calls.push('release')};
  const pool={connect:async()=>client,query:async()=>{throw new Error('pool query must not run in tx');},end:async()=>{}};
  const store=createPostgresStore(pool);
  await assert.rejects(store.transaction(async tx=>{await tx.query('SELECT 1');throw new Error('abort');}),/abort/);
  assert.deepEqual(calls,['BEGIN','SELECT 1','ROLLBACK','release']);
});
