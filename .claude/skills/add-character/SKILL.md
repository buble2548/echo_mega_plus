---
name: add-character
description: เพิ่มตัวละครใหม่หรือรื้อสกิลตัวละครเดิมในเกม ECHO — ใช้เมื่อผู้ใช้ส่งสเปกตัวละคร (สกิลพื้นฐาน/รอง/ท่าไม้ตาย/สกิลติดตัว) มาให้ทำ หรือขอปรับสกิลของตัวละครที่มีอยู่ ครอบคลุมไฟล์ที่ต้องแตะครบทุกจุด จุดเสียบใน engine กับดักที่เคยพลาดมาแล้ว และแนวทางเขียนเทสต์
---

# เพิ่ม/รื้อตัวละครในเกม ECHO

โครงเกมแยก **ข้อมูล** (`characters.js`) ออกจาก **พฤติกรรม** (`characters/<id>.js`) แล้วให้
`server.js` เรียกผ่าน `CHAR_HOOKS` จุดเดียว — เพิ่มตัวละครจึงไม่ต้องรื้อ engine แต่ต้องเสียบ
ให้ครบทุกจุด ไม่งั้นสกิลจะ "เขียนแล้วไม่ทำงาน" แบบเงียบๆ

## ลำดับที่ควรทำ

1. **ถามให้จบก่อนเขียนโค้ด** — สเปกตัวละครมักกำกวมตรงตัวเลขกับขอบเขต ถามรวดเดียวแล้วค่อยลงมือ
   ดีกว่าเขียนไปแก้ไป (ดูหัวข้อ "คำถามที่ต้องถามเกือบทุกครั้ง")
2. เช็คไฟล์สื่อก่อน: `ls client/public/characters/<id>/` — โฟลเดอร์นี้อยู่ใน `.gitignore`
   **ห้ามลบไฟล์ในนั้นเด็ดขาด** เพราะ git กู้คืนไม่ได้
3. เขียน `characters/<id>.js`
4. ลงทะเบียนใน `characters/index.js`
5. เพิ่มคัตซีนใน `characters/_transforms.js`
6. เพิ่มข้อมูลตัวละครใน `characters.js`
7. เสียบ hook ใน `server.js`
8. ฝั่ง client: `client/src/screens/Game.jsx` (+ `arena.css` ถ้ามีเอฟเฟกต์สนาม)
9. เขียนเทสต์ `tests/characters/<id>.test.js`
10. `npm test` (รัน 2-3 รอบเช็คความเสถียร) · `npx eslint server.js characters characters.js client/src` · `cd client && npx vite build`

## ไฟล์ที่ต้องแตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `characters/<id>.js` | พฤติกรรมทั้งหมด export เป็น object ที่มี `id` |
| `characters/index.js` | `require` + ใส่ใน `CHARACTER_MODULES` |
| `characters.js` | ชื่อ/ความยาก/รูป/คำอธิบายสกิล/ราคา (`effect: null` ถ้าจัดการเองในโมดูล) |
| `characters/_transforms.js` | คัตซีน: `{ img, video, title, label, seconds, music, afterReveal }` |
| `server.js` | เสียบ hook ตามตารางด้านล่าง |
| `client/src/screens/Game.jsx` | ป้ายสถานะ · ปุ่มสกิล disable · โหมดเลือกเป้าหมาย · เอฟเฟกต์สนาม |
| `client/src/screens/CharacterSelect.jsx` | ใส่ id ใน `order` ของหมวดความยาก (ไม่ใส่ก็ขึ้น แต่ไปต่อท้ายสุด) |
| `tests/characters/<id>.test.js` | เทสต์ |

## จุดเสียบใน server.js

เสียบเท่าที่ตัวละครใช้ ค้นด้วยการ grep ตัวละครที่ทำคล้ายกันแล้วแปะข้างๆ กัน

