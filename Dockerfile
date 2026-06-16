# 1. ใช้ Base Image เป็น Node.js LTS
FROM node:20-alpine

# 2. สร้างโฟลเดอร์สำหรับทำงานใน Container
WORKDIR /usr/src/app

# 3. คัดลอก package.json และ package-lock.json เข้าไปก่อนเพื่อติดตั้ง dependencies
COPY package*.json ./

# 4. ติดตั้ง dependencies (ใช้ npm ci สำหรับ production)
RUN npm install

# 5. คัดลอกโค้ดทั้งหมดของโปรเจกต์เข้าไป
COPY . .

# 6. กำหนด Port ที่ต้องการให้ Container เปิดใช้งาน (สมมติว่าเป็น 3000)
EXPOSE 3004

# 7. คำสั่งสำหรับรันแอปพลิเคชัน
CMD ["node", "server.js"]