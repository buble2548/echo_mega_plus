const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../server.js');

function mkHisakawa() {
  const p = {
    id: 'hisakawa', name: 'คู่แฝด', position: 1, characterId: 'hisakawa_sister',
    alive: true, connected: true, hp: 3, armor: 2, shield: 0, tempHp: 0,
    skillPoints: 8, skillUsedRound: false, gold: 0, inventory: [], cards: [], locked: false, busted: false,
    result: null, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 },
    dmgHp: 0, dmgArmor: 0,
  };
  engine.CHAR_HOOKS.hisakawa_sister.init(p);
  engine.players[p.id] = p;
  return p;
}

test.beforeEach(() => {
  for (const key of Object.keys(engine.players)) delete engine.players[key];
  engine.clearPhaseTimer();
  engine.setRoundNumber(1);
});

test.afterEach(() => engine.clearPhaseTimer());

test('one large hit triggers Longing for the fallen twin without damaging the other twin', () => {
  const p = mkHisakawa();
  p.hp = 1;
  p.armor = 0;
  engine.CHAR_HOOKS.hisakawa_sister.syncOut(p);

  engine.dealMixed(p, 5, true);

  const state = engine.CHAR_HOOKS.hisakawa_sister.publicState(p);
  const nagi = state.twins.find((t) => t.key === 'nagi');
  const hayate = state.twins.find((t) => t.key === 'hayate');
  assert.equal(state.active, 'hayate');
  assert.equal(nagi.alive, true);
  assert.equal(nagi.hp, 3);
  assert.equal(nagi.armor, 0);
  assert.equal(nagi.statuses.yunaLonging, 5);
  assert.equal(hayate.alive, true);
  assert.equal(hayate.hp, 3);
  assert.equal(hayate.armor, 2);
  assert.equal(p.alive, true);
});

test('reviving a twin does not consume the regular once-per-turn skill action', () => {
  const p = mkHisakawa();
  p.hp = 0;
  engine.CHAR_HOOKS.hisakawa_sister.syncOut(p);
  assert.equal(engine.CHAR_HOOKS.hisakawa_sister.tryTwinDeath(engine, p), true);
  p.skillPoints = 8;
  engine.setGameState('PLAYING');

  engine.useSkill(p.id, 'basic');
  assert.equal(p.skillUsedRound, false);
  assert.equal(p.skillPoints, 4);
  assert.equal(engine.CHAR_HOOKS.hisakawa_sister.publicState(p).twins.every((t) => t.alive), true);

  // เทสต์ก่อนหน้าคิวฉาก Longing ไว้ใน engine เดียวกัน จึงคืนเฟสให้ตรงกับช่วงกดสกิลปกติ
  engine.setGameState('PLAYING');
  engine.useSkill(p.id, 'secondary');
  assert.equal(p.skillUsedRound, true);
  assert.equal(p.skillPoints, 0);
});

test('Hisakawa skill costs use the rebalanced values', () => {
  const ch = engine.CHAR_BY_ID.hisakawa_sister;
  assert.deepEqual(
    [ch.basic.cost, ch.basic2.cost, ch.ultimate.cost, ch.ultimate2.cost, ch.ultimate3.cost],
    [1, 4, 4, 6, 6],
  );
});

test('switching twins does not consume the regular once-per-turn skill action', () => {
  const p = mkHisakawa();
  p.skillPoints = 5;
  engine.setGameState('PLAYING');

  engine.useSkill(p.id, 'basic');
  assert.equal(p.skillUsedRound, false);
  assert.equal(p.skillPoints, 6);
  assert.equal(engine.CHAR_HOOKS.hisakawa_sister.publicState(p).active, 'hayate');

  engine.useSkill(p.id, 'secondary');
  assert.equal(p.skillUsedRound, true);
  assert.equal(p.skillPoints, 2);
  assert.equal(p.statuses.hisakawaTempo, 999);
});
