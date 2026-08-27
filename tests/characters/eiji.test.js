const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const eiji = require('../../characters/eiji.js');
const YunaMod = require('../../characters/yuna.js');

const cutsceneFns = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  runCutsceneQueue: engine.runCutsceneQueue,
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  endTurn: engine.endTurn,
};

test.before(() => {
  engine.triggerCutscene = () => {};
  engine.queueCutscene = () => {};
  // runCutsceneQueue ตัวจริงตั้ง gameState = "CUTSCENE" แล้วรอ timer — ในเทสต์ให้เดินต่อทันที
  engine.runCutsceneQueue = (onDone) => { if (onDone) onDone(); };
  // startPhaseTimer/endTurn ถูกตัดออก ไม่งั้นการจบฉากโจมตีจะไหลต่อเข้า endTurn -> dealRound
  //  แล้ววนทั้งเทิร์นแบบซิงโครนัสจนเทสต์ค้าง (เราสนใจแค่ผลของหมัดนั้นหมัดเดียว)
  engine.startPhaseTimer = () => {};
  engine.endTurn = () => {};
  engine.broadcastState = () => {};
});

test.after(() => {
  // doAttack เรียก startPhaseTimer "ตัวในโมดูล" ไม่ใช่ engine.startPhaseTimer ที่เรา stub ไว้
  //  -> setInterval ตัวจริงถูกตั้งขึ้นและค้างอยู่ ทำให้โปรเซสเทสต์ไม่ยอมจบ ต้องเคลียร์ทิ้งเอง
  engine.clearPhaseTimer();
  Object.assign(engine, cutsceneFns);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 4, armor: 4, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, locked: false, result: null, connected: true,
  };
}

// สนามสะอาด: เอจิ 1 คน + คู่ต่อสู้ 1 คน
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  const e = mk('E', 'eiji', 1);
  const a = mk('A', 'temari', 2);
  a.hp = 7; a.armor = 3;
  engine.players.E = e;
  engine.players.A = a;
  engine.setRoundNumber(3);
  return { e, a };
}

const vitals = (p) => p.hp + p.armor;
const maxOrdinal = (e) => { for (let i = 0; i < eiji.ORDINAL_MAX; i++) eiji.pressOrdinal(engine, e); };

test('กลโกง Ordinal Scale: กด 1 ครั้ง = หลบ +20% และสละแต้มสกิล 1', () => {
  const { e } = setup();
  assert.equal(eiji.dodgeChance(e), 0);
  assert.equal(eiji.pressOrdinal(engine, e), true);
  assert.equal(eiji.dodgeChance(e), 20);
  assert.equal(e.skillPoints, 7);
});

test('กลโกง Ordinal Scale: กดได้สูงสุด 5 ครั้ง (รวม 100%) และอัตราหลบรวมไม่เกิน 100%', () => {
  const { e } = setup();
  maxOrdinal(e);
  assert.equal(eiji.dodgeChance(e), 100);
  assert.equal(eiji.pressOrdinal(engine, e), false, 'กดครั้งที่ 6 ไม่ได้');
  e.statuses.eijiSwift = 3;
  e.statuses.eijiUlt = 5;
  assert.equal(eiji.dodgeChance(e), 100, 'ซ้อนกับว่องไว/ท่าไม้ตายแล้วยังไม่เกินเพดาน');
});

test('อัตราหลบซ้อนทับได้จากทั้ง 3 แหล่ง', () => {
  const { e } = setup();
  e.statuses.eijiSwift = 3;
  assert.equal(eiji.dodgeChance(e), 10);
  e.statuses.eijiUlt = 5;
  assert.equal(eiji.dodgeChance(e), 30, 'ว่องไว + ไม่ว่ายังก็ตาม = 30%');
  eiji.pressOrdinal(engine, e);
  assert.equal(eiji.dodgeChance(e), 50, 'บวก Ordinal Scale อีก 1 ครั้ง');
});

test('หลบความเสียหายจากสกิลได้จริง (dealMixed / dealDirect) และได้แต้มสกิลคืน +2', () => {
  const { e } = setup();
  e.statuses.eijiSwift = 3;
  maxOrdinal(e); // 100% — ผลลัพธ์จึงไม่ขึ้นกับการสุ่ม
  const spBefore = e.skillPoints;
  const before = vitals(e);
  engine.dealMixed(e, 3);
  assert.equal(vitals(e), before, 'ดาเมจสกิลถูกหลบหมด');
  assert.equal(e.skillPoints, Math.min(engine.maxSkillOf(e), spBefore + 2), 'สกิลติดตัว 2: หลบสำเร็จ +2');
  assert.equal(e.eijiDodgeUsedRound, true);
});

test('หลบดาเมจทะลุเกราะ (dealDirect) ได้ด้วย', () => {
  const { e } = setup();
  maxOrdinal(e);
  const before = e.hp;
  engine.dealDirect(e, 2);
  assert.equal(e.hp, before);
});

