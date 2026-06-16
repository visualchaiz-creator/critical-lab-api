require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');//สั่งรันaut
const axios = require('axios');//insert


const app = express();

app.use(cors());
app.use(express.json());


const criticalLabRoute = require('./routes/criticalLab');
app.use('/api/critical-lab', criticalLabRoute);

//รันทุก 1 นาที
cron.schedule('* * * * *', async () => {

    try {

        console.log('⏰ Run Critical Lab');

        // await axios.get(
        //     'http://localhost:3004/api/critical-lab/process'
        // );

        // await axios.get(
        //     'http://localhost:3004/api/critical-lab/send-telegram'
        // );
        // ดึงค่าจาก .env ถ้าไม่มีให้ใช้ http://localhost:3004 เป็นค่าเริ่มต้น (Fallback)
    const apiUrl = process.env.CRITICAL_LAB_API_URL || 'http://localhost:3004';

    await axios.get(`${apiUrl}/api/critical-lab/process`);

    await axios.get(`${apiUrl}/api/critical-lab/send-telegram`);

    } catch (err) {

        console.error(err.message);

    }

});

console.log('✅ Critical Lab Cron Started');
//จบ


app.listen(3004, () => {
  console.log('Server running on port 3004');
});