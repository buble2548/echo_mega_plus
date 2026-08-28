const test = require('node:test');
const assert = require('node:assert/strict');
const { engine } = require('../../server.js');
const byleth = require('../../characters/byleth.js');

const saved = {
  startPhaseTimer: engine.startPhaseTimer,
  broadcastState: engine.broadcastState,
  endTurn: engine.endTurn,
  skillFlash: engine.skillFlash,
  triggerCutscene: engine.triggerCutscene,
};

test.before(() => {
  engine.startPhaseTimer = () => {};
  engine.broadcastState = () => {};
  engine.endTurn = () => {};
  engine.skillFlash = () => {};
  engine.triggerCutscene = () => {};
});

test.after(() => {
  engine.clearPhaseTimer();
  Object.assign(engine, saved);
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, armor: 3, shield: 0, statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], cardBonus: 0, skillPoints: 8, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
  };
}

// สนามสะอาด: ไบเลธ 1 คน + คู่ต่อสู้ 1 คน
function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  const b = mk('B', 'byleth', 1);
  const a = mk('A', 'temari', 2);
  byleth.resetCombat(b);
  engine.players.B = b;
  engine.players.A = a;
  engine.setRoundNumber(3);
  return { b, a };
}

// ครอบ Math.random ให้คืนค่าที่กำหนดตามลำดับ
function withRandom(values, fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => (i < values.length ? values[i++] : 0.999);
  try { return fn(); } finally { Math.random = real; }
}

test('ภูมิปัญญา: ความรู้เพิ่มได้ไม่เกินเพดาน 20', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 25);
  assert.equal(byleth.knowledgeOf(b), 20);
  byleth.addKnowledge(b, -30);
  assert.equal(byleth.knowledgeOf(b), 0);
});

test('ทบทวนบทเรียน: ได้ความรู้ +1 และตั้งผล "ศึกษาเพิ่ม"/"พักผ่อน" ตามการสุ่ม', () => {
  const { b } = setup();
  withRandom([0.1], () => byleth.applyInstantSkill(engine, b, 'basic'));
  assert.equal(byleth.knowledgeOf(b), 1);
  assert.equal(b.bylethNextDraw, 'study');
  withRandom([0.9], () => byleth.applyInstantSkill(engine, b, 'basic'));
  assert.equal(byleth.knowledgeOf(b), 2);
  assert.equal(b.bylethNextDraw, 'rest');
  assert.equal(b.bylethSkillUsesRound, 2); // โควตา 5 ครั้งต่อเทิร์นเดินตามจำนวนที่กด
});

test('พักผ่อน: ไพ่ใบถัดไปถูกนำไปลบออกจากแต้มแทนที่จะบวก (ตัวอย่างในสเปค 15 -> 9)', () => {
  const { b } = setup();
  b.cards = [{ value: 8, color: 'red' }, { value: 7, color: 'blue' }]; // แต้มปัจจุบัน 15
  assert.equal(engine.scoreOf(b), 15);
  withRandom([0.9], () => byleth.applyInstantSkill(engine, b, 'basic')); // พักผ่อน
  const card = { value: 6, color: 'green' };
  b.cards.push(card);
  byleth.onCardDraw(engine, b, card);
  assert.equal(engine.scoreOf(b), 9); // 15 + 6 - 12 = 9
  assert.equal(b.bylethNextDraw, null); // ใช้ผลไปแล้ว
});

test('ศึกษาเพิ่ม: ไพ่ใบถัดไปบวกตามปกติ พร้อมฟื้นพลังชีวิต 1 หน่วย', () => {
  const { b } = setup();
  b.hp = 4;
  b.cards = [{ value: 8, color: 'red' }];
  withRandom([0.1], () => byleth.applyInstantSkill(engine, b, 'basic')); // ศึกษาเพิ่ม
  const card = { value: 7, color: 'blue' };
  b.cards.push(card);
  byleth.onCardDraw(engine, b, card);
  assert.equal(engine.scoreOf(b), 15);
  assert.equal(b.hp, 5);
});

