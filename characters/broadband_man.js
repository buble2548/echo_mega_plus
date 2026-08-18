// ============================================================
//  เจ้าแห่งเน็ตบ้าน (Broadband Man) — เสือนอนกิน (สกิลพื้นฐาน) / กระชากสายแลน (สกิลรอง) /
//  สนใจใช้บริการเราไหม (ท่าไม้ตาย, ยื่นข้อเสนอคู่สัญญา) + ระบบสัญญา/ชำระค่าบริการ
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: `CONTRACT_FEE`/`CONTRACT_CYCLE`/`CONTRACT_ARMOR_BONUS`/`FIBER_CAP`/`UNPLUG_BUFFS`
//  ยังอยู่ server.js เพราะถูกใช้ร่วมกับฟังก์ชันกลาง (maxArmorOf/scoreCap ฯลฯ) นอกเหนือจากตัวละครนี้
//  หมายเหตุ 2: `resolveOffer`/`resolveRenew`/`answerContract` ยังอยู่ server.js ตามธรรมเนียมเดียวกับ
//  riddhe.js (offer)/satoru.js (Locacaca fruit) — เพราะ `checkAllLocked()`/`resolveRound()`
//  รวม pending-offer หลายระบบเข้าด้วยกัน และฟังก์ชันเหล่านี้เรียก io.emit ตรงๆ (ยังไม่มี engine.io passthrough)
//  หมายเหตุ 3: ลูป endTurn ที่เช็คสัญญาสิ้นสุด (contractPartner/contractOffer/contractWith ผสมกับ
//  locaOffer/bshieldOwnerId ของตัวละครอื่นในลูปเดียวกัน) ก็ยังอยู่ server.js ด้วยเหตุผลเดียวกับข้างบน
//  (ลูป cleanup กลางที่รวมหลายตัวละคร ไม่ใช่ของ broadband_man ล้วนๆ)
// ============================================================

