// ============================================================
//  แกมเบลอร์ (Gambler the gambling) — วอสก้าหน่อยน้อง (สกิลพื้นฐาน เสี่ยงโชค) / กำไรเท่าตัวโว้ย (สกิลรอง) /
//  เวลาทองของพี่มาแล้ว 777 (ท่าไม้ตาย) / สกิลติดตัว แจ๊กพอตแตก! (เลือด < 3 -> โอกาสสำเร็จ +10% ผลดี +1)
//  ย้ายออกมาจาก server.js — ดู characters/index.js สำหรับไฟล์มัดรวม
//  หมายเหตุ: gate ต่างๆ (`isGambler`/`goldenOn`/`isGamble`/`gambleRepeat`, cost-halving ระหว่างเวลาทอง,
//  การยกเว้นในเช็ค "ใช้สกิลได้ 1 อันต่อเทิร์น" ร่วมกับ appleguy/tohno/hakuno/doomguy) ยังอยู่ server.js
//  เพราะเป็นเงื่อนไข boolean ล้วนๆ ไม่มี body ให้ย้าย (ตามธรรมเนียมเดียวกับ takuto.js's isTakutoEmeraude ฯลฯ)
// ============================================================

const GAMBLER_USES = 3; // วอสก้าหน่อยน้อง ใช้ได้ต่อเกม (เวลาทองรีเซ็ตให้เต็ม)