test('การ์ดพิเศษไม่กินผลที่รออยู่ (ยังค้างไว้ให้ไพ่ใบถัดไป)', () => {
  const { b } = setup();
  withRandom([0.9], () => byleth.applyInstantSkill(engine, b, 'basic'));
  byleth.onCardDraw(engine, b, { special: 'king' });
  assert.equal(b.bylethNextDraw, 'rest');
});

test('ดาบต้องสาป: แบบฟาดทันทีลดความรู้ 4 และสร้างความเสียหาย 2 (1 ครั้ง/เทิร์น)', () => {
  const { b, a } = setup();
  byleth.addKnowledge(b, 8);
  assert.equal(byleth.canUseSkill(engine, b, 'secondary', 'strike'), true);
  byleth.applyInstantSkill(engine, b, 'secondary', 'strike', a);
  assert.equal(byleth.knowledgeOf(b), 4);
  assert.equal(a.armor, 1); // ดาเมจ 2 หน่วยกินเกราะก่อน
  assert.equal(byleth.canUseSkill(engine, b, 'secondary', 'strike'), false); // ครบโควตาของเทิร์นแล้ว
});

test('ดาบต้องสาป: แบบเสริมพลัง +2 ใช้ได้ครั้งเดียว แล้วสลายหลังโจมตี', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 4);
  byleth.applyInstantSkill(engine, b, 'secondary', 'buff');
  assert.equal(b.statuses.bylethSword, 3);
  assert.equal(byleth.damageBonus(engine, b), 2);
  assert.equal(byleth.attackSound(b), 'byleth_hit');
  assert.equal(byleth.canUseSkill(engine, b, 'secondary', 'buff'), false); // ดาบยังอยู่ กดซ้ำไม่ได้
  assert.equal(byleth.onAttackLanded(engine, b), 2);
  assert.equal(b.statuses.bylethSword, undefined);
  assert.equal(byleth.damageBonus(engine, b), 0);
});

test('ความรู้ไม่ถึง 4 = กดสกิลรอง/ท่าไม้ตายไม่ได้', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 3);
  assert.equal(byleth.canUseSkill(engine, b, 'secondary', 'buff'), false);
  assert.equal(byleth.canUseSkill(engine, b, 'ultimate', 'normal'), false);
  byleth.addKnowledge(b, 1);
  assert.equal(byleth.canUseSkill(engine, b, 'ultimate', 'normal'), true);
});

test('หลักสูตรการสอน: เปิด/สลับ/ปิด + ระหว่างเปิดกดสกิลพื้นฐานไม่ได้', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'normal');
  assert.equal(b.bylethCourse, 'normal');
  assert.equal(byleth.canUseSkill(engine, b, 'basic'), false);
  assert.equal(byleth.canUseSkill(engine, b, 'ultimate', 'normal'), false); // หลักสูตรเดิม
  assert.equal(byleth.canUseSkill(engine, b, 'ultimate', 'end'), true);     // สลับได้
  byleth.applyInstantSkill(engine, b, 'ultimate', 'off');
  assert.equal(b.bylethCourse, null);
  assert.equal(byleth.canUseSkill(engine, b, 'basic'), true);
});

test('หลักสูตรกินความรู้เทิร์นละ 1 และปิดตัวเองเมื่อความรู้หมด', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 5);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'ex');
  byleth.onRoundStartTick(engine, b);
  assert.equal(byleth.knowledgeOf(b), 4);
  assert.equal(b.bylethCourse, 'ex');
  assert.equal(b.bylethSkillUsesRound, 0); // โควตาสกิลเต็มใหม่ทุกเทิร์น
  for (let i = 0; i < 4; i++) byleth.onRoundStartTick(engine, b);
  assert.equal(byleth.knowledgeOf(b), 0);
  assert.equal(b.bylethCourse, null); // ความรู้หมด = ปิดเอง
});

