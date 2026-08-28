// ============================================================
//  ซาโตรุ อาเคฟุ — Wonder of U / Calamity / Do Do Do, De Da Da Da / Locacaca fruit
// ============================================================

const WOU_COST = 8;
const WOU_GUARD_CD = 2;
const CALAMITY_MAX = 3;
const CALAMITY_TURNS = 6;
const OBLADA_TURNS = 4;
const SPELLBURDEN_TURNS = 4;
const LOCA_SELF_POINTS = 3;
const LOCA_STEAL = 4; // kept for old UI payload compatibility; Locacaca is self-only now.

function applyOblada(engine, source, target, label, withSpellburden = false) {
  if (!target || !target.alive) return false;
  if (!engine.applyDebuff(target, "oblada", null, OBLADA_TURNS)) {
    engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — ${label} ไม่ทำงาน`);
    return false;
  }
  if (withSpellburden) engine.applySpellburden(target, SPELLBURDEN_TURNS); // helper กลาง: สะสม +1 · ใช้ซ้ำไม่ต่ออายุ
  engine.log(`🎵 ${source.name} ${label} — ส่งสิ่งแปลกปลอมติดตัว ${target.name} (ดาเมจ 1 ทุก 2 เทิร์น นาน ${OBLADA_TURNS} เทิร์น${withSpellburden ? ` + ภาระเวท ${SPELLBURDEN_TURNS} เทิร์น` : ""})`);
  return true;
}

module.exports = {
  id: "satoru",
  LOCA_STEAL,
  OBLADA_TURNS,
  SPELLBURDEN_TURNS,

  applyCalamity(engine, v) {
    if (!v || !v.alive) return false;
    v.statusAmt = v.statusAmt || {};
    v.statusAmt.calamity = Math.min(CALAMITY_MAX, (v.statusAmt.calamity || 0) + 1);
    v.statuses.calamity = CALAMITY_TURNS;
    v.calamityDraw = Math.max(v.calamityDraw || 0, v.statusAmt.calamity);
    engine.log(`🌩️ [Calamity] Lv${v.statusAmt.calamity} — หายนะไล่ล่า ${v.name}! (ต้าน/ล้างไม่ได้ · เริ่มเทิร์นถัดไปถูกบังคับจั่วเพิ่ม ${v.statusAmt.calamity} ใบ · รับดาเมจ ${v.statusAmt.calamity} ทุก 2 เทิร์น นาน ${CALAMITY_TURNS} เทิร์น)`);
    return true;
  },

  maybeWonderOfU(engine, t, by, opts = {}) {
    if (!t || !t.alive || !by || !by.alive || by.id === t.id) return;
    if (engine.passiveSealed(t)) return;
    if (t.skillPoints < WOU_COST) return;
    t.skillPoints -= WOU_COST;
    t.transformAt = engine.nextTransformCounter();
    engine.log(`🌩️ ${t.name} — WONDER OF U ทำงานอัตโนมัติ! (ใช้แต้มสกิล ${WOU_COST}) ผู้ไล่ล่าอย่าง ${by.name} ต้องพบกับหายนะ`);
    this.applyCalamity(engine, by);
    if (opts.attack) {
      engine.dealMixed(by, 1);
      by.wasAttacked = true;
      engine.log(`🌩️ Wonder Of U — ${by.name} รับความเสียหายสวนกลับ -1 จากการโจมตี ${t.name}`);
      if (by.alive && by.hp <= 0) {
        engine.instantDeath(by);
        if (!by.alive) engine.log(`💀 ${by.name} เลือดจริงหมด ตกรอบ!`);
      }
    }
    engine.triggerCutscene(t, "wonderofu");
  },

  onTargeted(engine, t, by, what) {
    if (!t || t.characterId !== "satoru" || !t.alive || !by || by.id === t.id) return { negated: false };
    if (engine.passiveSealed(t)) return { negated: false };
    let negated = false;
    if ((t.wouGuardCd || 0) <= 0) {
      t.wouGuardCd = WOU_GUARD_CD;
      negated = true;
      engine.log(`🚫 ${t.name} — อย่าได้ไล่ตามหัวหน้า... ${what}ของ ${by.name} ถูกลบล้าง! (คูลดาวน์ ${WOU_GUARD_CD} เทิร์น)`);
    }
    this.maybeWonderOfU(engine, t, by, { attack: what === "การโจมตี" });
    return { negated };
  },

  prepareObladaTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id || engine.sameTeam?.(p, t)) return null;
    return t;
  },

  applyObladaEffect(engine, p, target, skillName) {
    const r = engine.satoruOnTargeted(target, p, `สกิล ${skillName} `);
    if (!r.negated) applyOblada(engine, p, target, "Do Do Do, De Da Da Da", true);
    return ` — ใส่ ${target.name}`;
  },

  applyPassiveAttack(engine, p, target) {
    if (!p || p.characterId !== "satoru" || !target || !target.alive) return false;
    return applyOblada(engine, p, target, "ObLa Di, ObLa Da", false);
  },

  prepareLocaTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    if (tgs.length === 0) return p;
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id !== p.id) return null;
    return p;
  },

  applyLocaEffect(engine, p, locaTarget) {
    if (!locaTarget || locaTarget.id !== p.id) return "";
    p.maxHpPenalty = (p.maxHpPenalty || 0) + 1;
    p.hp = Math.min(p.hp, engine.maxHpOf(p));
    const heal = engine.healHp(p, engine.MAX_HP);
    engine.addSkill(p, LOCA_SELF_POINTS);
    engine.log(`🍑 ${p.name} Locacaca fruit — ฟื้นเลือดจนเต็ม +${heal} แลกกับ Max HP ลดถาวร 1 (เหลือ ${engine.maxHpOf(p)}) และได้แต้มสกิลทันที +${LOCA_SELF_POINTS}`);
    return ` — กินเอง (Max HP เหลือ ${engine.maxHpOf(p)})`;
  },
};