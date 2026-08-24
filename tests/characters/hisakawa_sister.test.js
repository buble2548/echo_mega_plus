const test = require('node:test');
const assert = require('node:assert/strict');
const hisakawa = require('../../characters/hisakawa_sister.js');
const yuna = require('../../characters/yuna.js');

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
    addSkill(player, amount) {
      player.skillPoints = Math.min(8, player.skillPoints + amount);
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
  const p = mkPlayer();
  p.hp = 1;
  p.armor = 0;
  p.skillPoints = 4;
  hisakawa.syncOut(p);
  hisakawa.applySkill(engine, p, 'basic', ch.basic);
  const state = hisakawa.publicState(p);
  const nagi = state.twins.find((t) => t.key === 'nagi');
  assert.equal(state.active, 'hayate');
  assert.equal(nagi.hp, 3);
  assert.equal(p.hp, 3);
  assert.equal(p.armor, 2);
  assert.equal(p.skillPoints, 6);
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

test('first twin death still swaps after syncOut has marked active twin dead', () => {
  const engine = mkEngine();
  const p = mkPlayer({ hp: 1, armor: 0 });
  p.hp = 0;
  hisakawa.syncOut(p);

  assert.equal(hisakawa.tryTwinDeath(engine, p), true);
  const state = hisakawa.publicState(p);
  const nagi = state.twins.find((t) => t.key === 'nagi');
  const hayate = state.twins.find((t) => t.key === 'hayate');
  assert.equal(state.active, 'hayate');
  assert.equal(nagi.alive, false);
  assert.equal(hayate.alive, true);
  assert.equal(p.alive, true);
  assert.equal(p.hp, 3);
  assert.equal(p.armor, 2);
});

test('ultimate buffs keep their remaining duration and continue ticking after one twin falls', () => {
  const engine = mkEngine();
  const p = mkPlayer({ hp: 1, armor: 0 });
  hisakawa.applySkill(engine, p, 'ultimate', ch.ultimate);
  hisakawa.applySkill(engine, p, 'ultimate', ch.ultimate2);
  p.hp = 0;
  hisakawa.syncOut(p);
  assert.equal(hisakawa.tryTwinDeath(engine, p), true);

  const active = hisakawa.activeTwin(p);
  assert.equal(active.key, 'hayate');
  assert.equal(active.statuses.hisakawaStage, 5);
  assert.equal(active.statuses.hisakawaTalent, 5);
  assert.equal(hisakawa.dynamicSkillFor(p, ch, 'ultimate').name, 'dream');
  assert.equal(hisakawa.canUseSkill(engine, p, 'ultimate', ch.ultimate3), true);

  // จำลอง end-turn ของ server: ตัวที่คุมอยู่ลดผ่าน p.statuses ส่วนแฝดที่ล้ม
  // ลดบัฟคู่ผ่าน hook เพื่อให้ระยะเวลาของทั้งสองฝั่งตรงกันเสมอ
  for (let remaining = 4; remaining >= 0; remaining--) {
    for (const key of ['hisakawaStage', 'hisakawaTalent']) {
      p.statuses[key]--;
      if (p.statuses[key] <= 0) delete p.statuses[key];
    }
    hisakawa.syncOut(p);
    hisakawa.onEndTurnTick(engine, p);
    const state = hisakawa.publicState(p);
    for (const twin of state.twins) {
      assert.equal(twin.statuses.hisakawaStage || 0, remaining);
      assert.equal(twin.statuses.hisakawaTalent || 0, remaining);
    }
  }

  assert.equal(hisakawa.dynamicSkillFor(p, ch, 'ultimate').name, ch.ultimate2.name);
  assert.equal(hisakawa.canUseSkill(engine, p, 'ultimate', ch.ultimate3), false);
});

test('init always resets both twins for a new match', () => {
  const p = mkPlayer();
  p.hp = 0;
  hisakawa.syncOut(p);
  hisakawa.tryTwinDeath(mkEngine(), p);

  hisakawa.init(p);
  const state = hisakawa.publicState(p);
  assert.equal(state.active, 'nagi');
  assert.deepEqual(state.twins.map((t) => [t.alive, t.hp, t.armor]), [[true, 3, 2], [true, 3, 2]]);
});

test('Longing revives the first fallen twin and applies its buff to that twin', () => {
  const p = mkPlayer();
  const engine = mkEngine({
    CHAR_HOOKS: { hisakawa_sister: hisakawa },
    setYunaTrigger(data) { this.yuna = data; },
    pushCutsceneRaw(entry) { this.cutscene = entry; },
  });

  p.hp = 0;
  hisakawa.syncOut(p);
  assert.equal(hisakawa.tryTwinDeath(engine, p), true);
  assert.equal(p.alive, true);
  yuna.reviveWithLonging(engine, p);

  const state = hisakawa.publicState(p);
  assert.equal(p.alive, true);
  assert.equal(state.active, 'hayate');
  assert.equal(state.twins.filter((t) => t.alive).length, 2);
  const nagi = state.twins.find((t) => t.key === 'nagi');
  assert.equal(nagi.hp, 3);
  assert.equal(nagi.armor, 0);
  assert.equal(nagi.statuses.yunaLonging, 5);
});
