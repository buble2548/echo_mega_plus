const test = require('node:test');
const assert = require('node:assert/strict');
const hisakawa = require('../../characters/hisakawa_sister.js');

function mkEngine(over = {}) {
  const logs = [];
  return Object.assign({
    roundNumber: 1,
    log: (msg) => logs.push(msg),
    logs,
    applyDebuff(target, key, amount, turns) {
      target.statuses[key] = turns;
      if (amount != null) target.statusAmt[key] = amount;
      return true;
    },
    dealMixed(target, n) {
      for (let i = 0; i < n; i++) {
        if (target.armor > 0) target.armor--;
        else target.hp--;
      }
    },
    nextTransformCounter() { return 1; },
    queueCutscene(player, key) { player.cutscene = key; },
    alivePlayers() { return []; },
    attackableTargets() { return []; },
    setAttackerId(id) { this.attackerId = id; },
  }, over);
}

function mkPlayer(over = {}) {
  const p = Object.assign({
    id: 'p1', name: 'Hisakawa', alive: true, characterId: 'hisakawa_sister',
    hp: 3, armor: 2, statuses: {}, statusAmt: {}, skillPoints: 8,
  }, over);
  hisakawa.init(p);
  return p;
}

const ch = {
  basic: { name: 'switch', effect: { status: 'hisakawaSwitch' } },
  basic2: { name: 'revive', effect: { status: 'hisakawaRevive' } },
  secondary: { name: 'nagi sec', effect: { status: 'hisakawaLimit' } },
  secondary2: { name: 'hayate sec', effect: { status: 'hisakawaTempo' } },
  ultimate: { name: 'stage', effect: { status: 'hisakawaStage' } },
  ultimate2: { name: 'talent', effect: { status: 'hisakawaTalent' } },
  ultimate3: { name: 'dream', effect: { status: 'hisakawaDream' } },
};

test('init exposes Nagi as active twin in one player slot', () => {
  const p = mkPlayer();
  assert.equal(p.hp, 3);
  assert.equal(p.armor, 2);
  assert.equal(hisakawa.publicState(p).twins.length, 2);
  assert.equal(hisakawa.publicState(p).active, 'nagi');
});

test('switch heals outgoing twin and moves control to the other twin', () => {
  const engine = mkEngine();
  const p = mkPlayer({ hp: 1, armor: 0 });
  hisakawa.syncOut(p);
  hisakawa.applySkill(engine, p, 'basic', ch.basic);
  const state = hisakawa.publicState(p);
  const nagi = state.twins.find((t) => t.key === 'nagi');
  assert.equal(state.active, 'hayate');
  assert.equal(nagi.hp, 3);
  assert.equal(p.hp, 3);
  assert.equal(p.armor, 2);
});

test('dynamic basic changes to revive after one twin is dead', () => {
  const p = mkPlayer();
  p.hp = 0;
  assert.equal(hisakawa.tryTwinDeath(mkEngine(), p), true);
  assert.equal(hisakawa.dynamicSkillFor(p, ch, 'basic').name, 'revive');
});

test('revive brings the fallen twin back with 3 hp and 0 armor', () => {
  const engine = mkEngine();
  const p = mkPlayer();
  p.hp = 0;
  hisakawa.tryTwinDeath(engine, p);
  hisakawa.applySkill(engine, p, 'basic', ch.basic2);
  const nagi = hisakawa.publicState(p).twins.find((t) => t.key === 'nagi');
  assert.equal(nagi.alive, true);
  assert.equal(nagi.hp, 3);
  assert.equal(nagi.armor, 0);
});

test('dream ultimate becomes available only when stage and talent are both active', () => {
  const p = mkPlayer();
  hisakawa.activeTwin(p).statuses.hisakawaStage = 5;
  assert.equal(hisakawa.dynamicSkillFor(p, ch, 'ultimate').name, 'stage');
  hisakawa.activeTwin(p).statuses.hisakawaTalent = 5;
  assert.equal(hisakawa.dynamicSkillFor(p, ch, 'ultimate').name, 'dream');
});

test('first twin death swaps control, second twin death eliminates the player', () => {
  const engine = mkEngine();
  const p = mkPlayer();
  p.hp = 0;
  assert.equal(hisakawa.tryTwinDeath(engine, p), true);
  assert.equal(p.alive, true);
  p.hp = 0;
  assert.equal(hisakawa.tryTwinDeath(engine, p), false);
});