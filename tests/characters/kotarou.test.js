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

// ถ้ากลืนการฟื้นเกราะไปแล้วฟื้นเลือดไม่สำเร็จ เขาจะเสียทั้งสองทาง — ต้องคืนให้ระบบฟื้นเกราะต่อ
test('rewrite: ฟื้นเลือดไม่ได้ (ไร้ทางเยียวยา) -> คืนการฟื้นเกราะให้ระบบ ไม่กลืนทิ้ง', () => {
  const { K } = setup();
  K.hp = 3;
  K.statuses.nohealing = 3;
  assert.equal(kotarou.divertArmorRegen(engine, K), false, 'ต้องไม่กลืน เพราะฟื้นเลือดไม่ได้จริง');
  assert.equal(K.hp, 3);
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

// ---------------------------------------------------------------- สกิลติดตัว 4: ภูมิดาเมจแพ้จั่ว
test('เลือดเหลือ 3 หรือน้อยกว่า -> ไม่รับความเสียหายจากการแพ้จั่ว', () => {
  const { K } = setup();
  K.hp = 4;
  assert.equal(kotarou.loseDamageImmune(engine, K), false);
  K.hp = kotarou.LOW_HP_IMMUNE_AT;
  assert.equal(kotarou.loseDamageImmune(engine, K), true);
  K.hp = 1;
  assert.equal(kotarou.loseDamageImmune(engine, K), true);
  K.alive = false;
  assert.equal(kotarou.loseDamageImmune(engine, K), false, 'ตกรอบแล้วไม่ต้องคิดภูมิอีก');
});

// ---------------------------------------------------------------- สกิลติดตัว 2: ฟื้นคืนชีพ
test('ฟื้นคืนชีพทำงานครั้งเดียวต่อเกม', () => {
  const { K } = setup();
  assert.equal(kotarou.onDeath(engine, K), true);
  assert.equal(kotarou.revivePending(engine), true);
  // endTurn ย้อนเทิร์นจริง = ตรงนั้นแหละที่โควตาถูกกิน
  K.kotarouRevivePending = false;
  K.kotarouRevived = true;
  assert.equal(kotarou.onDeath(engine, K), false, 'ครั้งที่สองต้องไม่ทำงาน');
});

// ยูนะ (Longing) ชุบเขากลับมาก่อนที่ endTurn จะถึงคิวย้อนเทิร์น — สิทธิ์ของ rewrite ต้องไม่ถูกกินไปฟรีๆ
test('onDeath แค่จองสิทธิ์ ยังไม่กินโควตา — คนอื่นชุบก่อนแล้วสิทธิ์ต้องยังอยู่', () => {
  const { K } = setup();
  kotarou.onDeath(engine, K);
  assert.equal(K.kotarouRevived, false, 'ตอนตายยังไม่ควรกินโควตา');

  // จำลองว่ามีคนชุบให้ก่อน แล้ว endTurn เคลียร์ธงทิ้งโดยไม่ย้อน
  K.alive = true;
  K.kotarouRevivePending = false;
  assert.equal(K.kotarouRevived, false, 'ถูกชุบด้วยวิธีอื่นแล้ว สิทธิ์ต้องยังอยู่');
  assert.equal(kotarou.onDeath(engine, K), true, 'ตายครั้งต่อไปยังต้องจองได้');
});

// หนี้เลือดถูกเก็บ "หลัง" จุดย้อนเวลาเสมอ ไม่งั้นย้อนกลับไปจะเจอเขาในสภาพที่ตายไปแล้ว
test('ลำดับใน dealRound: เก็บหนี้เลือดหลัง captureTurnSnapshot()', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
  const snapAt = src.indexOf('captureTurnSnapshot(); // จุดย้อนเวลาของเทิร์นนี้');
  const debtAt = src.indexOf('CHAR_HOOKS.kotarou.collectDebt(engine, p)');
  assert.ok(snapAt > 0 && debtAt > 0, 'หาจุดอ้างอิงใน server.js ไม่เจอ');
  assert.ok(debtAt > snapAt, 'เก็บหนี้เลือดก่อนบันทึกจุดย้อนเวลา = ฟื้นคืนชีพย้อนกลับไปเจอศพ');
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

// ---------------------------------------------------------------- กันลูปเวลาเจอยูนะ
// โคทาโร่ตาย -> Longing ชุบ -> ย้อนเทิร์น -> ถ้าสแนปช็อตคืนธง "ใช้ไปแล้ว" ของยูนะ
// เขาก็ตายแล้วถูกชุบใหม่วนไม่จบ · การย้อนในเทิร์นเดียวกันต้องไม่คืนสิทธิ์ครั้งเดียวต่อเกมของใคร
test('ย้อนเทิร์นต้องไม่คืนสิทธิ์ Longing ของยูนะ และมีเพดานกันลูป', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

  assert.match(src, /restoreTurnSnapshot\(p\.id, true\)/, 'ท่าไม้ตายต้องขอเก็บธงครั้งเดียวต่อเกมไว้');
  assert.match(src, /restoreTurnSnapshot\(null, true\)/, 'การฟื้นคืนชีพต้องขอเก็บธงครั้งเดียวต่อเกมไว้');
  assert.match(src, /keepOncePerGame \? \{ yunaLongingUsed, yunaPity \}/, 'ต้องกันธงของยูนะไม่ให้ถูกย้อน');

  const cap = /const KOTAROU_REWIND_MAX_PER_ROUND = (\d+);/.exec(src);
  assert.ok(cap, 'ต้องมีเพดานจำนวนครั้งที่ย้อนได้ต่อเทิร์น');
  assert.ok(Number(cap[1]) >= 2 && Number(cap[1]) <= 5, `เพดาน ${cap && cap[1]} ครั้งไม่สมเหตุสมผล`);
  assert.match(src, /kotarouRewindsThisRound = 0;/, 'ตัวนับต้องถูกรีเซ็ตทุกเทิร์นจริง');
});

// ---------------------------------------------------------------- ตรวจกลไกรวม
// ค่าใช้จ่ายที่ตัวเองจ่ายไหลผ่าน dealDirect -> adjustIncomingDamage ซึ่งมีด่านหลบของเขาเองอยู่
// ถ้าไม่กันไว้ เขาจะ "หลบ" ค่าใช้จ่ายของตัวเองได้ถึง 30% = หลอมอาวุธฟรี
test('ค่าใช้จ่ายที่ตัวเองจ่าย หลบไม่ได้ (หลอมอาวุธ)', () => {
  const { K } = setup();
  // ความจุ 3 (หลบ 20%) — ใช้เพดาน 30% ไม่ได้ เพราะความจุจะเหลือ 1 ซึ่งล็อกสกิลรองไว้อยู่แล้ว
  K.maxHpPenalty = 4;
  K.hp = 3;
  K.inventory = [bagItem('i1', 4)];
  Math.random = () => 0;              // ทุกโรลหลบต้องสำเร็จถ้าปล่อยให้หลบได้
  const before = K.hp;
  kotarou.transmute(engine, K, 'i1', 'sword');
  assert.equal(K.hp, before - kotarou.TRANSMUTE_HP_COST, 'ต้องเสียเลือดจริง ห้ามหลบค่าใช้จ่ายตัวเอง');
});

// ของที่ได้มาฟรีไม่มีราคา -> ดาบดาเมจ 0 ซึ่งแย่กว่าไม่กดอะไรเลย ทั้งที่จ่ายไปแล้วทั้งแต้มและเลือด
test('ดาบจากของไม่มีราคา ยังต้องไม่แย่กว่าหมัดเปล่า', () => {
  const { K, A } = setup();
  K.inventory = [{ uid: 'free', type: 'heal', value: 1, size: 'small' }]; // ไม่มี price
  kotarou.transmute(engine, K, 'free', 'sword');
  assert.ok(computeAttackBase(engine, K, A).base >= 1, 'ดาเมจดาบต้องไม่ต่ำกว่า 1');
});

// อาวุธอยู่จนกว่าจะได้โจมตี และกรงเล็บต้องครบ 2 หมัดก่อนถึงสลาย
test('อาวุธสลายหลังโจมตี · กรงเล็บรอครบ 2 หมัด', () => {
  const { K } = setup();
  K.inventory = [bagItem('i1', 2)];
  kotarou.transmute(engine, K, 'i1', 'sword');
  assert.ok(kotarou.weaponOf(K), 'ดาบต้องยังอยู่ก่อนโจมตี');
  assert.equal(kotarou.canTransmute(engine, K), false, 'ถืออาวุธอยู่ต้องหลอมซ้ำไม่ได้');
  kotarou.consumeWeaponOnAttack(engine, K);
  assert.equal(kotarou.weaponOf(K), null, 'ดาบต้องสลายหลังโจมตี');

  K.inventory = [bagItem('i2', 2)];
  kotarou.transmute(engine, K, 'i2', 'claw');
  kotarou.onRoundWon(engine, K);
  assert.equal(K.kotarouClawLeft, 2);
  kotarou.consumeWeaponOnAttack(engine, K);
  assert.ok(kotarou.weaponOf(K), 'กรงเล็บยังเหลือหมัดที่ 2 ต้องไม่สลาย');
  K.kotarouClawLeft = 1;                  // continueClaw เปิดเฟสโจมตีครั้งที่ 2 ไปแล้ว
  kotarou.consumeWeaponOnAttack(engine, K);
  assert.equal(kotarou.weaponOf(K), null, 'ครบ 2 หมัดแล้วต้องสลาย');
});

// สูตรอัตราหลบอิงความจุพื้นฐานที่เขียนไว้ในโมดูลเอง ถ้า MAX_HP ฝั่ง engine ขยับ ตัวเลขจะเพี้ยนเงียบๆ
test('ความจุพื้นฐานในโมดูลต้องตรงกับ MAX_HP ของ engine', () => {
  const { K } = setup();
  K.maxHpPenalty = 0;
  assert.equal(engine.maxHpOf(K), kotarou.KOTAROU_MAX_HP, 'ค่าความจุพื้นฐานไม่ตรงกัน — สูตรหลบหลีกจะเพี้ยน');
  assert.equal(kotarou.capacityLost(engine, K), 0);
});