module.exports = {
  id: "gambler",

  // ดาเมจ contribution (กำไรเท่าตัวโว้ยสะสม) — เรียกจาก computeAttackBase()
  damageBonus(engine, attacker, target, ctx) {
    const profitAtk = attacker.profit || 0;
    ctx.profitAtk = profitAtk;
    return profitAtk;
  },

  // สกิลติดตัว แจ๊กพอตแตก!: เลือด < 3 -> โชคด้านบวก +10% และผลดีทุกอย่าง +1 หน่วย
  jackpot(p) {
    return !!p && p.alive && p.characterId === "gambler" && p.hp < 3;
  },

  // โอกาสสำเร็จด้านบวก: พื้นฐาน 50% + สกิลติดตัว 10% (ทุกสกิล รวมท่าไม้ตาย) + เวลาทอง 10% (ไม่มีผลกับท่าไม้ตาย)
  chance(p, tier) {
    let c = 0.5;
    if (this.jackpot(p)) c += 0.1;
    if (tier !== "ultimate" && (p.statuses.golden || 0) > 0) c += 0.1;
    return c;
  },

  // เรียกจาก useSkill() ในส่วน effect — ทั้ง 3 ระดับสกิล (วอสก้าหน่อยน้อง / กำไรเท่าตัวโว้ย / เวลาทอง) คืน flashSuffix
  resolveSkill(engine, p, tier) {
    const jackpot = this.jackpot(p); // เช็คก่อนผลสกิลเปลี่ยนเลือด
    const win = Math.random() < this.chance(p, tier);
    if (tier === "basic") return this.resolveBasic(engine, p, jackpot, win);
    if (tier === "secondary") return this.resolveSecondary(engine, p, jackpot, win);
    return this.resolveUltimate(engine, p, win);
  },

  // วอสก้าหน่อยน้อง: 50/50 ลดเลือดตัวเอง 1 หรือ ฟื้น 2 (แจ๊กพอต +1) — ฮีลล้นไปเกราะ/เลือดชั่วคราว
  resolveBasic(engine, p, jackpot, win) {
    p.gamblerUses--;
    if (win) {
      const heal = 2 + (jackpot ? 1 : 0);
      const got = engine.healOverflow(p, heal);
      const parts = [];
      if (got.toHp > 0) parts.push(`เลือด +${got.toHp}`);
      if (got.toArmor > 0) parts.push(`เกราะ +${got.toArmor}`);
      if (got.toTemp > 0) parts.push(`เลือดชั่วคราว +${got.toTemp}`);
      engine.log(`🎰 ${p.name} วอสก้าหน่อยน้อง — ดวงมา! ฟื้น +${heal} (${parts.join(", ") || "เต็มหมดแล้ว"})`);
      return ` — ดวงมา! ฟื้น +${heal}`;
    }
    engine.loseHp(p);
    engine.log(`🎰 ${p.name} วอสก้าหน่อยน้อง — ดวงกุด เสียพลังชีวิต -1`);
    // ผลสกิลตัวเองทำให้เลือดหมด -> ตายทันที ไม่ต้องรอจบเทิร์น
    if (p.hp <= 0) {
      engine.instantDeath(p);
      if (!p.alive) engine.log(`💀 ${p.name} เสี่ยงดวงจนสิ้นลม — ตกรอบทันที!`);
    }
    return " — ดวงกุด เสียเลือด -1";
  },

  // กำไรเท่าตัวโว้ย: 50/50 ห้ามจั่วเทิร์นนี้+เทิร์นหน้า หรือ +1 โจมตี (แจ๊กพอต +2) และทะลุเกราะ 1 ครั้ง (ถาวรจนได้ตี)
  resolveSecondary(engine, p, jackpot, win) {
    if (win) {
      const gain = 1 + (jackpot ? 1 : 0);
      p.profit = (p.profit || 0) + gain;
      engine.log(`💰 ${p.name} กำไรเท่าตัวโว้ย — กำไรงาม! พลังโจมตี +${gain} และโจมตีครั้งถัดไปไม่สนเกราะ (คงอยู่จนกว่าจะได้ตี รวม +${p.profit})`);
      return ` — กำไรงาม! โจมตี +${gain} ทะลุเกราะ`;
    }
    p.statuses.nodraw = Math.max(p.statuses.nodraw || 0, 1);
    p.noDrawNext = Math.max(p.noDrawNext || 0, 1);
    engine.log(`💸 ${p.name} กำไรเท่าตัวโว้ย — ขาดทุนยับ! จั่วการ์ดเพิ่มไม่ได้ทั้งเทิร์นนี้และเทิร์นหน้า`);
    return " — ขาดทุนยับ! ห้ามจั่ว 2 เทิร์น";
  },

  // เวลาทองของพี่มาแล้ว 777: 50/50 (สกิลติดตัวเพิ่มโอกาสได้) — พลาด = แต้มสกิลหายฟรี
  resolveUltimate(engine, p, win) {
    if (win) {
      p.statuses.golden = 5;
      p.skillPoints = Math.min(engine.maxSkillOf(p), p.skillPoints + 3); // สำเร็จ: คืนแต้ม 3 (กินจริงแค่ 3)
      p.skillUsedRound = false; // เทิร์นที่สำเร็จ ยังใช้สกิลต่อได้ (ไม่ติดกฎ 1 สกิลต่อเทิร์น)
      p.gamblerUses = GAMBLER_USES; // รีเซ็ตจำนวนใช้สกิลพื้นฐานกลับมาเต็ม
      p.seen.golden = true;
      p.transformAt = engine.nextTransformCounter();
      engine.log(`🎉 ${p.name} เวลาทองของพี่มาแล้ว 777 — แจ๊กพอต! บัฟเวลาทอง 5 เทิร์น (คืนแต้มสกิล 3 แต้ม)`);
      if (!p.cutsceneShown.golden) {
        p.cutsceneShown.golden = true;
        engine.queueCutscene(p, "golden");
        engine.pausePlayingForCutscene(); // เล่นวีดีโอทันทีก่อนเปิดไพ่ (แบบ MonsterLive)
      } else {
        engine.notifyTransform(p, "golden");
      }
      return undefined;
    }
    p.skillPoints = 0;
    engine.log(`💥 ${p.name} เวลาทองของพี่มาแล้ว 777 — แห้ว! เสียแต้มสกิลทั้งหมดฟรี`);
    return " — แห้ว! แต้มสกิลหายฟรี";
  },

  // เรียกจาก doAttack() หลังคำนวณดาเมจ — กำไรเท่าตัวโว้ย: บัฟทะลุเกราะหมดไปเมื่อได้ตี
  onAttackConsumeProfit(engine, attacker, profitAtk) {
    if (!(profitAtk > 0)) return;
    attacker.profit = 0; // บัฟกำไรหมดไปเมื่อได้ตี
    engine.log(`💰 ${attacker.name} กำไรเท่าตัวโว้ย — โจมตี +${profitAtk} ทะลุเกราะ! (บัฟหมดลง)`);
  },
};
