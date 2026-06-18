require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');//สั่งรันaut
const axios = require('axios');//insert


const app = express();

app.use(cors());
app.use(express.json());


const criticalLabRoute = require('./routes/criticalLab');
const sendMorProm = require('./utils/morpromNotify'); // เพิ่มบรรทัดนี้
app.use('/api/critical-lab', criticalLabRoute);

//รันทุก 1 นาที
cron.schedule('* * * * *', async () => {

    console.log(
        '⏰ Run Critical Lab'
    );

    try {

        const apiUrl = process.env.CRITICAL_LAB_API_URL || 'http://localhost:3009';
        await axios.get(`${apiUrl}/api/critical-lab/process`);

        await axios.get(`${apiUrl}/api/critical-lab/send-telegram`);

    } catch(err) {

        console.error(
            'CRON ERROR',
            err.message
        );

    }

});

console.log('✅ Critical Lab Cron Started');
//จบ


app.listen(3009, () => {
  console.log('Server running on port 3009');
});