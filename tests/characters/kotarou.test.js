const test = require('node:test');
const assert = require('node:assert/strict');
const { engine, computeAttackBase } = require('../../server.js');
const kotarou = require('../../characters/kotarou.js');
const CHARACTERS = require('../../characters.js');

const saved = {
  triggerCutscene: engine.triggerCutscene,
  queueCutscene: engine.queueCutscene,
  skillFlash: engine.skillFlash,
};
const realRandom = Math.random;
let queued = [];

test.before(() => {
  engine.triggerCutscene = () => {};
  engine.queueCutscene = (p, key) => { queued.push(key); };
  engine.skillFlash = () => {};
});
test.after(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
  Object.assign(engine, saved);
});
test.afterEach(() => {
  engine.clearPhaseTimer();
  Math.random = realRandom;
});

function mk(id, characterId, position) {
  return {
    id, name: id, characterId, position, alive: true,
    hp: 7, maxHpPenalty: 0, armor: 0, shield: 0, tempHp: 0,
    statuses: {}, statusAmt: {}, seen: {}, cutsceneShown: {},
    cards: [], skillPoints: 20, gold: 0, teamId: null, evadeStacks: [], inventory: [],
    dmgArmor: 0, dmgHp: 0, gainedSkill: 0, locked: false, result: null, connected: true,
    isLoser: false, isWinner: false, busted: false,
    colorTrigger: { red: 0, blue: 0, green: 0, yellow: 0 }, cardBonus: 0,
  };
}

function setup() {
  for (const k of Object.keys(engine.players)) delete engine.players[k];
  queued = [];
  const K = mk('K', 'kotarou', 1);
  const A = mk('A', 'temari', 2);
  A.hp = 10;
  engine.players.K = K; engine.players.A = A;
  kotarou.resetMatch(K);
  engine.setRoundNumber(3);
  engine.setGameMode('ffa');
  engine.setGameState('PLAYING');
  return { K, A };
}

const bagItem = (uid, price) => ({ uid, type: 'heal', value: 1, size: 'small', price });

// ---------------------------------------------------------------- ข้อมูลตัวละคร
test('ข้อมูลตัวละครลงทะเบียนครบ (พิเศษ · 1/1/2 แต้ม)', () => {
  const ch = CHARACTERS.CHAR_BY_ID.kotarou;
  assert.ok(ch, 'ไม่พบ kotarou ใน CHARACTERS');
  assert.equal(ch.difficulty, 'special');
  assert.equal(ch.basic.cost, 1);
  assert.equal(ch.secondary.cost, 1);
  assert.equal(ch.ultimate.cost, 2);
  assert.ok(ch.passive && ch.passive.desc);
  assert.equal(engine.CHAR_HOOKS.kotarou, kotarou, 'ยังไม่ได้ลงทะเบียนใน characters/index.js');
});

// ---------------------------------------------------------------- สกิลพื้นฐาน: สับราง
test('สลับรากชีวิต: แต้มสกิลที่ควรฟื้นกลายเป็นพลังชีวิต และแต้มสกิลไม่ขึ้น', () => {
  const { K } = setup();
  K.hp = 3;
  K.skillPoints = 5;
  kotarou.setMode(engine, K, kotarou.MODE_LIFE);

  const before = K.skillPoints;
  const swallowed = kotarou.divertSkillRegen(engine, K, 2);
  assert.equal(swallowed, true, 'ต้องกลืนแต้มไปทำเป็นเลือด');
  assert.equal(K.skillPoints, before, 'แต้มสกิลต้องไม่ฟื้นระหว่างสับราง');
  assert.equal(K.hp, 5);
});

test('สลับพลังงาน: เหรียญที่ควรได้กลายเป็นแต้มสกิล และไม่ได้เหรียญ', () => {
  const { K } = setup();
  K.gold = 4;
  K.skillPoints = 2;
  kotarou.setMode(engine, K, kotarou.MODE_ENERGY);

  const swallowed = kotarou.divertGoldGain(engine, K, 1);
  assert.equal(swallowed, true);
  assert.equal(K.gold, 4, 'ต้องไม่ได้เหรียญระหว่างสับราง');
  assert.equal(K.skillPoints, 3);
});

