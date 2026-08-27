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
  assert.equal(p.skillPoints, 2);
  assert.equal(engine.CHAR_HOOKS.hisakawa_sister.publicState(p).twins.every((t) => t.alive), true);

  // เทสต์ก่อนหน้าคิวฉาก Longing ไว้ใน engine เดียวกัน จึงคืนเฟสให้ตรงกับช่วงกดสกิลปกติ
  p.skillPoints = 4;
  engine.setGameState('PLAYING');
  engine.useSkill(p.id, 'secondary');
  assert.equal(p.skillUsedRound, true);
  assert.equal(p.skillPoints, 0);
});

test('Hisakawa skill costs use the rebalanced values', () => {
  const ch = engine.CHAR_BY_ID.hisakawa_sister;
  assert.deepEqual(
    [ch.basic.cost, ch.basic2.cost, ch.ultimate.cost, ch.ultimate2.cost, ch.ultimate3.cost],
    [1, 6, 4, 6, 6],
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

test('สถานะที่ engine เขียนใส่ผู้เล่นตรงๆ ไม่ถูกซิงก์แฝดล้างทิ้ง', () => {
  const p = mkHisakawa();
  p.statuses.nodraw = 1;
  p.statuses.stagger = 1;
  p.statuses.freecast = 1;

  engine.CHAR_HOOKS.hisakawa_sister.onRoundStartTick(engine, p);
  assert.equal(p.statuses.nodraw, 1);
  assert.equal(p.statuses.stagger, 1);
  assert.equal(p.statuses.freecast, 1);

  engine.damageSoft(p); // ท่อดาเมจเรียก hisakawaSyncIn ทุกครั้ง — ต้องรีเฟรชแค่เลือด/เกราะ
  assert.equal(p.statuses.nodraw, 1);
  assert.equal(p.statuses.freecast, 1);
});

test('บัฟที่ให้ฝั่งแฝดถูกมิเรอร์ลงผู้เล่นทันที (write-through)', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  h.applyBuffToTwin(p, 'nagi', 'guard', 2, 3);
  assert.equal(p.statuses.guard, 3);
  assert.equal(p.statusAmt.guard, 2);
});

test('มาร์กถาวรของแฝดที่พักอยู่ไม่สลายไปเอง', () => {
  const p = mkHisakawa();
  const twins = p.hisakawa.twins;
  twins.hayate.statuses.mageslayerMark = 1;
  twins.hayate.statuses.deathline = 2;
  twins.hayate.statuses.weak = 2;

  engine.CHAR_HOOKS.hisakawa_sister.onEndTurnTick(engine, p);
  assert.equal(twins.hayate.statuses.mageslayerMark, 1);
  assert.equal(twins.hayate.statuses.deathline, 2);
  assert.equal(twins.hayate.statuses.weak, 1); // ดีบัฟธรรมดายังนับถอยหลังตามเดิม
});

test('จังหวะนี้แหละ: บัฟถูกใช้เฉพาะตอนได้ออกโจมตีจริง และธงไม่ค้างข้ามเทิร์น', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const dummy = { id: 'w', name: 'W', alive: true };
  engine.players[dummy.id] = dummy;
  p.hisakawa.active = 'hayate';
  h.syncIn(p);
  h.applySkill(engine, p, 'secondary', { effect: { status: 'hisakawaTempo' } });

  const val = (o) => (o.id === p.id ? 5 : 18);
  h.onAfterRoundScores(engine, [p, dummy], dummy.id, val);
  assert.equal(p.hisakawaHayateAssist, true);
  assert.equal(p.statuses.hisakawaTempo, 999); // ยังไม่ถูกตัดทิ้งตั้งแต่ตอนจอง

  // ผู้ชนะโจมตีไม่ได้ -> จบเทิร์นไปเลย: ธงต้องไม่ค้าง และบัฟต้องยังอยู่ให้ลุ้นเทิร์นหน้า
  h.onEndTurnTick(engine, p);
  assert.equal(p.hisakawaHayateAssist, false);
  assert.equal(p.hisakawa.twins.hayate.statuses.hisakawaTempo, 999);

  h.onAfterRoundScores(engine, [p, dummy], dummy.id, val);
  assert.equal(h.startHayateAssistAttack(engine, dummy), true);
  assert.equal(p.hisakawa.twins.hayate.statuses.hisakawaTempo, undefined);
  assert.equal(p.statuses.hisakawaTempo, undefined);
});

test('ฮายาเตะล้มระหว่างรอคิว -> ไม่ได้ออกโจมตีเสริม', () => {
  const p = mkHisakawa();
  const h = engine.CHAR_HOOKS.hisakawa_sister;
  const dummy = { id: 'w', name: 'W', alive: true };
  engine.players[dummy.id] = dummy;
  p.hisakawa.active = 'hayate';
  h.syncIn(p);
  h.applySkill(engine, p, 'secondary', { effect: { status: 'hisakawaTempo' } });
  h.onAfterRoundScores(engine, [p, dummy], dummy.id, (o) => (o.id === p.id ? 5 : 18));

  p.hp = 0;
  h.syncOut(p);
  assert.equal(h.tryTwinDeath(engine, p), true);
  assert.equal(p.hisakawa.active, 'nagi');
  assert.equal(h.startHayateAssistAttack(engine, dummy), false);
});

test('ดาเมจแพ้จั่วทำให้แฝดอีกคนออกมาคุมทันที ไม่รอจบเทิร์น', () => {
  const p = mkHisakawa();
  p.hp = 1;
  p.armor = 0;
  engine.CHAR_HOOKS.hisakawa_sister.syncOut(p);

  engine.damageSoft(p);
  assert.equal(p.alive, true);
  assert.equal(p.hisakawa.active, 'hayate');
  assert.equal(p.hisakawa.twins.nagi.alive, false);
  assert.equal(p.hp, 3);
});
