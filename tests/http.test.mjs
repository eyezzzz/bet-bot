import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
const hx = bytes => Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
test('PING autenticado e assinatura adulterada rejeitada',async()=>{
  const keyPair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const key=hx(await crypto.subtle.exportKey('raw',keyPair.publicKey));
  const timestamp=String(Math.floor(Date.now()/1000));
  const body=JSON.stringify({type:1});
  const signature=hx(await crypto.subtle.sign('Ed25519',keyPair.privateKey,new TextEncoder().encode(timestamp+body)));
  const makeRequest = payload => new Request('https://bot.example/interactions',{method:'POST',headers:{'x-signature-ed25519':signature,'x-signature-timestamp':timestamp},body:payload});
  const env={DISCORD_PUBLIC_KEY:key,DB:{}};
  const ok=await worker.fetch(makeRequest(body),env);
  assert.equal(ok.status,200);
  assert.deepEqual(await ok.json(),{type:1});
  const denied=await worker.fetch(makeRequest(JSON.stringify({type:2})),env);
  assert.equal(denied.status,401);
});
test('health não expõe token',async()=>{
  const res=await worker.fetch(new Request('https://bot.example/'),{DB:{}});
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.online,true);
  assert.equal(body.discordConfigured,false);
});
