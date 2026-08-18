// ============================================================
//  เรียวกิ ชิกิ (patch 2.0.5 / rework 2.0.6 / 2.0.8) — เนตรมารแห่งความมรณะ / มีดพก / นายมีฝีมือแค่ไหนหรอ?
//  ท่าไม้ตาย 1: ฉันมองเห็นมันแล้ว (deatheye) / ท่าไม้ตาย 2: ความตายที่โรยรา (wither)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: ระบบ "เส้นชีวิต" (deathline) เป็นสถานะที่ตัวละครอื่นใช้ร่วมด้วย (เทเปา: นายเป็นคนทำตัวเองนะ)
//  เช่นเดียวกับ SHIKI_CANCELABLE_ULTS/shikiUltNameOf/shikiCancelUltimate/clearWitherLines/shikiGiveLifeline
//  (ใช้ยกเลิกท่าไม้ตายของตัวละครอื่นด้วย เช่น ริต้า เบอร์นัล) — ฟังก์ชัน/ค่าคงที่เหล่านี้ยังอยู่ server.js
//  เป็น shared infrastructure ที่นี่มีแค่ methods ที่เป็นของชิกิเองล้วนๆ (ไม่ถูกตัวละครอื่นเรียกใช้)
//  ตัวคูณดาเมจจากเส้นชีวิต (ความตายที่โรยรา -> +ดาเมจโจมตีปกติ) ยังอยู่ใน doAttack()'s shared damage-sum
//  expression ในตัว server.js เพราะเป็นเทอมบวกเข้า `base`/`dmg` เดียวกับตัวละครอื่นๆ (นอกขอบเขต Phase 1)
// ============================================================

const SHIKI_KNIFE_HEAL = 3;      // มีดพก: การโจมตีปกติฟื้นเลือดให้ตัวเอง 3 หน่วย (2 เทิร์น)
const SHIKI_GODSLAY_TURNS = 2;   // นายมีฝีมือแค่ไหนหรอ?: ชาร์จยกเลิกท่าไม้ตาย 1 ครั้ง คงอยู่ 2 เทิร์น (สะสมไม่ได้)
const SHIKI_WITHER_ADD_MAX = 3;  // ความตายที่โรยรา: แจกเส้นชีวิตได้สูงสุด 3 หน่วยต่อคน (หยุดแจกตั้งแต่เทิร์นที่ 4 ของท่า)
const SHIKI_WITHER_LINE_MAX = 5; // โหมดท่าไม้ตาย 2: เส้นชีวิตสะสมได้สูงสุด 5 หน่วยต่อคน (2 จากแหล่งปกติ + 3 จากท่าไม้ตาย)
const SHIKI_DEATHLINE_MAX = 6;   // เส้นชีวิตสะสมถึง 6 -> โจมตีปกติระหว่างท่าไม้ตาย 1 = สังหารทันที
const SHIKI_WITHER_KILL_CHANCE = 0.01; // ความตายที่โรยรา: โอกาสสังหาร 1% คงที่ เพิ่มไม่ได้
const SHIKI_WITHER_ATK_CAP = 5;  // ความตายที่โรยรา: พลังโจมตีรวมสูงสุด 5 ต่อครั้ง (แค่ log แสดงผลที่นี่ — ตัวเพดานจริงอยู่ server.js)

