// ภาระเวท (spellburden) — กฎกลางที่ทุกแหล่งต้องเดินผ่าน applySpellburden() ตัวเดียวกัน
//  1) จำนวนสะสม +1 ต่อครั้ง เพดาน SPELLBURDEN_MAX (2)
//  2) ใช้ซ้ำใส่คนเดิมขณะสถานะยังติดอยู่ = ไม่ต่ออายุ (เวลาที่เหลือเดินต่อ)
//  3) ต้านสถานะผิดปกติกันได้ทั้งก้อน
//  4) ราคาสกิลที่ถูกดันขึ้นต้องไม่เกิน SKILL_COST_MAX (8) — สกิลที่ 8 อยู่แล้วไม่แพงขึ้น
const test = require('node:test');
const assert = require('node:assert/strict');
const universal = require('../characters/_universal_status.js');
const { applySpellburden, statusAmtOf, SPELLBURDEN_MAX } = universal;

const mkPlayer = (over = {}) => Object.assign({ id: 'p1', statuses: {}, statusAmt: {} }, over);

test('SPELLBURDEN_MAX = 2 (ซ้อนทับได้มากสุด 2 หน่วย)', () => {
  assert.equal(SPELLBURDEN_MAX, 2);
});

test('applySpellburden: สะสม +1 ต่อครั้ง แต่ไม่เกินเพดาน', () => {
  const p = mkPlayer();
  applySpellburden(p, 5);
  assert.equal(p.statusAmt.spellburden, 1);
  applySpellburden(p, 5);
  assert.equal(p.statusAmt.spellburden, 2);
  applySpellburden(p, 5);
  assert.equal(p.statusAmt.spellburden, SPELLBURDEN_MAX, 'ครั้งที่ 3 ไม่ทะลุเพดาน');
});

test('applySpellburden: ใช้ซ้ำขณะสถานะยังติดอยู่ = ไม่ต่ออายุ', () => {
  const p = mkPlayer();
  applySpellburden(p, 5);
  p.statuses.spellburden = 2;           // จำลองเวลาเดินไป 3 เทิร์น
  applySpellburden(p, 5);
  assert.equal(p.statuses.spellburden, 2, 'เวลาที่เหลือเดินต่อ ไม่รีเซ็ตกลับเป็น 5');
  assert.equal(p.statusAmt.spellburden, 2, 'แต่จำนวนยังสะสมเพิ่มได้');
});

test('applySpellburden: แหล่งที่มาต่างกันใช้เทิร์นของตัวเอง — แต่ยังไม่ต่ออายุของเดิม', () => {
  const p = mkPlayer();
  applySpellburden(p, 4);               // ซาโตรุ 4 เทิร์น
  assert.equal(p.statuses.spellburden, 4);
  applySpellburden(p, 5);               // ผู้สังหารเมจ 5 เทิร์น — ไม่ยืดให้
  assert.equal(p.statuses.spellburden, 4);
});

test('applySpellburden: หมดอายุแล้ว ตั้งเวลาใหม่ได้ตามปกติ', () => {
  const p = mkPlayer();
  applySpellburden(p, 5);
  delete p.statuses.spellburden;        // endTurn ล้าง statusAmt ให้ด้วยของจริง
  delete p.statusAmt.spellburden;
  applySpellburden(p, 5);
  assert.equal(p.statuses.spellburden, 5);
  assert.equal(p.statusAmt.spellburden, 1);
});

test('applySpellburden: ต้านสถานะผิดปกติกันไว้ทั้งก้อน', () => {
  const p = mkPlayer({ statuses: { resist: 1 } });
  assert.equal(applySpellburden(p, 5), false);
  assert.equal(p.statuses.spellburden || 0, 0);
  assert.equal(statusAmtOf(p, 'spellburden'), 0);
});

test('setTurnsNoRefresh: ตั้งเวลาเฉพาะตอนสถานะยังไม่ติด', () => {
  const p = mkPlayer();
  universal.setTurnsNoRefresh(p, 'manaLeech', 5);
  assert.equal(p.statuses.manaLeech, 5);
  p.statuses.manaLeech = 1;
  universal.setTurnsNoRefresh(p, 'manaLeech', 5);
  assert.equal(p.statuses.manaLeech, 1, 'ไม่ต่ออายุ');
});

test('เพดานราคาสกิล: ภาระเวทเต็ม 2 ดันราคาท่าไม้ตาย cost 8 ไม่ขึ้น', () => {
  const SKILL_COST_MAX = 8;
  const p = mkPlayer({ statuses: { spellburden: 5 }, statusAmt: { spellburden: SPELLBURDEN_MAX } });
  const costOf = (base, nightTax = 0) => Math.min(
    SKILL_COST_MAX,
    Math.max(0, base - statusAmtOf(p, 'spellflow')) + nightTax + Math.min(SPELLBURDEN_MAX, statusAmtOf(p, 'spellburden')),
  );
  assert.equal(costOf(8), 8, 'สกิลที่ 8 อยู่แล้วไม่แพงขึ้น');
  assert.equal(costOf(8, 1), 8, 'ซ้อนกับกลางคืนก็ยังไม่เกิน 8');
  assert.equal(costOf(7), 8, 'ราคาถูกดันได้แค่ถึงเพดาน');
  assert.equal(costOf(4), 6, 'สกิลราคาต่ำยังโดนเต็ม +2 ตามปกติ');
});
