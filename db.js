const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '192.168.0.98',
  user: 'sa',
  password: 'ha123!#',
  database: 'hos',
  waitForConnections: true,
  connectionLimit: 200,
  queueLimit: 0,
  connectTimeout: 10000,
  charset: 'tis620', // 👈 สำคัญสำหรับภาษาไทย
  enableKeepAlive: true,     // ✅ ป้องกัน connection ตัดกลางคัน
  keepAliveInitialDelay: 0   // ✅ ส่ง keep-alive ทันที
});

module.exports = pool;