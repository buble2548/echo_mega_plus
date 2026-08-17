// ============================================================
//  ซาโตรุ อาเคฟุ (patch 2.0.8.2) — สกิลติดตัวลบล้าง+Wonder of U / [Calamity] / Obla Di, Obla Da / Locacaca fruit
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: satoruOnTargeted() ใน server.js เป็น wrapper รอบ CHAR_HOOKS.satoru.onTargeted — ตัวละครอื่น
//  เกือบทั้งหมดในเกมเรียก engine.satoruOnTargeted(target, by, what) ก่อนใส่ผลสกิล/ดาเมจใส่เป้าหมาย เพื่อให้
//  สกิลติดตัวซาโตรุ (ลบล้าง + สวนกลับ Wonder of U) ทำงานได้แม้ผู้เรียกไม่รู้จักซาโตรุเลย — ห้ามลบ wrapper นี้
//  ท่าไม้ตายทำงานอัตโนมัติ ไม่ใช่สกิลที่กดเอง (isSatoru && tier === "ultimate" return ยังอยู่ server.js เป็น gate ปกติ)
//  ระบบข้อเสนอ Locacaca (resolveLoca/answerLoca, ยื่นข้อเสนอ/ตอบรับ) ยังอยู่ server.js เพราะใช้ pattern
//  เดียวกับข้อเสนออื่นๆ ในเกม (contractOffer/renewPending) ที่ resolveRound()/checkAllLocked() เช็ครวมกัน
// ============================================================

const WOU_COST = 8;          // Wonder of U: แต้มสกิลที่ใช้ต่อการทำงานอัตโนมัติ 1 ครั้ง
const WOU_GUARD_CD = 2;      // สกิลติดตัวลบล้าง: คูลดาวน์ 2 เทิร์น
const CALAMITY_MAX = 3;      // [Calamity] สะสมสูงสุด 3 ระดับ
const CALAMITY_TURNS = 6;    // [Calamity] คงอยู่ 6 เทิร์น (รีเฟรชเมื่อโดนซ้ำ)
const OBLADA_TURNS = 6;      // สิ่งแปลกปลอม (Obla Di, Obla Da): ดาเมจ 1 ทุก 2 เทิร์น นาน 6 เทิร์น
const LOCA_SELF_POINTS = 3;  // Locacaca fruit (ใช้เอง): รีเจนแต้มสกิลทันที +3
const LOCA_STEAL = 4;        // Locacaca fruit (ให้คนอื่น): ขโมยแต้มสกิลเป้าหมาย 4 หน่วย