// แต้มสกิลไม่ฟื้นระหว่างโหมดนี้ ถ้าไม่คลายรางเองที่ 0 ผู้เล่นจะติดอยู่ในโหมดตลอดกาล
test('แต้มสกิลเหลือ 0 -> รางคลายกลับเอง และเทิร์นนั้นได้แต้มตามปกติ', () => {
  const { K } = setup();
  K.skillPoints = 0;
  kotarou.setMode(engine, K, kotarou.MODE_LIFE);
  K.hp = 3;

  const swallowed = kotarou.divertSkillRegen(engine, K, 2);
  assert.equal(swallowed, false, 'แต้มหมดแล้วต้องไม่กลืนต่อ');
  assert.equal(kotarou.modeOf(K), kotarou.MODE_OFF);
  assert.equal(K.hp, 3, 'ไม่ได้ฟื้นเลือด เพราะรางคลายแล้ว');
});

// ---------------------------------------------------------------- สกิลติดตัว 1
test('rewrite: เลือดไม่เต็ม -> เกราะที่ระบบฟื้นให้กลายเป็นเลือด · เลือดเต็มแล้วฟื้นเกราะตามปกติ', () => {
  const { K } = setup();
  K.hp = 4;
  assert.equal(kotarou.divertArmorRegen(engine, K), true);
  assert.equal(K.hp, 5);
  assert.equal(K.armor, 0);

  K.hp = engine.maxHpOf(K);
  assert.equal(kotarou.divertArmorRegen(engine, K), false, 'เลือดเต็มแล้วต้องปล่อยให้ฟื้นเกราะ');
});

// ---------------------------------------------------------------- สกิลติดตัว 3 + ท่าไม้ตาย 2
test('ทุ่มสุดตัว: ความจุ -2 / โจมตี +1 ต่อครั้ง และ 3 ครั้งชนเพดานหลบ 30% พอดี', () => {
  const { K } = setup();
  assert.equal(engine.maxHpOf(K), 7);
  assert.equal(kotarou.dodgeChance(engine, K), 0);

  assert.equal(kotarou.overdriveVideoKey(engine, K), 'kotarouOverdrive');
  kotarou.overdrive(engine, K);
  assert.equal(engine.maxHpOf(K), 5);
  assert.equal(kotarou.powerOf(K), 1);
  assert.equal(kotarou.dodgeChance(engine, K), 10);

  kotarou.overdrive(engine, K);
  assert.equal(engine.maxHpOf(K), 3);
  assert.equal(kotarou.dodgeChance(engine, K), 20);

  // ครั้งที่ 3 คือครั้งสุดท้าย (ความจุ 3 -> 1) และต้องใช้คลิปอีกตัว
  assert.equal(kotarou.overdriveVideoKey(engine, K), 'kotarouOverdriveLast');
  kotarou.overdrive(engine, K);
  assert.equal(engine.maxHpOf(K), 1);
  assert.equal(kotarou.powerOf(K), 3);
  assert.equal(kotarou.dodgeChance(engine, K), kotarou.DODGE_MAX);
  assert.equal(K.hp, 1, 'เลือดต้องถูกบีบลงตามความจุใหม่');

  assert.equal(kotarou.canOverdrive(engine, K), false, 'ความจุเหลือ 1 แล้วต้องกดไม่ได้อีก');
  assert.equal(kotarou.canTransmute(engine, K), false, 'สกิลรองต้องถูกล็อกเมื่อความจุเหลือ 1');
});

// ---------------------------------------------------------------- สกิลรอง: อาวุธ
test('ดาบแห่งจิตใจ: ดาเมจ = ราคาไอเทม (เพดาน 4) แทนดาเมจพื้นฐาน และบวกพลังถาวรได้', () => {
  const { K, A } = setup();
  K.inventory = [bagItem('i1', 10)];
  assert.equal(kotarou.transmute(engine, K, 'i1', 'sword'), true);
  assert.equal(K.inventory.length, 0, 'ไอเทมต้องหายจากกระเป๋า');
  assert.equal(K.hp, 6, 'ต้องเสียพลังชีวิต 1 หน่วย');

  assert.equal(computeAttackBase(engine, K, A).base, kotarou.SWORD_DMG_MAX);

  K.kotarouPower = 2; // ทุ่มสุดตัว 2 ครั้ง
  assert.equal(computeAttackBase(engine, K, A).base, 6, 'ดาบ 4 + พลังถาวร 2 = 6 (เพดานที่ตั้งใจ)');
});

