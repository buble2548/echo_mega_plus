import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// ระหว่าง dev: React รันที่ :5173 แล้ว proxy /socket.io ไปหา server ที่ :3000
// ตอน build: ออกไฟล์ไปที่ dist/ ให้ server (Express) เสิร์ฟเอง
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
