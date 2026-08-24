const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ignis = require('../../characters/ignis.js');
const { CHAR_BY_ID } = require('../../characters.js');

function mkEngine(over = {}) {
  const logs = [];
  return Object.assign({
    roundNumber: 1,
    GOLD_MAX: 30,
    players: {},
    logs,
    log: (msg) => logs.push(msg),
    sameTeam: () => false,
    healHp(p, n) {
      const before = p.hp;
      p.hp = Math.min(p.maxHp || 5, p.hp + n);
      return p.hp - before;
    },
    shopItemName(item) { return item.name || item.type || 'item'; },
    nextTransformCounter() { return 7; },
    triggerCutscene(p, key) { p.cutscene = key; },
    isNightRound: () => false,
    passiveSealed: () => false,
    colorOf: () => '#fff',
    dealMixed(target, n) {
      for (let i = 0; i < n; i++) {
        if (target.armor > 0) target.armor--;
        else target.hp--;
      }
    },
  }, over);
}

function mkIgnis(over = {}) {
  return Object.assign({
    id: 'ignis', name: 'Ignis', alive: true, characterId: 'ignis',
    hp: 3, maxHp: 5, armor: 0, statuses: {}, statusAmt: {}, inventory: [], gold: 0,
  }, over);
}

test('ensureBlackSparklence gives Ignis the permanent weapon once', () => {
  const p = mkIgnis();
  ignis.ensureBlackSparklence(p);
  ignis.ensureBlackSparklence(p);
  assert.equal(p.inventory.filter((it) => it.type === 'blackSparklence').length, 1);
});

test('basic skill steals one backpack item, heals, and awards bonus gold only on success', () => {
  const p = mkIgnis({ hp: 2, gold: 1 });
  const target = { id: 't1', name: 'Target', alive: true, inventory: [{ uid: 'a', type: 'armor', value: 1 }] };
  const engine = mkEngine({ players: { [p.id]: p, [target.id]: target } });
  const picked = ignis.prepareStealTarget(engine, p, target.id);

  const suffix = ignis.applySteal(engine, p, picked);

  assert.equal(target.inventory.length, 0);
  assert.equal(p.inventory.length, 1);
  assert.equal(p.inventory[0].type, 'armor');
  assert.equal(p.hp, 4);
  assert.equal(p.gold, 3);
  assert.match(suffix, /\+2/);
});

test('Trigger Dark key activates the form, heals, and queues the henshin cutscene', () => {
  const p = mkIgnis({ hp: 1, inventory: [{ uid: 'black', type: 'blackSparklence' }] });
  const engine = mkEngine();

  assert.equal(ignis.activateTriggerDark(engine, p), true);
  assert.equal(p.statuses.triggerDarkForm, ignis.DARK_TURNS);
  assert.equal(p.hp, 3);
  assert.equal(p.transformAt, 7);
  assert.equal(p.cutscene, 'triggerDarkHenshin');
});

test('ค่าใช้สกิล Trigger Dark เป็นเสียงร้องไห้ 2 แต้ม และ Impact 6 แต้ม', () => {
  assert.equal(CHAR_BY_ID.ignis.secondary.cost, 2);
  assert.equal(CHAR_BY_ID.ignis.ultimate.cost, 6);
});

test('เสียงร้องไห้มอบอวดครวญให้ทุกคนคนละ 2 สูงสุด 5 และฟื้นชีวิตผู้ใช้ 1', () => {
  const p = mkIgnis({ hp: 2, statuses: { triggerDarkForm: 5 }, triggerDarkWail: 4 });
  const target = mkIgnis({ id: 'target', name: 'Target', characterId: 'kai', triggerDarkWail: 1 });
  const engine = mkEngine({ players: { [p.id]: p, [target.id]: target } });

  ignis.applySkill(engine, p, 'secondary');

  assert.equal(p.hp, 3);
  assert.equal(p.triggerDarkWail, 5);
  assert.equal(p.statusAmt.triggerDarkWail, 5);
  assert.equal(target.triggerDarkWail, 3);
  assert.equal(target.statusAmt.triggerDarkWail, 3);
});

test('อวดครวญยังอยู่หลังคืนร่าง Trigger Dark', () => {
  const p = mkIgnis({ statuses: { triggerDarkForm: 1, triggerDarkWail: 999 }, statusAmt: { triggerDarkWail: 4 }, triggerDarkWail: 4 });
  ignis.restoreFromTriggerDark(mkEngine(), p);
  assert.equal(p.statuses.triggerDarkForm || 0, 0);
  assert.equal(p.triggerDarkWail, 4);
  assert.equal(p.statusAmt.triggerDarkWail, 4);
});

test('Impact สร้างความเสียหายตามอวดครวญของเป้าหมายและล้างทั้งสนาม', () => {
  const p = mkIgnis({ statuses: { triggerDarkForm: 5 }, triggerDarkWail: 2 });
  const target = mkIgnis({ id: 'target', name: 'Target', characterId: 'kai', hp: 5, armor: 1, triggerDarkWail: 4 });
  const other = mkIgnis({ id: 'other', name: 'Other', characterId: 'kai', triggerDarkWail: 5 });
  const engine = mkEngine({ players: { [p.id]: p, [target.id]: target, [other.id]: other } });

  const damage = ignis.applyImpact(engine, p, target);

  assert.equal(damage, 4);
  assert.equal(target.armor, 0);
  assert.equal(target.hp, 2);
  for (const player of [p, target, other]) {
    assert.equal(player.triggerDarkWail, 0);
    assert.equal(player.statuses.triggerDarkWail || 0, 0);
    assert.equal(player.statusAmt.triggerDarkWail || 0, 0);
  }
});

test('ความมืดที่ย้อมอนาคตเพิ่มพลังโจมตี +1 กลางวัน +2 กลางคืน และฟื้นแต้มเพิ่มเฉพาะกลางวัน', () => {
  const p = mkIgnis({ statuses: { triggerDarkForm: 5 } });
  const day = mkEngine({ isNightRound: () => false });
  const night = mkEngine({ isNightRound: () => true });

  assert.equal(ignis.damageBonus(day, p, { id: 't' }, {}), 1);
  assert.equal(ignis.damageBonus(night, p, { id: 't' }, {}), 2);
  assert.equal(ignis.extraSkillRegen(day, p), 1);
  assert.equal(ignis.extraSkillRegen(night, p), 0);
});

test('ไฟล์ภาพและวิดีโอของ Trigger Dark ที่ใช้งานจริงมีอยู่ครบ', () => {
  const publicRoot = path.resolve(__dirname, '../../client/public');
  for (const asset of [
    'characters/ignis/dark_skill2/trigger_dark_skill2.jpg',
    'characters/ignis/dark_skill3/trigger_dark_skill3.png',
    'characters/ignis/dark_skill3/trgger_dark__skill3.mp4',
  ]) {
    assert.equal(fs.existsSync(path.join(publicRoot, asset)), true, asset);
  }
});

test('ข้อความไทยของ Ignis ยังคงเป็น UTF-8 และไม่มีอักขระเพี้ยน', () => {
  const root = path.resolve(__dirname, '../..');
  for (const file of ['characters/ignis.js', 'characters.js', 'characters/_transforms.js', 'server.js', 'client/src/screens/Game.jsx']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(text.includes('\uFFFD'), false, `${file} contains a replacement character`);
    assert.equal(/à[¸¹]|ðŸ/.test(text), false, `${file} contains mojibake`);
  }
});
