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

        await axios.get(
            'http://localhost:3003/api/critical-lab/process'
        );

        await axios.get(
            'http://localhost:3003/api/critical-lab/send-telegram'
        );

    } catch (err) {

        console.error(err.message);

    }

});

console.log('✅ Critical Lab Cron Started');
//จบ


app.listen(3003, () => {
  console.log('Server running on port 3003');
});