module.exports = {
  id: "satoru",
  LOCA_STEAL,

  // ติด [Calamity] +1 ระดับ (ต้านสถานะผิดปกติกันได้) — รีเฟรชเวลา + บังคับจั่วตอนเริ่มเทิร์นถัดไป
  applyCalamity(engine, v) {
    if (!v || !v.alive) return false;
    if (engine.resistActive(v)) {
      engine.log(`🛡️ ${v.name} ต้านสถานะผิดปกติ — ไม่ติด [Calamity]`);
      return false;
    }
    v.statusAmt = v.statusAmt || {};
    v.statusAmt.calamity = Math.min(CALAMITY_MAX, (v.statusAmt.calamity || 0) + 1);
    v.statuses.calamity = CALAMITY_TURNS;
    v.calamityDraw = Math.max(v.calamityDraw || 0, v.statusAmt.calamity);
    engine.log(`🌩️ [Calamity] Lv${v.statusAmt.calamity} — หายนะไล่ล่า ${v.name}! (เริ่มเทิร์นถัดไปถูกบังคับจั่วเพิ่ม ${v.statusAmt.calamity} ใบ · รับดาเมจ ${v.statusAmt.calamity} ทุก 2 เทิร์น นาน ${CALAMITY_TURNS} เทิร์น)`);
    return true;
  },

  // ท่าไม้ตาย Wonder of U: ทำงานอัตโนมัติ (หักแต้มสกิล 8) — ผู้ที่โจมตี/ใช้สกิลใส่ซาโตรุติด [Calamity]
  maybeWonderOfU(engine, t, by) {
    if (!t || !t.alive || !by || !by.alive || by.id === t.id) return;
    if (engine.passiveSealed(t)) return; // สกิลติดตัวถูกปิดใช้งาน (เช่น MOON*CELL คิชินามิ ฮาคุโนะ)
    if (t.skillPoints < WOU_COST) return;
    t.skillPoints -= WOU_COST;
    t.transformAt = engine.nextTransformCounter();
    engine.log(`🌩️ ${t.name} — WONDER OF U ทำงานอัตโนมัติ! (ใช้แต้มสกิล ${WOU_COST}) ผู้ไล่ล่าอย่าง ${by.name} ต้องพบกับหายนะ`);
    this.applyCalamity(engine, by);
    engine.triggerCutscene(t, "wonderofu"); // ครั้งแรกเล่นวีดีโอเต็ม + เพลง / ครั้งถัดไปแจ้งเตือนเล็กๆ
  },

  // เรียกจาก server.js's satoruOnTargeted(t, by, what) (universal wrapper — ทุกตัวละครอื่นเรียกผ่าน engine)
  //  การโจมตี/สกิลที่พุ่งเข้าใส่ถูกลบล้าง (คูลดาวน์ 2 เทิร์น) + เช็ค Wonder of U เสมอ
  //  คืน { negated } — ผู้เรียกข้ามการใส่ผลสกิล/ดาเมจเมื่อ negated เป็น true (แต้มที่จ่ายไปเสียฟรี)
  onTargeted(engine, t, by, what) {
    if (!t || t.characterId !== "satoru" || !t.alive || !by || by.id === t.id) return { negated: false };
    if (engine.passiveSealed(t)) return { negated: false }; // สกิลติดตัวถูกปิดใช้งาน
    let negated = false;
    if ((t.wouGuardCd || 0) <= 0) {
      t.wouGuardCd = WOU_GUARD_CD; // ลบล้างแล้วติดคูลดาวน์ 2 เทิร์น (ลดลงตอนเริ่มเทิร์นใหม่)
      negated = true;
      engine.log(`🚫 ${t.name} — อย่าได้ไล่ตามหัวหน้า... ${what}ของ ${by.name} ถูกลบล้าง! (คูลดาวน์ ${WOU_GUARD_CD} เทิร์น)`);
    }
    this.maybeWonderOfU(engine, t, by);
    return { negated };
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย Obla Di, Obla Da (คนอื่นเท่านั้น)
  prepareObladaTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — ส่งสิ่งแปลกปลอมติดเป้าหมาย คืน flashSuffix
  applyObladaEffect(engine, p, target, skillName) {
    const r = engine.satoruOnTargeted(target, p, `สกิล ${skillName} `); // เป้าหมายเป็นซาโตรุอีกคน = ลบล้างได้
    if (!r.negated) {
      if (engine.resistActive(target)) {
        engine.log(`🛡️ ${target.name} ต้านสถานะผิดปกติ — สิ่งแปลกปลอมไม่ทำงาน`);
      } else {
        target.statuses.oblada = OBLADA_TURNS;
        engine.log(`🎵 ${p.name} Obla Di, Obla Da — ส่งสิ่งแปลกปลอมติดตัว ${target.name} (ดาเมจ 1 ทุก 2 เทิร์น นาน ${OBLADA_TURNS} เทิร์น)`);
      }
    }
    return ` — ใส่ ${target.name}`;
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย Locacaca fruit (ตัวเองหรือคนอื่น — ห้ามยื่นซ้ำถ้ามีข้อเสนอค้าง)
  prepareLocaTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive) return null;
    if (t.id !== p.id && p.locaOffer) return null; // มีข้อเสนอค้างอยู่ — รอคำตอบก่อน
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — ใช้เอง = ฮีลเต็ม + ลด Max HP 1 + แต้มสกิล +3 / ให้คนอื่น = ยื่นข้อเสนอ คืน flashSuffix
  applyLocaEffect(engine, p, locaTarget) {
    if (locaTarget.id === p.id) {
      p.maxHpPenalty = (p.maxHpPenalty || 0) + 1;
      p.hp = Math.min(p.hp, engine.maxHpOf(p));
      const heal = engine.healHp(p, engine.MAX_HP);
      engine.addSkill(p, LOCA_SELF_POINTS);
      engine.log(`🍑 ${p.name} Locacaca fruit — ฟื้นเลือดจนเต็ม +${heal} แลกกับ Max HP ลดถาวร 1 (เหลือ ${engine.maxHpOf(p)}) และได้แต้มสกิลทันที +${LOCA_SELF_POINTS}`);
      return ` — กินเอง (Max HP เหลือ ${engine.maxHpOf(p)})`;
    }
    p.locaOffer = locaTarget.id;
    engine.log(`🍑 ${p.name} Locacaca fruit — ยื่นผลโลกากากาให้ ${locaTarget.name} (รับ = ฮีลเต็ม แลก Max HP -1 และจ่ายแต้มสกิล ${LOCA_STEAL} · ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ)`);
    return ` — ยื่นผลไม้ให้ ${locaTarget.name}`;
  },
};
