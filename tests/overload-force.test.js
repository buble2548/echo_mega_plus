const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

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

test('Overload Force deducts 2 HP on every fifth extra card', () => {
  const p = {
    id: 'overdraw', name: 'Overdraw', characterId: 'kai', alive: true,
    hp: 7, armor: 2, tempHp: 0, dmgHp: 0, cards: [],
    statuses: {}, statusAmt: {}, colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 },
    overloadDrawReady: true, overloadExtraDraws: 0,
  };
  engine.players[p.id] = p;
  engine.setOverloadForceActive(true);

  for (let i = 0; i < 4; i++) engine.onCardDrawn(p, { value: 1, color: 'red' });
  assert.equal(p.hp, 7);
  engine.onCardDrawn(p, { value: 1, color: 'red' });
  assert.equal(p.hp, 5);
  assert.equal(p.armor, 2, 'penalty bypasses armor and deducts HP');

  for (let i = 0; i < 5; i++) engine.onCardDrawn(p, { value: 1, color: 'green' });
  assert.equal(p.hp, 3);
  assert.equal(p.overloadExtraDraws, 10);
});

