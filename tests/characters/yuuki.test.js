const test = require('node:test');
const assert = require('node:assert/strict');
const { CHAR_BY_ID, publicRoster, POSITION_COLORS } = require('../../characters');
const yuuki = require('../../characters/yuuki');
const {
  computeAttackBase,
  engine,
  maxHpOf,
  maxArmorOf,
  yuukiStatsForPlayerCount,
  yuukiCanSafelyDraw,
  autoPlayYuuki,
} = require('../../server');

test('Yuuki is a visible but non-selectable special boss', () => {
  const boss = publicRoster().find((c) => c.id === 'yuuki');
  assert.ok(boss);
  assert.equal(boss.difficulty, 'special');
  assert.equal(boss.locked, true);
  assert.equal(boss.hidden, false);
  assert.equal(CHAR_BY_ID.yuuki.img, '/characters/yuuki/yuuki.jpg');
  assert.ok(POSITION_COLORS[7]);
});

test('Yuuki normal attack base is 2', () => {
  assert.equal(yuuki.attackBaseOverride(), 2);
});

test('Hero Sword adds 2 to a normal attack while active', () => {
  const attacker = { id: 'hero', characterId: 'tohno', alive: true, statuses: { heroSword: 2 }, statusAmt: {}, appleAtkBuffs: [] };
  const target = { id: 'target', characterId: 'nanaya', alive: true, statuses: {}, statusAmt: {} };
  engine.players[attacker.id] = attacker;
  engine.players[target.id] = target;
  assert.equal(computeAttackBase(engine, attacker, target).base, 3);
  delete engine.players[attacker.id];
  delete engine.players[target.id];
});

test('Star of Fall describes its heal and low-HP damage upgrade', () => {
  assert.match(CHAR_BY_ID.yuuki.ultimate.desc, /ฟื้นพลังชีวิต 3/);
  assert.match(CHAR_BY_ID.yuuki.ultimate.desc, /6 หน่วย/);
});

test('Yuuki scales HP and armor with the number of human players', () => {
  const expected = [
    { players: 1, hp: 7, armor: 3 },
    { players: 2, hp: 13, armor: 2 },
    { players: 3, hp: 17, armor: 3 },
    { players: 4, hp: 23, armor: 2 },
    { players: 5, hp: 26, armor: 4 },
    { players: 6, hp: 30, armor: 5 },
  ];
  assert.deepEqual(expected.map((_, i) => yuukiStatsForPlayerCount(i + 1)), expected);
  for (const stats of expected) {
    const boss = { id: '__yuuki_boss__', characterId: 'yuuki', yuukiBaseHp: stats.hp, yuukiBaseArmor: stats.armor, statuses: {}, statusAmt: {} };
    assert.equal(maxHpOf(boss), stats.hp);
    assert.equal(maxArmorOf(boss), stats.armor);
  }
});

test('Yuuki remembers the last damage source and awards Hero Sword on delayed death resolution', () => {
  const attacker = { id: 'yuuki-killer', name: 'Hero', alive: true, characterId: 'tohno', inventory: [], statuses: {}, statusAmt: {} };
  const boss = {
    id: '__yuuki_boss__', name: 'Yuuki', alive: true, characterId: 'yuuki', hp: 1, armor: 0,
    cards: [], locked: false, inventory: [], statuses: {}, statusAmt: {}, dmgHp: 0, dmgArmor: 0,
  };
  engine.players[attacker.id] = attacker;
  engine.players[boss.id] = boss;
  engine.withEffectSource(attacker, () => engine.loseHp(boss));
  assert.equal(boss.lastDamageSourceId, attacker.id);
  engine.instantDeath(boss);
  assert.ok(attacker.inventory.some((item) => item.type === 'heroSword'));
  delete engine.players[attacker.id];
  delete engine.players[boss.id];
});

