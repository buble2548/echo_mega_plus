import { io } from "socket.io-client";

// dev: ผ่าน vite proxy ไปหา server :3000 | prod: origin เดียวกับหน้าเว็บ
export const socket = io();
