const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, resolveRound } = require('../../server.js');
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

test('พักผ่อน: ลบเกินแต้มที่มี แต้มหยุดที่ 0 ไม่ติดลบ และไม่ค้างค่าลบไว้กินไพ่ใบถัดไป', () => {
  const { b } = setup();
  b.cards = [{ value: 3, color: 'red' }]; // แต้มปัจจุบัน 3
  withRandom([0.9], () => byleth.applyInstantSkill(engine, b, 'basic')); // พักผ่อน
  const card = { value: 9, color: 'blue' };
  b.cards.push(card);
  byleth.onCardDraw(engine, b, card);
  assert.equal(engine.scoreOf(b), 0); // 3 + 9 - 12 = 0 (ไม่ใช่ -6)

  // ไพ่ใบถัดไปต้องบวกได้ตามปกติ ไม่โดนค่าลบค้างหักซ้ำ
  const card2 = { value: 7, color: 'green' };
  b.cards.push(card2);
  byleth.onCardDraw(engine, b, card2);
  assert.equal(engine.scoreOf(b), 7);
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

test('หลักสูตร จบการศึกษา: ส่วนลดสกิล ลดดาเมจ และได้โจมตีเพิ่มโดยไม่ต้องถูกผู้ชนะตี', () => {
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
  assert.equal(b.bylethCounterReady, true);
  assert.equal(byleth.startCounterAttack(engine, a), true);
  assert.equal(engine.attackerId, 'B');
  engine.setAttackerId(null);
});

// บั๊กเดิม: markLowestScore ถูกวางไว้ในลูป "ผู้แพ้ของเทิร์น" ซึ่งกรองด้วย val(p) === worst
//  แต่ val() ให้คนไพ่แตกเป็น -1 -> มีใครไพ่แตกสักคน worst ก็เป็น -1 ทันที ลูปนั้นเหลือแต่คนไพ่แตก
//  ไบเลธที่ไพ่ไม่แตกจึงไม่เคยถูกมาร์ก = "โจมตีตอบ" ไม่ทำงานทุกเทิร์นที่มีคนไพ่แตก
test('หลักสูตร จบการศึกษา: ได้โจมตีเพิ่มแม้เทิร์นนั้นมีคนอื่นไพ่แตก', () => {
  const { b, a } = setup();
  const c = mk('C', 'temari', 3);
  engine.players.C = c;
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'end');

  a.cards = [{ value: 10, color: 'red' }, { value: 10, color: 'blue' }];        // 20 = ผู้ชนะ
  b.cards = [{ value: 5, color: 'green' }];                                      // 5  = น้อยสุดแบบไพ่ไม่แตก
  c.cards = [{ value: 10, color: 'yellow' }, { value: 10, color: 'red' }, { value: 5, color: 'blue' }]; // 25 = ไพ่แตก
  for (const p of [a, b, c]) p.locked = true;
  assert.equal(engine.bustedOf(c), true, 'ต้องมีคนไพ่แตกจริงถึงจะครอบบั๊กเดิมได้');
  assert.equal(engine.bustedOf(b), false);

  withRandom([0.999], () => resolveRound());
  engine.clearPhaseTimer();

  assert.equal(b.bylethLowScore, true, 'ไบเลธแต้มน้อยสุดแบบไพ่ไม่แตก ต้องถูกมาร์กแม้มีคนไพ่แตก');
  assert.equal(b.bylethCounterReady, true);
  assert.equal(byleth.startCounterAttack(engine, a), true);
  assert.equal(engine.attackerId, 'B');
  engine.setAttackerId(null);
  delete engine.players.C;
});

test('หลักสูตร จบการศึกษา: เปิดเฟสโจมตีของไบเลธได้แม้ผู้ชนะไม่ได้โจมตี', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'end');
  byleth.markLowestScore(engine, b);
  engine.setGameState('SUMMARY');

  saved.endTurn(); // จำลองทางจบเทิร์นตรงจากผู้ชนะที่โจมตีไม่ได้/ไม่ได้โจมตี
  assert.equal(engine.gameState, 'ATTACK');
  assert.equal(engine.attackerId, 'B');

  engine.clearPhaseTimer();
  engine.setAttackerId(null);
});

// ไบเลธที่ "ไพ่แตกเอง" ไม่เข้าเงื่อนไข (สเปคระบุว่าต้องแต้มน้อยสุดแบบไพ่ไม่แตก)
test('หลักสูตร จบการศึกษา: ไบเลธไพ่แตกเอง ไม่ได้ตีตอบ', () => {
  const { b, a } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'end');
  a.cards = [{ value: 10, color: 'red' }, { value: 10, color: 'blue' }];
  b.cards = [{ value: 10, color: 'yellow' }, { value: 10, color: 'red' }, { value: 5, color: 'blue' }];
  for (const p of [a, b]) p.locked = true;
  assert.equal(engine.bustedOf(b), true);

  withRandom([0.999], () => resolveRound());
  engine.clearPhaseTimer();

  assert.equal(b.bylethLowScore, false);
  byleth.onAttacked(engine, a, b);
  assert.equal(byleth.startCounterAttack(engine, a), false);
});