| ต้องการ | จุดเสียบ |
|---|---|
| ล้างฟิลด์ทุกแมตช์ | `resetCombat(p)` |
| วีดีโอเปิดตัวตอนเริ่มแมตช์ | `startMatch()` ข้างๆ `conner.maybeQueueIntro` |
| เปลี่ยนรูปบนสนาม | `displayImg(p)` |
| ด่านเงื่อนไขก่อนหักแต้ม | `useSkill()` — `canUseSkill(engine, p, tier)` |
| ลงผลสกิล | `useSkill()` ช่วง `flashSuffix = ...applyInstantSkill(...)` |
| ผลต้นเทิร์น | `startRound()` — `onRoundStartTick(engine, p)` |
| โบนัส/หักพลังโจมตี | `damageBonus(engine, attacker, target, ctx)` |
| หลบการโจมตีปกติ | `doAttack()` — `tryAttackDodge(engine, attacker, target)` |
| หลบ/ลดดาเมจจากสกิล | `adjustIncomingDamage(engine, p, n, isNormalAttack, kind)` |
| แก้ดาเมจ/เกราะตอนโจมตี | `doAttack()` ก่อน `const hpBefore` |
| ผลหลังหมัดลง | `doAttack()` ข้างๆ `ippo.resolveUpper` |
| กันเกราะฟื้น | ด่านฟื้นเกราะใน `startRound` ข้างๆ `bat_ben.blocksArmorRegen` |
| แช่ผู้เล่นอื่น | `hit()` · `lock()` · `useSkill()` · `useInventoryItem()` · `buyShopItem()` |
| แก้เวลาเฟสจั่วไพ่ | `cardPhaseSeconds()` |
| ข้อมูลส่งให้ client | `buildStateFor()` — `<id>: p.characterId === "<id>" ? ...publicState(p) : undefined` |
| สลับกลางวัน/กลางคืน | `onDayNightTransition(engine, night, roundNumber, prevNight)` |

## กับดักที่เคยพลาดมาแล้ว — อ่านก่อนเขียน

**1. `p.locked` ไม่ได้แปลว่า "ขยับไม่ได้"** — มันแปลว่า "เปิดไพ่แล้ว" ถ้าจะแช่ผู้เล่นคนอื่น
ห้ามตั้ง `p.locked = true` ให้เขา เพราะ `checkAllLocked()` จะนับว่าครบแล้วเปิดไพ่ทันที
ใช้ธงแยกแล้วทำ `actionBlocked(engine, p)` แบบ `conner` / `brian` / `daisuke` แทน

**2. หยุดเวลาห้าม `clearPhaseTimer()` ทิ้งเฉยๆ** — ถ้าเจ้าของท่าหลุดเน็ต ห้องค้างถาวรโดยไม่มีอะไรมาปลด
ให้ตั้งตัวจับเวลายาวๆ เป็นตาข่ายกันเหนียวแล้วให้ฝั่ง client ไม่โชว์เป็นนาฬิกา
(แพทเทิร์น `SERAPH_PLACE_SAFETY_SECONDS` / `daisuke.CLOCK_UP_SAFETY`)

**3. ห้ามใส่เลขเทิร์นยาวๆ แทนความถาวร** — `applyDebuff(p, "fragile", 1, 99)` จะทำให้ป้ายสถานะ
ขึ้นเลข `99` ให้ผู้เล่นเห็น ถ้าอยากให้คงอยู่เรื่อยๆ ให้ **ต่ออายุสั้นๆ ทุกต้นเทิร์น** แทน
ส่วนสถานะที่เป็น "สแตค" จริงๆ ต้องใส่ทั้งใน `NO_TICK_STATUS` (`characters/_universal_status.js`)
และ `PERMANENT_STATUS_KEYS` (`client/src/data/permanentStatus.js`) — มีเทสต์คุมให้สองฝั่งตรงกัน

**4. สกิลที่เป็น "สวิตช์" ไม่ควรกินโควตาสกิลของเทิร์น** — ถ้าสเปกบอกว่ากดแล้วยังกดท่าอื่นต่อได้
ต้องไปเพิ่มเงื่อนไขในบรรทัดที่ตั้ง `p.skillUsedRound = true` ใน `useSkill()`

**5. ดาเมจที่ไม่ผ่าน `doAttack` ไม่คิด "เปราะบาง" ให้** — `dealMixed`/`dealDirect` ไม่บวก `fragile`
ถ้าสเปกบอกว่าหมัดนั้นต้องคิดด้วย ต้องบวก `engine.statusAmtOf(target, "fragile")` เอง

**6. ตัวละครที่มี `adjustIncomingDamage` จะหลบดาเมจแบบสุ่ม** (อิปโป เอจิ โปรดิวเซอร์ ฯลฯ)
เลือกเป็นเป้าหมายในเทสต์เมื่อไรเทสต์จะแกว่งทันที — ใช้ `temari` / `kai` เป็นเป้าแทน

