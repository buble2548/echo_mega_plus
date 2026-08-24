const test = require('node:test');
const assert = require('node:assert/strict');
const { CHAR_BY_ID, publicRoster, POSITION_COLORS } = require('../../characters');
const yuuki = require('../../characters/yuuki');
const { computeAttackBase, engine } = require('../../server');

test('Yuuki is a visible but non-selectable special P7 boss', () => {
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
