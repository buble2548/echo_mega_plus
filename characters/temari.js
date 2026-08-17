// ============================================================
//  เทมาริ (patch 2.0.6) — ทงคัสสึ 3 มื้อ / ANATA WAAAAAAAA
//  ย้ายออกมาจาก server.js (useSkill()) — ดู characters/index.js สำหรับไฟล์มัดรวม
// ============================================================

const TEMARI_TONKATSU_MAX = 4; // ชามทงคัสสึสะสมได้สูงสุด (patch 2.0.6.1 — ปรับจาก 6 เหลือ 4)

module.exports = {
  id: "temari",
  TONKATSU_MAX: TEMARI_TONKATSU_MAX,

  // เรียกจาก useSkill(): ตรวจ+เตรียมเป้าหมาย ANATA WAAAAAAAA (st === "anata") — คืน targets array หรือ null ถ้าใช้ไม่ได้
  prepareAnataTargets(engine, p, targets) {
    const avail = engine.alivePlayers().filter((o) => o.id !== p.id);
    const need = Math.min(1, avail.length);
    if (need === 0) return null;
    const tgs = Array.isArray(targets)
      ? [...new Set(targets)].filter((tid) => avail.some((o) => o.id === tid))
      : [];
    if (tgs.length !== need) return null;
    return tgs;
  },

  // เรียกจาก useSkill() ในส่วน effect (isTonkatsu === true) — ทงคัสสึ 3 มื้อ: นับชามสะสม
  applyBasicTonkatsu(p) {
    p.tonkatsu = Math.min(TEMARI_TONKATSU_MAX, (p.tonkatsu || 0) + 1);
    if (p.tonkatsu > 2) p.noDrawNext = Math.max(p.noDrawNext || 0, 1);
  },

  // เรียกจาก useSkill() ตอน apply effect ท่าไม้ตาย — เก็บเป้าหมายไว้เป็นความลับ (ซาโตรุลบล้างได้)
  //  คืนค่าที่ควรเก็บไว้ใน p.anataTargets
  applyUltimateEffect(engine, p, anataTargets, skillName) {
    return (anataTargets || []).filter((tid) => !engine.satoruOnTargeted(engine.players[tid], p, `สกิล ${skillName} `).negated);
  },
};