test('กรงเล็บ: ของราคา 6+ ได้ +1 แต่ดาเมจต่อครั้งไม่เกิน 3', () => {
  const { K, A } = setup();
  K.inventory = [bagItem('i1', 6)];
  assert.equal(kotarou.transmute(engine, K, 'i1', 'claw'), true);
  assert.equal(computeAttackBase(engine, K, A).base, 2, 'ฐาน 1 + โบนัสราคา 1');

  K.kotarouPower = 3;
  assert.equal(computeAttackBase(engine, K, A).base, kotarou.CLAW_DMG_CAP, 'ต้องถูกตัดที่เพดาน 3');
});

test('กรงเล็บ: ของถูกกว่า 6 เหรียญไม่ได้โบนัส', () => {
  const { K, A } = setup();
  K.inventory = [bagItem('i1', 5)];
  kotarou.transmute(engine, K, 'i1', 'claw');
  assert.equal(computeAttackBase(engine, K, A).base, 1);
});

test('กรงเล็บอาร์มโควตาโจมตี 2 ครั้งตอนชนะรอบ · ดาบไม่อาร์ม', () => {
  const { K } = setup();
  K.inventory = [bagItem('i1', 2)];
  kotarou.transmute(engine, K, 'i1', 'claw');
  kotarou.onRoundWon(engine, K);
  assert.equal(K.kotarouClawLeft, kotarou.CLAW_ATTACKS);

  K.kotarouWeapon = { kind: 'sword', price: 2, dmg: 2 };
  kotarou.onRoundWon(engine, K);
  assert.equal(K.kotarouClawLeft, 0);
});

// ---------------------------------------------------------------- ท่าไม้ตาย 1: ย้อนเทิร์น
test('กลับไปแก้ไข: ชนะอยู่แล้ว -> ท่าถูกยกเลิก ไม่มีหนี้เลือด', () => {
  const { K } = setup();
  kotarou.armRewind(engine, K);
  assert.equal(kotarou.rewindCandidate(engine, K.id), null, 'ชนะแล้วต้องไม่ย้อน');
  assert.equal(K.kotarouDebt || 0, 0, 'ยกเลิกแล้วต้องไม่ติดหนี้เลือด');
  assert.equal(K.kotarouRewindArmed, false);
});

test('กลับไปแก้ไข: ไม่ชนะ -> ย้อน และหนี้เลือดทบทุกครั้ง', () => {
  const { K, A } = setup();
  kotarou.armRewind(engine, K);
  const target = kotarou.rewindCandidate(engine, A.id);
  assert.equal(target, K);
  kotarou.onRewound(engine, K);
  assert.equal(K.kotarouDebt, kotarou.REWIND_HP_COST);

  kotarou.armRewind(engine, K);
  assert.equal(kotarou.rewindCandidate(engine, A.id), K);
  kotarou.onRewound(engine, K);
  assert.equal(K.kotarouDebt, kotarou.REWIND_HP_COST * 2, 'ย้อนซ้ำต้องทบหนี้');
});

test('หนี้เลือดถูกเก็บตอนขึ้นเทิร์นใหม่ — ย้อน 2 ครั้งแล้วยังแพ้ = ตาย', () => {
  const { K } = setup();
  K.kotarouDebt = kotarou.REWIND_HP_COST * 2; // 8 หน่วย เกินความจุสูงสุด
  kotarou.collectDebt(engine, K);
  assert.equal(K.alive, false, 'หนี้ 8 หน่วยต้องฆ่าเขาจริง — นี่คือความเสี่ยงที่ตั้งใจ');
  assert.equal(K.kotarouDebt, 0, 'หนี้ต้องถูกล้างหลังเก็บ ไม่เก็บซ้ำเทิร์นหน้า');
});

test('ชนะในเทิร์นที่เขียนใหม่ -> หนี้เลือดถูกลบทิ้ง', () => {
  const { K, A } = setup();
  kotarou.armRewind(engine, K);
  kotarou.rewindCandidate(engine, A.id);
  kotarou.onRewound(engine, K);
  assert.equal(K.kotarouDebt, kotarou.REWIND_HP_COST);

  kotarou.onRoundWon(engine, K); // ชนะในเทิร์นเดียวกับที่ย้อนมา
  assert.equal(K.kotarouDebt, 0);

  kotarou.collectDebt(engine, K);
  assert.equal(K.hp, 7, 'หนี้ถูกลบแล้ว ต้องไม่เสียเลือดตอนขึ้นเทิร์นใหม่');
});