test('หลักสูตร มาตราฐาน: ผู้ชนะติดสตั้นเทิร์นหน้า (ยกเว้นไบเลธ) และผู้แพ้ได้แต้มสกิลเพิ่ม', () => {
  const { b, a } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'normal');

  byleth.onRoundWinner(engine, a);
  assert.equal(a.bylethStunPending, 1);
  byleth.applyPendingFromCourses(engine, a);
  assert.equal(a.statuses.stun, 1);
  assert.equal(a.bylethStunPending, 0);

  byleth.onRoundWinner(engine, b); // ไบเลธเองไม่โดน
  assert.equal(b.bylethStunPending || 0, 0);

  a.skillPoints = 3;
  byleth.onRoundLoser(engine, a);
  assert.equal(a.skillPoints, 4);
  assert.equal(byleth.bustDamageImmune(engine, a), true);
});

test('หลักสูตร พิเศษ: ลงโทษคนที่กดท่าไม้ตาย/สกิลพื้นฐาน และห้ามคนกดสกิลรองโจมตี', () => {
  const { b, a } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'ex');

  const realRoundSkills = engine.roundSkills;
  realRoundSkills.length = 0;
  realRoundSkills.push({ playerId: 'A', tier: 'ultimate', name: 'x' });
  realRoundSkills.push({ playerId: 'A', tier: 'basic', name: 'y' });
  realRoundSkills.push({ playerId: 'B', tier: 'ultimate', name: 'z' }); // ตัวไบเลธเองไม่โดน

  const hpBefore = a.hp, armorBefore = a.armor;
  byleth.applyExPunish(engine);
  assert.equal(a.armor + a.hp, armorBefore + hpBefore - 1); // รับความเสียหาย 1 หน่วย
  assert.equal(a.bylethNoBasicPending, 1);
  byleth.applyPendingFromCourses(engine, a);
  assert.equal(a.statuses.bylethNoBasic, 1);

  realRoundSkills.length = 0;
  realRoundSkills.push({ playerId: 'A', tier: 'secondary', name: 'w' });
  assert.equal(byleth.blocksAttack(engine, a), true);
  assert.equal(byleth.blocksAttack(engine, b), false);
  realRoundSkills.length = 0;
});

test('หลักสูตร จบการศึกษา: ส่วนลดสกิล ลดดาเมจ และโจมตีตอบหลังผู้ชนะตี', () => {
  const { b, a } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'end');

  assert.equal(byleth.costDiscount(engine, 'secondary'), 1);
  assert.equal(byleth.costDiscount(engine, 'ultimate'), 1);
  assert.equal(byleth.costDiscount(engine, 'basic'), 0);
  assert.equal(byleth.adjustIncomingDamage(engine, b, 2), 1);
  assert.equal(byleth.adjustIncomingDamage(engine, a, 2), 2); // มีผลเฉพาะไบเลธ

  // ยังไม่ใช่ผู้แต้มน้อยสุด -> ไม่ได้ตีตอบ
  byleth.onAttacked(engine, a, b);
  assert.equal(byleth.startCounterAttack(engine, a), false);

  byleth.markLowestScore(engine, b);
  byleth.onAttacked(engine, a, b);
  assert.equal(b.bylethCounterReady, true);
  assert.equal(byleth.startCounterAttack(engine, a), true);
  assert.equal(engine.attackerId, 'B');
  engine.setAttackerId(null);
});

test('sothis: ฟื้นคืนชีพ 1 ครั้งต่อเกมด้วยเลือด 1 เกราะ 0', () => {
  const { b } = setup();
  b.hp = 0; b.armor = 2;
  assert.equal(byleth.tryRevive(engine, b), true);
  assert.equal(b.hp, 1);
  assert.equal(b.armor, 0);
  assert.equal(b.alive, true);
  assert.equal(byleth.tryRevive(engine, b), false); // ครั้งที่ 2 ไม่ทำงาน
});

test('เพลงประจำหลักสูตรสลับไฟล์ตามกลางวัน/กลางคืน', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'end');
  assert.equal(byleth.activeMusic(engine, false).music, 'byleth_end_day');
  assert.equal(byleth.activeMusic(engine, true).music, 'byleth_end_night');
  byleth.applyInstantSkill(engine, b, 'ultimate', 'off');
  assert.equal(byleth.activeMusic(engine, false), null);
});