test('โควตาหลบมีแค่ 1 ครั้งต่อเทิร์น — ก้อนที่ 2 โดนเต็ม', () => {
  const { e } = setup();
  maxOrdinal(e);
  engine.dealMixed(e, 3);
  const before = vitals(e);
  engine.dealMixed(e, 2);
  assert.equal(vitals(e), before - 2);
});

test('หลบการโจมตีปกติได้จริง และเกมไม่ค้างที่เฟส ATTACK', () => {
  const { e, a } = setup();
  maxOrdinal(e);
  engine.setGameState('ATTACK');
  engine.setAttackerId(a.id);
  const before = vitals(e);
  engine.doAttack(a.id, e.id);
  assert.equal(vitals(e), before, 'ไม่เสียเลือด/เกราะ');
  assert.equal(engine.lastAttack.dodge, true);
  assert.equal(engine.lastAttack.dmg, 0);
  assert.notEqual(engine.gameState, 'ATTACK', 'ต้องเดินต่อ ไม่ค้างรอเลือกเป้า');
});

test('ไม่มีบัฟหลบ = โดนโจมตีปกติตามปกติ (ไม่ได้หลบมั่ว)', () => {
  const { e, a } = setup();
  engine.setGameState('ATTACK');
  engine.setAttackerId(a.id);
  const before = vitals(e);
  engine.doAttack(a.id, e.id);
  assert.ok(vitals(e) < before);
});

test('ดาเมจแพ้จั่ว (damageSoft) ไม่ถูกหลบ และไม่กินโควตาหลบ', () => {
  const { e } = setup();
  maxOrdinal(e);
  const before = vitals(e);
  engine.damageSoft(e);
  assert.equal(vitals(e), before - 1);
  assert.ok(!e.eijiDodgeUsedRound);
});

test('ต้นเทิร์น: Ordinal Scale รีเซ็ต และโควตาหลบกลับมาใช้ได้', () => {
  const { e } = setup();
  maxOrdinal(e);
  engine.dealMixed(e, 1);
  eiji.onRoundStartTick(engine, e);
  assert.equal(eiji.ordinalStacks(e), 0);
  assert.equal(e.eijiDodgeUsedRound, false);
});

test('ท่าไม้ตายทำงานอยู่: ต้นเทิร์นได้แต้มสกิล +1', () => {
  const { e } = setup();
  e.statuses.eijiUlt = 5;
  e.skillPoints = 3;
  eiji.onRoundStartTick(engine, e);
  assert.equal(e.skillPoints, 4);
});

test('Longing ลงคนอื่น: บัฟถูกปิด + เอจิสวนคืนทะลุเกราะ 1 หน่วย', () => {
  const { e } = setup();
  const v = mk('V', 'temari', 3);
  engine.players.V = v;
  v.alive = false; v.hp = 0; v.armor = 3; // ตายด้วยดาเมจทะลุเกราะ -> ฟื้นมาพร้อมเกราะเดิม
  YunaMod.reviveWithLonging(engine, v);
  assert.equal(v.hp, 2, 'ฟื้น 3 แล้วโดนสวนทะลุเกราะ 1');
  assert.equal(v.armor, 3, 'เกราะไม่ถูกหมัดนี้กิน');
  assert.ok(!v.statuses.yunaLonging, 'บัฟ Longing ถูกปิด');
  assert.ok(!(v.statusAmt && v.statusAmt.yunaLonging), 'statusAmt ไม่ค้าง');
  assert.equal(engine.yunaEffect, null, 'เอฟเฟกต์สนาม + เพลงยูนะหยุด');
  assert.ok(e.alive);
});

test('Longing ลงคู่แฝดฮิซากาว่า: บัฟที่เก็บไว้บนตัวแฝดก็ต้องถูกปิดด้วย', () => {
  setup();
  const v = mk('V', 'hisakawa_sister', 3);
  engine.players.V = v;
  const twins = engine.CHAR_HOOKS.hisakawa_sister.publicState(v) && v.hisakawa.twins;
  twins.nagi.alive = false;
  twins.nagi.hp = 0;
  v.alive = false; v.hp = 0;
  YunaMod.reviveWithLonging(engine, v);
  for (const key of ['nagi', 'hayate']) {
    assert.ok(!v.hisakawa.twins[key].statuses.yunaLonging, `บัฟบนแฝด ${key} ต้องถูกล้าง`);
  }
  assert.equal(v.hisakawa.twins.nagi.hp, 2, 'แฝดที่ฟื้นโดนสวนคืน 1 หน่วย');
});

test('Longing ลงเอจิเอง: ทำงานตามปกติ ไม่สวนใส่ตัวเอง', () => {
  setup();
  const e = engine.players.E;
  e.alive = false; e.hp = 0;
  YunaMod.reviveWithLonging(engine, e);
  assert.equal(e.hp, 3, 'ไม่โดนสวนคืน');
  assert.equal(e.statuses.yunaLonging, 5, 'บัฟยังอยู่');
});