test('กดกลับไปแก้ไขไม่ได้เมื่อพลังชีวิตเหลือ 4 หรือน้อยกว่า', () => {
  const { K } = setup();
  K.hp = 4;
  assert.equal(kotarou.canRewind(engine, K), false);
  K.hp = 5;
  assert.equal(kotarou.canRewind(engine, K), true);
});

// ---------------------------------------------------------------- สกิลติดตัว 2: ฟื้นคืนชีพ
test('ฟื้นคืนชีพทำงานครั้งเดียวต่อเกม', () => {
  const { K } = setup();
  assert.equal(kotarou.onDeath(engine, K), true);
  assert.equal(kotarou.revivePending(engine), true);
  K.kotarouRevivePending = false; // จำลองว่า endTurn ย้อนเทิร์นไปแล้ว
  assert.equal(kotarou.onDeath(engine, K), false, 'ครั้งที่สองต้องไม่ทำงาน');
});

// ---------------------------------------------------------------- ด่านกดสกิล
test('ด่านกดสกิล: ต้องมีตัวเลือกจากหน้าจอเสมอ และเลือกโหมดเดิมซ้ำไม่ได้', () => {
  const { K } = setup();
  assert.equal(kotarou.canUseSkill(engine, K, 'basic', null), false, 'ไม่ส่งโหมดมา = กดไม่ได้');
  assert.equal(kotarou.canUseSkill(engine, K, 'basic', { mode: 'off' }), false, 'โหมดเดิมซ้ำ = กดไม่ได้ (จะเสียแต้มฟรี)');
  assert.equal(kotarou.canUseSkill(engine, K, 'basic', { mode: 'life' }), true);

  assert.equal(kotarou.canUseSkill(engine, K, 'secondary', { kind: 'sword', uid: 'ghost' }), false, 'ไอเทมไม่มีจริง = กดไม่ได้');
  K.inventory = [bagItem('i1', 3)];
  assert.equal(kotarou.canUseSkill(engine, K, 'secondary', { kind: 'sword', uid: 'i1' }), true);
  assert.equal(kotarou.canUseSkill(engine, K, 'secondary', { kind: 'axe', uid: 'i1' }), false);

  assert.equal(kotarou.canUseSkill(engine, K, 'ultimate', { mode: 'rewind' }), true);
  K.kotarouRewindArmed = true;
  assert.equal(kotarou.canUseSkill(engine, K, 'ultimate', { mode: 'rewind' }), false, 'อาร์มไว้แล้วกดซ้ำไม่ได้');
});

// ---------------------------------------------------------------- คัตซีน/เพลง
test('คลิปทั้งสามลงทะเบียนใน TRANSFORMS พร้อมความยาวที่ครอบคลุมไฟล์จริง', () => {
  const T = engine.TRANSFORMS;
  for (const key of ['kotarouRewind', 'kotarouOverdrive', 'kotarouOverdriveLast']) {
    assert.ok(T[key], `ไม่พบคัตซีน ${key}`);
    assert.ok(T[key].video.startsWith('/characters/kotarou/'), `${key} ชี้ path ผิด`);
    assert.ok(T[key].seconds > 0);
  }
  // ความยาวจริงของไฟล์ (mvhd): 15.148 / 2.043 / 3.345 วินาที — ต้องปัดขึ้นเสมอ ไม่งั้นคลิปถูกตัดกลางคัน
  assert.ok(T.kotarouRewind.seconds >= 16);
  assert.ok(T.kotarouOverdrive.seconds >= 3);
  assert.ok(T.kotarouOverdriveLast.seconds >= 4);
});

test('เพลงประจำตัวดังเฉพาะเทิร์นที่ถูกย้อนกลับมา', () => {
  const { K } = setup();
  assert.equal(kotarou.activeMusic(engine), null);
  K.kotarouThemeRound = engine.roundNumber;
  assert.deepEqual(kotarou.activeMusic(engine), { music: kotarou.THEME_MUSIC, at: engine.roundNumber });
  engine.setRoundNumber(engine.roundNumber + 1);
  assert.equal(kotarou.activeMusic(engine), null, 'ขึ้นเทิร์นใหม่แล้วต้องกลับไปเพลงปกติ');
});