module.exports = {
  id: "broadband_man",

  // คู่สัญญาปัจจุบันของ b (ฝั่งเจ้าของสัญญา มองหา partner)
  contractPartnerOf(engine, b) {
    if (!b || !b.contractPartner) return null;
    const t = engine.players[b.contractPartner];
    return t && t.alive && t.contractWith === b.id ? t : null;
  },

  // เจ้าของสัญญาของ p (ฝั่งลูกค้า มองหา boss)
  contractBoss(engine, p) {
    if (!p || !p.contractWith) return null;
    const b = engine.players[p.contractWith];
    return b && b.alive && b.contractPartner === p.id ? b : null;
  },

  // บัฟคู่สัญญา (เกราะ +3 / โจมตี +1) ทำงานอยู่ไหม — โดนกระชากสายแลนถอดชั่วคราวได้
  contractBuffActive(engine, p) {
    return !!this.contractBoss(engine, p) && !((p.statuses && p.statuses.unplug) > 0);
  },

  // ดาเมจ contribution (เสือนอนกิน +1) — partnerAtk ไม่รวมที่นี่ เพราะเป็นบัฟฝั่งลูกค้า ยังอยู่ computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const tigerAtk = (attacker.statuses.tiger || 0) > 0;
    ctx.tigerAtk = tigerAtk;
    return tigerAtk ? 1 : 0;
  },

  // เรียกจาก round-start — "ชำระค่าบริการ": คู่สัญญาใช้งานครบทุกๆ CONTRACT_CYCLE เทิร์น
  //  -> ขึ้นวีดีโอ แล้วถามคู่สัญญาว่าจะต่อสัญญาไหมระหว่างช่วงจั่วการ์ด
  onRoundStartBillTick(engine) {
    for (const b of engine.alivePlayers()) {
      if (b.characterId !== "broadband_man") continue;
      const t = this.contractPartnerOf(engine, b);
      if (!t) continue;
      b.contractTurns = (b.contractTurns || 0) + 1;
      if (b.contractTurns % engine.CONTRACT_CYCLE === 0) {
        t.renewPending = true;
        engine.triggerCutscene(b, "broadbandBill");
        engine.log(`📶 ${b.name} เรียกเก็บค่าบริการ — ${t.name} ต้องเลือกต่อสัญญา (${engine.CONTRACT_FEE} แต้ม) หรือยกเลิกสัญญา`);
      }
    }
  },

  // เรียกจาก useSkill() gate ของ isOffer — เตรียมเป้าหมาย สนใจใช้บริการเราไหม (คนอื่นเท่านั้น)
  prepareOfferTarget(engine, p, targets) {
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เสือนอนกิน: มีคู่สัญญาอยู่แล้ว -> เลี้ยงดู (ฟื้นเลือดตัวเอง 2 + ให้บัฟ fiber แก่คู่สัญญา)
  //  ยังไม่มีคู่สัญญา -> นอนรอลูกค้า (โจมตี +1 2 เทิร์น + ฟื้นเลือดต้นเทิร์นหน้า 1)
  applyTigerEffect(engine, p) {
    const t = this.contractPartnerOf(engine, p);
    if (t) {
      const heal = engine.healHp(p, 2);
      t.statuses.fiber = 1;
      engine.log(`🐯 ${p.name} เสือนอนกิน — รักษาตัวเอง +${heal} และ ${t.name} จั่วการ์ดเทิร์นนี้ไม่มีทางแตก (แต้มไม่เกิน ${engine.FIBER_CAP})`);
      return ` — เลี้ยงดู ${t.name}`;
    }
    p.statuses.tiger = Math.max(p.statuses.tiger || 0, 2);
    p.healNextTurn = Math.max(p.healNextTurn || 0, 1);
    engine.log(`🐯 ${p.name} เสือนอนกิน — พลังโจมตี +1 (2 เทิร์น) และฟื้นพลังชีวิต 1 หน่วยในเทิร์นถัดไป`);
    return " — นอนรอลูกค้า";
  },

  // กระชากสายแลน: ถอดบัฟของคู่สัญญาชั่วคราว 1 เทิร์น (คืนตอนจบเทิร์น) + ดาเมจตรง 1 ไม่สนเกราะ
  applyUnplugEffect(engine, p, skillName) {
    const t = this.contractPartnerOf(engine, p);
    if (engine.satoruOnTargeted(t, p, `สกิล ${skillName} `).negated) {
      return " — ถูกลบล้าง";
    }
    const resisted = engine.resistActive(t);
    const stripped = [];
    if (!resisted) {
      t.unplugHold = t.unplugHold || {};
      for (const k of engine.UNPLUG_BUFFS) {
        if ((t.statuses[k] || 0) > 0) {
          t.unplugHold[k] = Math.max(t.unplugHold[k] || 0, t.statuses[k]);
          delete t.statuses[k];
          stripped.push(k);
        }
      }
      t.statuses.unplug = 1; // ระหว่างติด: บัฟคู่สัญญา (เกราะ +1 / โจมตี +1) ก็ไม่ทำงานด้วย
    }
    engine.dealDirect(t, 1); // ความเสียหาย 1 หน่วยแบบไม่สนเกราะ — ไม่ใช่สถานะ ไม่โดนต้าน
    engine.maybeBeatSave(t);
    engine.maybeBeatMode(t);
    engine.maybeEva3(t);
    engine.maybeWakeKotone(t);
    t.wasAttacked = true;
    engine.log(`🔌 ${p.name} กระชากสายแลน — ${resisted ? `${t.name} ต้านสถานะผิดปกติ ไม่เสียบัฟ` : `บัฟของ ${t.name} หายไปชั่วคราว 1 เทิร์น${stripped.length ? ` (ถอด ${stripped.length} บัฟ)` : ""}`} และรับความเสียหาย -1 ไม่สนเกราะ`);
    if (t.alive && t.hp <= 0) {
      engine.instantDeath(t);
      if (!t.alive) engine.log(`💀 ${t.name} เลือดจริงหมด ตกรอบ!`);
    }
    return ` — ใส่ ${t.name}`;
  },

  // เรียกจากท้าย resolveRound() — คืนบัฟที่ "กระชากสายแลน" ถอดไว้ชั่วคราว (นับเทิร์นนี้ไปด้วย)
  onEndTurnUnplugRestore(engine) {
    for (const p of Object.values(engine.players)) {
      if (!p.unplugHold) continue;
      for (const [k, v] of Object.entries(p.unplugHold)) p.statuses[k] = Math.max(p.statuses[k] || 0, v);
      p.unplugHold = null;
    }
  },

  // สนใจใช้บริการเราไหม: ยื่นข้อเสนอคู่สัญญาให้เป้าหมายที่เตรียมไว้ (offerTarget จาก prepareOfferTarget)
  castOffer(engine, p, offerTarget, skillName) {
    if (engine.satoruOnTargeted(offerTarget, p, `สกิล ${skillName} `).negated) {
      return " — ถูกลบล้าง";
    }
    p.contractOffer = offerTarget.id;
    engine.log(`📶 ${p.name} สนใจใช้บริการเราไหม — ยื่นข้อเสนอสัญญาให้ ${offerTarget.name} (ไม่ตอบก่อนเปิดไพ่ = ปฏิเสธ)`);
    return ` — ยื่นข้อเสนอให้ ${offerTarget.name}`;
  },
};