**7. `characters.js` เป็นสตริง JS** — เครื่องหมาย `"` ในคำอธิบายสกิลต้อง escape เป็น `\"`
ไม่งั้นไฟล์พัง

**8. อนิเมชัน CSS ต้องขยับด้วย `transform`/`opacity` เท่านั้น** — `background-position` บนเลเยอร์
เต็มจอบังคับ repaint ทุกเฟรมบน CPU แล้วเกมกระตุก (ยิ่งถ้าซ้อนบนวีดีโอ) ใส่ `will-change: transform`
และเคารพ `prefers-reduced-motion` + ธง `lowQ`

**9. ห้ามพิมพ์ชื่อ selector แบบมีจุดนำ (เช่น `.cy-bird`) ลงในคอมเมนต์ของ `arena.css`** —
`tests/sceneQueue.test.js` อ่าน CSS ด้วย regex แล้วนับข้อความก่อนปีกกาเป็น selector จะจับผิดทันที

**10. `buildStateFor(viewerId)` เป็น per-viewer** — ถ้าต้องซ่อนข้อมูลจากคนอื่น ทำได้ที่นี่
แต่ `lastLog` กับ `io.emit("skillFlash")` เป็นก้อนเดียวส่งทุกคน ซ่อนรายคนไม่ได้

**11. โมดัล/ฉากต้องเสียบครบ 2 กระดาน** (มือถือ + จอคอม) — มีเทสต์ `tests/modalMounts.test.js` คุมอยู่

## เขียนเทสต์ยังไง

ลอกโครงจาก `tests/characters/daisuke.test.js` หรือ `oberon.test.js`:

- `const { engine } = require('../../server.js')` แล้วยัด `engine.players` เอง
- stub `engine.triggerCutscene` / `queueCutscene` / `notifyTransform` / `skillFlash` ใน `test.before`
- คืนค่าเดิมใน `test.after` และ `engine.clearPhaseTimer()` ใน `test.afterEach` (ไม่งั้น process ค้าง)
- ล็อก `Math.random` เมื่อทดสอบอะไรที่มีการโรล แล้วคืนค่าใน `afterEach`
- `engine.setRoundNumber` / `setCycleShift` / `setGameState` / `setGameMode` คุมสถานะเกม
- ถ้าสกิลเรียก `extendNight()` ต้อง `engine.setCycleShift(0)` คืนทุกเทสต์ ไม่งั้นเทสต์ถัดไปอ่าน
  กลางวัน/กลางคืนผิดแบบสุ่ม
- **รัน `npm test` 2-3 รอบเสมอ** — เทสต์ที่แกว่งจะโผล่รอบที่สองหรือสาม

## คำถามที่ต้องถามเกือบทุกครั้ง

- ตัวเลขเป็น "เพดาน" หรือ "ผลบวก"? (เช่น "ดาเมจสูงสุด 3" มักเป็นผลบวกของโบนัสหลายตัว)
- ดาเมจ **ทะลุเกราะ** หรือ **ลดเกราะก่อน**? และ **ฆ่าได้ไหม** หรือค้างที่เลือด 1?
- "ต้านสถานะผิดปกติ" กันสถานะนี้ได้ไหม?
- สถานะอยู่กี่เทิร์น และ **ถูกล้างสถานะแล้วหายทั้งก้อนหรือลดทีละ 1**?
- สกิลที่ต้องเลือกเป้าหมาย — เลือกตัวเองได้ไหม?
- ท่าที่เปลี่ยนกติกาสนาม — ครอบเฉพาะเฟสจั่วไพ่ หรือถึงเฟสโจมตีด้วย?
- ท่า toggle — กดยกเลิกเสียแต้มอีกไหม ติดคูลดาวน์ไหม?
- คูลดาวน์: กดเทิร์น N คูลดาวน์ 5 หมายถึงกดได้อีกทีเทิร์นไหน? (เก็บเป็น "เลขรอบ" ไม่ใช่ตัวนับ
  จะได้เดินต่อเองแม้ตัวละครทำอะไรไม่ได้ — ดู `daisuke.setCooldown` / `ippo.setCooldown`)
- ไฟล์สื่อมีครบไหม ชื่ออะไรบ้าง