test('Yuuki reads every human score but draws at most two cards during finalization', () => {
  const boss = {
    id: '__yuuki_boss__', name: 'Yuuki', alive: true, characterId: 'yuuki', hp: 7, armor: 3,
    cards: [{ value: 5, color: 'red' }], locked: false, overloadDrawReady: true, overloadExtraDraws: 0,
    inventory: [], statuses: {}, statusAmt: {}, colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, dmgHp: 0, dmgArmor: 0,
  };
  const human = {
    id: 'leader', name: 'Leader', alive: true, characterId: 'tohno',
    cards: [{ value: 10 }, { value: 10 }, { value: 10 }], locked: true, statuses: {}, statusAmt: {},
  };
  engine.players[boss.id] = boss;
  engine.players[human.id] = human;
  engine.setOverloadForceActive(true);
  engine.setCentralDeck([{ value: 10, color: 'blue' }, { value: 10, color: 'green' }, { value: 10, color: 'yellow' }]);
  const originalRandom = Math.random;
  Math.random = () => 0;
  let drawn;
  try { drawn = autoPlayYuuki(); } finally { Math.random = originalRandom; }
  assert.equal(boss.locked, true);
  assert.equal(drawn, 2);
  assert.equal(boss.cards.length, 3);
  assert.ok(engine.calculateScore(boss.cards) < engine.calculateScore(human.cards));
  delete engine.players[boss.id];
  delete engine.players[human.id];
  engine.setCentralDeck([]);
  engine.setOverloadForceActive(false);
});

test('Yuuki reacts after each human action without locking early or waiting for the deck to empty', () => {
  const boss = {
    id: '__yuuki_boss__', name: 'Yuuki', alive: true, characterId: 'yuuki', hp: 7, armor: 3,
    cards: [{ value: 5, color: 'red' }], locked: false, overloadDrawReady: true, overloadExtraDraws: 0,
    inventory: [], statuses: {}, statusAmt: {}, colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, dmgHp: 0, dmgArmor: 0,
  };
  const human = {
    id: 'live-leader', name: 'Live Leader', alive: true, characterId: 'tohno',
    cards: [{ value: 10 }], locked: false, statuses: {}, statusAmt: {},
  };
  engine.players[boss.id] = boss;
  engine.players[human.id] = human;
  engine.setOverloadForceActive(true);
  engine.setCentralDeck([{ value: 6, color: 'blue' }, { value: 10, color: 'green' }]);
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    autoPlayYuuki(false);
    assert.equal(engine.calculateScore(boss.cards), 11);
    assert.equal(boss.locked, false, 'reactive draw must keep Yuuki available for later human draws');

    human.cards.push({ value: 10 });
    autoPlayYuuki(false);
    assert.equal(engine.calculateScore(boss.cards), 21);
    assert.equal(boss.locked, false);

    autoPlayYuuki(true);
    assert.equal(boss.locked, true);
  } finally {
    Math.random = originalRandom;
    delete engine.players[boss.id];
    delete engine.players[human.id];
    engine.setCentralDeck([]);
    engine.setOverloadForceActive(false);
  }
});

test('Yuuki can always draw because the Overload HP penalty does not apply to the boss', () => {
  engine.setOverloadForceActive(true);
  assert.equal(yuukiCanSafelyDraw({ id: '__yuuki_boss__', hp: 1, overloadExtraDraws: 4 }), true);
  assert.equal(yuukiCanSafelyDraw({ hp: 2, overloadExtraDraws: 4 }), true);
  assert.equal(yuukiCanSafelyDraw({ hp: 1, overloadExtraDraws: 4 }), false);
  assert.equal(yuukiCanSafelyDraw({ hp: 1, overloadExtraDraws: 3 }), true);
  engine.setOverloadForceActive(false);
});

test('Yuuki takes no HP damage from every fifth excess Overload draw', () => {
  const boss = {
    id: '__yuuki_boss__', name: 'Yuuki', alive: true, characterId: 'yuuki', hp: 7, armor: 3,
    cards: [{ value: 10 }, { value: 10 }, { value: 2 }], overloadDrawReady: true, overloadExtraDraws: 4,
    statuses: {}, statusAmt: {}, colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, dmgHp: 0, dmgArmor: 0,
  };
  engine.players[boss.id] = boss;
  engine.setOverloadForceActive(true);
  const card = { value: 1, color: 'red' };
  boss.cards.push(card);
  engine.onCardDrawn(boss, card);
  assert.equal(boss.hp, 7);
  assert.equal(boss.overloadExtraDraws, 4);
  delete engine.players[boss.id];
  engine.setOverloadForceActive(false);
});
