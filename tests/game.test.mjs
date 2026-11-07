import {test} from 'node:test';
import assert from 'node:assert/strict';
import {score,createGame,action,settle,stats,gameMessage} from '../src/index.mjs';
test('Ás conta 1 ou 11',()=>{
  assert.deepEqual(score(['A♠','6♥']),{total:17,soft:true});
  assert.deepEqual(score(['A♠','6♥','9♠']),{total:16,soft:false});
  assert.equal(score(['A♠','A♥','9♠']).total,21);
});
test('baralho, apostas e saída',()=>{
  for(let k=0;k<50;k++){
    let g=createGame(100,'channel');
    assert.equal(g.hands.length,1);
    assert.equal(g.dealer.length,2);
    while(!g.finished) action(g,'stand');
    let s=stats(g);
    assert.ok(s.paid>=0);
    assert.ok(Number.isInteger(s.paid));
    assert.equal(s.wagered,100);
    assert.ok(s.wins+s.losses+s.pushes===1);
    assert.ok(gameMessage(g,1000,'123').components.length===0);
  }
});
test('resultado é idempotente',()=>{
  const g=createGame(100,'test');
  if(!g.finished) {action(g,'stand');const saved=JSON.stringify(g.result);settle(g);assert.equal(JSON.stringify(g.result),saved);}
});
test('blackjack natural paga 3:2',()=>{
  const g=createGame(100,'test');
  Object.assign(g,{finished:false,deck:['3♠','4♠'],dealer:['10♠','6♥'],hands:[{cards:['A♠','K♥'],bet:100,split:false,done:false}]});
  settle(g);
  assert.equal(g.result[0].outcome,'blackjack');
  assert.equal(g.result[0].credit,250);
  assert.equal(stats(g).net,150);
});
test('split de ases compra uma carta por mão e conclui',()=>{
  const g=createGame(100,'test');
  Object.assign(g,{finished:false,result:[],deck:['8♠','9♥'],dealer:['10♠','7♥'],hands:[{cards:['A♠','A♥'],bet:100,split:false,done:false}],current:0});
  const extra=action(g,'split');
  assert.equal(extra,100);
  assert.equal(g.hands.length,2);
  assert.equal(g.hands[0].cards.length,2);
  assert.equal(g.hands[1].cards.length,2);
  assert.ok(g.finished);
  assert.equal(stats(g).wagered,200);
});
test('dealer para no soft 17',()=>{
  const g=createGame(100,'test');
  Object.assign(g,{finished:false,result:[],deck:['2♠','3♠'],dealer:['A♠','6♥'],hands:[{cards:['10♠','8♥'],bet:100,split:false,done:false}]});
  settle(g);
  assert.equal(g.dealer.length,2);
  assert.equal(g.result[0].credit,200);
});
