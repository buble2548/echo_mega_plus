const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, resetOverloadDrawCounter } = require('../server.js');

test.afterEach(() => {
  engine.setOverloadForceActive(false);
  for (const id of Object.keys(engine.players)) delete engine.players[id];
});

test('Overload Force makes Joker a fixed +12 and removes score/bust caps', () => {
  const cards = [{ value: 10, color: 'red' }, { value: 5, color: 'blue' }, { special: 'joker' }];
  const p = { cards, cardBonus: 0, statuses: {} };

  assert.equal(engine.calculateScore(cards), 21);
  engine.setOverloadForceActive(true);
  assert.equal(engine.calculateScore(cards), 27);
  assert.equal(engine.scoreOf(p), 27);
  assert.equal(engine.bustedOf(p), false);
  assert.equal(engine.scoreCap(p), Infinity);
});

test('Overload Force counts only draws after score exceeds 21 and deducts 1 HP on every fifth such draw', () => {
  const p = {
    id: 'overdraw', name: 'Overdraw', characterId: 'kai', alive: true,
    hp: 7, armor: 2, tempHp: 0, dmgHp: 0, cards: [{ value: 10 }, { value: 10 }],
    statuses: {}, statusAmt: {}, colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 },
    overloadDrawReady: true, overloadExtraDraws: 0,
  };
  engine.players[p.id] = p;
  engine.setOverloadForceActive(true);

  const draw = (card) => { p.cards.push(card); engine.onCardDrawn(p, card); };
  draw({ value: 1, color: 'blue' });
  assert.equal(p.overloadExtraDraws, 0, 'a draw that leaves the score at 21 is not an excess draw');

  for (let i = 0; i < 4; i++) draw({ value: 1, color: 'red' });
  assert.equal(p.hp, 7);
  draw({ value: 1, color: 'red' });
  assert.equal(p.hp, 6);
  assert.equal(p.armor, 2, 'penalty bypasses armor and deducts HP');

  for (let i = 0; i < 5; i++) draw({ value: 1, color: 'green' });
  assert.equal(p.hp, 5);
  assert.equal(p.overloadExtraDraws, 10);
});

test('Overload Force excess-draw counter resets for the next turn', () => {
  const p = {
    id: 'overdraw-reset', name: 'Overdraw Reset', characterId: 'kai', alive: true,
    hp: 7, armor: 2, tempHp: 0, dmgHp: 0, cards: [{ value: 10 }, { value: 10 }, { value: 2 }],
    statuses: {}, statusAmt: {}, colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 },
    overloadDrawReady: true, overloadExtraDraws: 4,
  };
  engine.players[p.id] = p;
  engine.setOverloadForceActive(true);

  p.cards = [{ value: 10 }, { value: 10 }];
  resetOverloadDrawCounter(p, true);
  p.cards.push({ value: 1, color: 'blue' });
  engine.onCardDrawn(p, p.cards.at(-1));

  assert.equal(p.overloadExtraDraws, 0);
  assert.equal(p.hp, 7);
});