// โหมดทีม: ผลด้านลบของหลักสูตรต้องไม่ลงเพื่อนร่วมทีม (คอนเวนชันเดียวกับเอสคานอร์/บานาจ)
//  บั๊กเดิม: เกตกลางกันได้แค่ "ดาเมจ" เพราะ byleth.js ห่อ withEffectSource ไว้เฉพาะตรง dealMixed
//  ส่วนสตั้น/ห้ามสกิลพื้นฐาน/ตัดเทิร์นโจมตี ถูกตั้งนอกเกต -> เพื่อนร่วมทีมโดนเต็มๆ (หลักสูตรทำงานครึ่งเดียว)
test('โหมดทีม: หลักสูตรไม่ลงผลด้านลบกับเพื่อนร่วมทีม แต่ยังลงศัตรูตามปกติ', () => {
  const { b } = setup();
  const mate = mk('M', 'temari', 2);
  const foe = mk('F', 'temari', 3);
  mate.teamId = 'A'; b.teamId = 'A'; foe.teamId = 'B';
  mate.armor = 0; foe.armor = 0; // ให้ดาเมจ 1 หน่วยลงเลือดจริงตรงๆ อ่านผลง่าย (dealMixed กินเกราะก่อน)
  engine.players.M = mate;
  engine.players.F = foe;
  engine.setGameMode('duo');
  try {
    byleth.addKnowledge(b, 20);

    // ดาบต้องสาป (ฟาดทันที): เลือกเพื่อนไม่ได้ (ไม่งั้นความรู้ 4 หน่วยหายฟรีเพราะดาเมจถูกเกตกัน) แต่เลือกศัตรูได้
    assert.equal(byleth.prepareStrikeTarget(engine, b, ['M']), null);
    assert.equal(byleth.prepareStrikeTarget(engine, b, ['F']).id, 'F');

    // หลักสูตร พิเศษ: ลงโทษเฉพาะศัตรู
    byleth.applyInstantSkill(engine, b, 'ultimate', 'ex');
    engine.roundSkills.length = 0;
    engine.roundSkills.push(
      { playerId: 'M', tier: 'ultimate' }, { playerId: 'M', tier: 'basic' },
      { playerId: 'F', tier: 'ultimate' }, { playerId: 'F', tier: 'basic' },
    );
    const mateHp = mate.hp, foeHp = foe.hp;
    byleth.applyExPunish(engine);
    assert.equal(mate.hp, mateHp, 'เพื่อนร่วมทีมต้องไม่โดนดาเมจ');
    assert.equal(mate.bylethNoBasicPending || 0, 0, 'เพื่อนร่วมทีมต้องไม่โดนห้ามสกิลพื้นฐาน');
    assert.equal(foe.hp, foeHp - 1, 'ศัตรูยังโดนดาเมจตามปกติ');
    assert.equal(foe.bylethNoBasicPending, 1, 'ศัตรูยังโดนห้ามสกิลพื้นฐานตามปกติ');

    // หลักสูตร พิเศษ: ไม่ตัดเทิร์นโจมตีของเพื่อนร่วมทีม แต่ยังตัดของศัตรู
    engine.roundSkills.length = 0;
    engine.roundSkills.push({ playerId: 'M', tier: 'secondary' }, { playerId: 'F', tier: 'secondary' });
    assert.equal(byleth.blocksAttack(engine, mate), false);
    assert.equal(byleth.blocksAttack(engine, foe), true);

    // หลักสูตร มาตราฐาน: ไม่สตั้นเพื่อนร่วมทีมที่ชนะ แต่ยังสตั้นศัตรูที่ชนะ
    byleth.applyInstantSkill(engine, b, 'ultimate', 'normal');
    byleth.onRoundWinner(engine, mate);
    assert.equal(mate.bylethStunPending || 0, 0);
    byleth.onRoundWinner(engine, foe);
    assert.equal(foe.bylethStunPending, 1);
  } finally {
    engine.setGameMode('ffa');
    delete engine.players.M;
    delete engine.players.F;
  }
});

// นอกโหมดทีม (ffa) ทุกอย่างต้องยังลงเหมือนเดิม — กันการแก้ข้างบนเผลอปิดผลทั้งหมด
test('โหมด ffa: หลักสูตรยังลงผลกับทุกคนตามเดิม', () => {
  const { b, a } = setup();
  byleth.addKnowledge(b, 20);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'normal');
  byleth.onRoundWinner(engine, a);
  assert.equal(a.bylethStunPending, 1);
  assert.equal(byleth.prepareStrikeTarget(engine, b, ['A']).id, 'A');
});

test('sothis: ฟื้นทันทีผ่านท่อดาเมจ 1 ครั้งต่อเกมด้วยเลือด 1 เกราะ 0', () => {
  const { b } = setup();
  b.hp = 1; b.armor = 0;
  engine.dealDirect(b, 1);
  assert.equal(b.hp, 1);
  assert.equal(b.armor, 0);
  assert.equal(b.alive, true);
  assert.equal(b.bylethRevived, true);
  engine.dealDirect(b, 1);
  assert.equal(b.alive, false); // ครั้งที่ 2 ไม่ฟื้น
});

test('หลักสูตร จบการศึกษา: ดาเมจแพ้จั่ว 1 หน่วยถูกลดเหลือ 0', () => {
  const { b } = setup();
  byleth.addKnowledge(b, 6);
  byleth.applyInstantSkill(engine, b, 'ultimate', 'end');
  b.hp = 1; b.armor = 0;
  engine.damageSoft(b);
  assert.equal(b.hp, 1);
  assert.equal(b.bylethRevived, false, 'ไม่ควรเสีย sothis เพราะดาเมจถูกหลักสูตรลดจนเหลือ 0');
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
