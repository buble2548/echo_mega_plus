// ยูกิ Overload — บอสสนามพิเศษ
// วงจรเกิด/AI/คัตซีนอยู่ใน server.js; hook นี้ทำให้สูตรโจมตีปกติกลาง
// รองรับบัฟ/ดีบัฟสากลเหมือนผู้เล่นทั่วไป โดยมีพลังพื้นฐาน 2 หน่วย
module.exports = {
  id: "yuuki",
  attackBaseOverride() {
    return 2;
  },
};
