require('dotenv').config();

const sendTelegram = require('./utils/telegramNotify');

async function test() {

    const result = await sendTelegram(
        '-4746014796',
        '🚨 ทดสอบ Critical Lab'
    );

    console.log(result);

}

test();