module.exports = {
  id: "shiki",

  // เรียกจาก dealRound() ต้นเทิร์น — ความตายที่โรยรา: ทุกเทิร์นที่ท่าไม้ตายทำงาน มอบเส้นชีวิต +1 ให้ทุกคนยกเว้นตัวเอง
  onRoundStartWitherTick(engine) {
    for (const s of engine.alivePlayers()) {
      if (s.characterId !== "shiki" || !((s.statuses.wither || 0) > 0)) continue;
      let gaveAny = false;
      for (const o of engine.alivePlayers()) {
        if (o.id === s.id) continue;
        if ((o.witherAdded || 0) >= SHIKI_WITHER_ADD_MAX) continue; // ท่าไม้ตายแจกครบ 3 หน่วยแล้ว
        if (engine.resistActive(o)) continue; // ต้านสถานะผิดปกติ — ไม่ได้เส้นชีวิตเพิ่มรอบนี้
        const cur = o.statuses.deathline || 0;
        const next = Math.min(SHIKI_WITHER_LINE_MAX, cur + 1);
        if (next > cur) {
          o.statuses.deathline = next;
          o.witherAdded = (o.witherAdded || 0) + 1;
          gaveAny = true;
        }
      }
      if (gaveAny) engine.log(`🥀 ความตายที่โรยรา — ${s.name} มอบเส้นชีวิต +1 ให้ผู้เล่นทุกคน (ท่าไม้ตายแจกได้สูงสุด ${SHIKI_WITHER_ADD_MAX} หน่วยต่อคน · เหลืออีก ${Math.max(0, (s.statuses.wither || 0) - 1)} เทิร์น)`);
      else engine.log(`🥀 ความตายที่โรยรา — เส้นชีวิตจากท่าไม้ตายของ ${s.name} แจกครบแล้ว (เหลืออีก ${Math.max(0, (s.statuses.wither || 0) - 1)} เทิร์น)`);
    }
  },

  // เรียกจาก resolveRound() หลังเปิดไพ่ทุกคน — สกิลติดตัว เนตรมารแห่งความมรณะ: เปิดไพ่แล้วแต้มเท่ากับผู้เล่นอื่น -> ติดเส้นชีวิตถาวร
  onScoreTiePassive(engine, combatants) {
    for (const s of combatants) {
      if (s.characterId !== "shiki" || engine.bustedOf(s)) continue;
      const witherMode = (s.shikiUlt || "deatheye") === "wither";
      for (const o of combatants) {
        if (o.id === s.id || engine.bustedOf(o)) continue;
        if (engine.scoreOf(o) !== engine.scoreOf(s)) continue;
        if (engine.resistActive(o)) {
          engine.log(`🛡️ ${o.name} ต้านสถานะผิดปกติ — แต้มเท่ากับ ${s.name} แต่ไม่ติดเส้นชีวิตเพิ่ม`);
          continue;
        }
        const gained = engine.shikiGiveLifeline(s, o, 2);
        if (gained > 0) {
          engine.log(`🩸 เนตรมารแห่งความมรณะ — ${o.name} แต้มเท่ากับ ${s.name} ติดเส้นชีวิต +${gained} (สะสม ${o.statuses.deathline}${witherMode ? `/${SHIKI_WITHER_LINE_MAX}` : `/${SHIKI_DEATHLINE_MAX}`})`);
        } else {
          engine.log(`🩸 เนตรมารแห่งความมรณะ — ${o.name} แต้มเท่ากับ ${s.name} แต่เส้นชีวิตจากแหล่งปกติเต็มเพดานแล้ว`);
        }
      }
    }
  },

  // เรียกจาก useSkill()'s gate — เตรียมเป้าหมาย นายมีฝีมือแค่ไหนหรอ? (คนอื่นเท่านั้น — กดซ้ำไม่ได้ถ้ายังมีชาร์จยกเลิกท่าไม้ตายค้างอยู่)
  prepareLifelineTarget(engine, p, targets) {
    if ((p.statuses.godslay || 0) > 0) return null; // ผลยกเลิกท่าไม้ตายยังอยู่ — กดซ้ำไม่ได้ (patch 2.0.6.1)
    const tgs = Array.isArray(targets) ? [...new Set(targets)] : [];
    const t = tgs.length === 1 ? engine.players[tgs[0]] : null;
    if (!t || !t.alive || t.id === p.id) return null;
    return t;
  },

  // เรียกจาก useSkill() ในส่วน effect — มอบเส้นชีวิต +1 ให้เป้าหมาย + ตัวเองได้ชาร์จยกเลิกท่าไม้ตาย 1 ครั้ง คืน flashSuffix
  applyLifelineEffect(engine, p, target, skillName) {
    p.statuses.godslay = SHIKI_GODSLAY_TURNS; // 2 เทิร์น (นับเทิร์นปัจจุบันเป็นเทิร์นแรก) — ไม่สะสม
    if (engine.satoruOnTargeted(target, p, `สกิล ${skillName} `).negated) {
      engine.log(`🔪 ${p.name} นายมีฝีมือแค่ไหนหรอ? — พร้อมยกเลิกท่าไม้ตายของผู้เล่นอื่น 1 ครั้ง (${SHIKI_GODSLAY_TURNS} เทิร์น)`);
      return " — เส้นชีวิตถูกลบล้าง";
    }
    const gained = engine.shikiGiveLifeline(p, target, 1);
    const dlMsg = gained > 0 ? `ติดเส้นชีวิต +${gained} (สะสม ${target.statuses.deathline || 0})` : `ต้านสถานะผิดปกติ — ไม่ติดเส้นชีวิตเพิ่ม`;
    engine.log(`🔪 ${p.name} นายมีฝีมือแค่ไหนหรอ? — ${target.name} ${dlMsg} และ ${p.name} พร้อมยกเลิกท่าไม้ตายของผู้เล่นอื่น 1 ครั้ง (${SHIKI_GODSLAY_TURNS} เทิร์น)`);
    return ` — วัดฝีมือ ${target.name}`;
  },

  // เรียกจาก useSkill() ในส่วน effect — เปิดท่าไม้ตาย 1: ฉันมองเห็นมันแล้ว (เนตรมารแห่งความมรณะ 3 เทิร์น)
  activateDeatheye(engine, p) {
    p.transformAt = engine.nextTransformCounter();
    engine.log(`👁️ ${p.name} ฉันมองเห็นมันแล้ว — เนตรมารแห่งความมรณะเปิดขึ้น 3 เทิร์น! (เส้นชีวิตครบ ${SHIKI_DEATHLINE_MAX} = สังหารทันที)`);
  },

  // เรียกจาก useSkill() ในส่วน effect — เปิดท่าไม้ตาย 2: ความตายที่โรยรา (5 เทิร์น แจกเส้นชีวิต)
  activateWither(engine, p) {
    p.transformAt = engine.nextTransformCounter();
    for (const o of Object.values(engine.players)) o.witherAdded = 0;
    engine.log(`🥀 ${p.name} ความตายที่โรยรา — ความตายเริ่มโรยราลงบนสนาม 5 เทิร์น! (เส้นชีวิตแปรเป็นดาเมจเสริมการโจมตีปกติ +1 ต่อเส้น — พลังโจมตีรวมสูงสุด ${SHIKI_WITHER_ATK_CAP} · โอกาสสังหารทันที ${Math.round(SHIKI_WITHER_KILL_CHANCE * 100)}% คงที่ · ท่าไม้ตายแจกเส้นชีวิตได้สูงสุด ${SHIKI_WITHER_ADD_MAX} หน่วยต่อคน)`);
  },

  // เรียกจาก doAttack() ตอนโจมตีปกติสำเร็จ — มีดพก: ฟื้นเลือดให้ตัวเอง (คืนจำนวนที่ฟื้นได้ — 0 ถ้าไม่มีมีดพก)
  applyKnifeHeal(engine, attacker) {
    if (!(attacker.characterId === "shiki" && (attacker.statuses.knife || 0) > 0)) return 0;
    const heal = engine.healHp(attacker, SHIKI_KNIFE_HEAL);
    engine.log(`🔪 ${attacker.name} มีดพก — ฟื้นพลังชีวิต +${heal}`);
    return heal;
  },

  // เรียกจาก doAttack() ตอนโจมตีปกติ (ไม่ใช่การสังหารทันที) — เนตรมารแห่งความมรณะ: เส้นชีวิตของเป้าหมายถูกลบออกทั้งหมด เริ่มนับใหม่
  resetDeathlineOnHit(engine, attacker, target) {
    const active = attacker.characterId === "shiki" && (attacker.statuses.deatheye || 0) > 0;
    if (!active || !((target.statuses.deathline || 0) > 0)) return false;
    delete target.statuses.deathline;
    engine.log(`👁️ เนตรมารแห่งความมรณะ — เส้นชีวิตของ ${target.name} ถูกลบออกทั้งหมด เริ่มนับใหม่`);
    return true;
  },

  // เรียกจาก doAttack() — ท่าไม้ตาย 1: เป้าหมายเส้นชีวิตครบ 6 = สังหารทันที (บังคับตาย) — คืน true ถ้าต้อง return ทันที
  onAttackDeatheye(engine, attacker, target) {
    const active = attacker.characterId === "shiki" && (attacker.statuses.deatheye || 0) > 0;
    if (!active || engine.killSealed(attacker) || (target.statuses.deathline || 0) < SHIKI_DEATHLINE_MAX) return false;
    if (engine.appleGuyDodgesKill(attacker, target)) return true; // Apple guy: หลบสังหารทันทีได้
    engine.queueCutscene(attacker, "shikiKill"); // เล่นวีดีโอก่อนสังหารทุกครั้ง
    delete target.statuses.deathline;
    delete attacker.statuses.deatheye; // จัดการได้แล้ว 1 คน — ท่าไม้ตายปิดลงทันที
    this.applyKnifeHeal(engine, attacker); // มีดพก: ยังเป็นการโจมตีปกติ — ฟื้นเลือดให้ตัวเองตามปกติ
    engine.instantDeath(target);
    target.wasAttacked = true;
    if (!target.alive) engine.log(`👁️💀 เนตรมารแห่งความมรณะ! ${attacker.name} มองเห็นเส้นชีวิตของ ${target.name} — สังหารทันที (บังคับตาย)!`);
    else engine.log(`👁️💀 เนตรมารแห่งความมรณะ! ${attacker.name} มองเห็นเส้นชีวิตของ ${target.name} — แต่ ${target.name} เกิดใหม่หนีความตายไปได้!`);
    engine.log(`👁️ ${attacker.name} จัดการเป้าหมายได้แล้ว — ฉันมองเห็นมันแล้ว ปิดลงทันที`);
    engine.setLastAttack({
      byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
      byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
      targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
      dmg: 0, kill: !target.alive,
      skills: [{ name: "ฉันมองเห็นมันแล้ว — สังหารทันที", img: "/characters/shiki/shiki_skill3.jpg", by: attacker.name, color: engine.POSITION_COLORS[attacker.position] || "#888", side: "atk" }],
    });
    engine.runCutsceneQueue(() => {
      engine.setGameState("ATTACKING");
      engine.startPhaseTimer(engine.ATTACKFX_TIME + 2, engine.endTurn);
      engine.broadcastState();
    });
    return true;
  },

  // เรียกจาก doAttack() — ท่าไม้ตาย 2: โอกาสสังหารทันที 1% คงที่ตามเส้นชีวิตที่เป้าหมายมี — คืน true ถ้าต้อง return ทันที
  onAttackWither(engine, attacker, target) {
    const active = attacker.characterId === "shiki" && (attacker.statuses.wither || 0) > 0;
    if (!active || engine.killSealed(attacker)) return false;
    const lines = target.statuses.deathline || 0;
    const chance = engine.miyakoKillChance(target, SHIKI_WITHER_KILL_CHANCE);
    if (lines > 0 && Math.random() < chance) {
      if (engine.appleGuyDodgesKill(attacker, target)) return true; // Apple guy: หลบสังหารทันทีได้
      engine.queueCutscene(attacker, "shikiWitherKill"); // เล่นวีดีโอก่อนสังหารทุกครั้ง
      delete attacker.statuses.wither; // สังหารได้แล้ว 1 คน — ท่าไม้ตายจบลง
      delete target.statuses.deathline;
      target.witherAdded = 0;
      engine.clearWitherLines(); // ลบเส้นชีวิตส่วนที่ท่าไม้ตายแจกไปออกจากทุกคน
      this.applyKnifeHeal(engine, attacker); // มีดพก: ยังเป็นการโจมตีปกติ — ฟื้นเลือดให้ตัวเองตามปกติ
      engine.instantDeath(target);
      target.wasAttacked = true;
      if (!target.alive) engine.log(`🥀💀 ความตายที่โรยรา! ${attacker.name} เด็ดเส้นชีวิตของ ${target.name} (โอกาส ${Math.round(chance * 100)}%) — สังหารทันที!`);
      else engine.log(`🥀💀 ความตายที่โรยรา! ${attacker.name} เด็ดเส้นชีวิตของ ${target.name} — แต่ ${target.name} เกิดใหม่หนีความตายไปได้!`);
      engine.log(`🥀 ${attacker.name} จัดการเป้าหมายได้แล้ว — ความตายที่โรยราจบลง และเส้นชีวิตที่สะสมช่วงท่าไม้ตายถูกลบออกให้ทุกคน`);
      engine.setLastAttack({
        byName: attacker.name, byImg: engine.displayImg(attacker), byColor: engine.POSITION_COLORS[attacker.position] || "#888",
        byDoomWeapon: attacker.characterId === "doomguy" ? attacker.doomWeapon : undefined,
        targetName: target.name, targetImg: engine.displayImg(target), targetColor: engine.POSITION_COLORS[target.position] || "#888",
        dmg: 0, kill: !target.alive,
        skills: [{ name: "ความตายที่โรยรา — สังหารทันที", img: "/characters/shiki/shiki_skill3.2.jpg", by: attacker.name, color: engine.POSITION_COLORS[attacker.position] || "#888", side: "atk" }],
      });
      engine.runCutsceneQueue(() => {
        engine.setGameState("ATTACKING");
        engine.startPhaseTimer(engine.ATTACKFX_TIME + 2, engine.endTurn);
        engine.broadcastState();
      });
      return true;
    }
    if (lines > 0) {
      engine.miyakoSurvivedKillAttempt(target);
      engine.log(`🥀 ความตายที่โรยรา — ${attacker.name} เสี่ยงเด็ดเส้นชีวิตของ ${target.name} (โอกาส ${Math.round(chance * 100)}%) แต่ความตายยังไม่มาเยือน — เส้นชีวิตแปรเป็นดาเมจเสริม +${lines} แทน`);
    }
    return false;
  },
};
