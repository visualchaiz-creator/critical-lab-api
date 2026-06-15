const axios = require('axios');

async function sendTelegram(chatId, message) {

    try {

        const token =
            process.env.TELEGRAM_BOT_TOKEN;

        if (!token) {

            console.error(
                '❌ TELEGRAM_BOT_TOKEN not found'
            );

            return false;

        }

        const url =
            `https://api.telegram.org/bot${token}/sendMessage`;

        await axios.post(url, {

            chat_id: chatId,
            text: message

        });

        console.log(
            `✅ Telegram Sent -> ${chatId}`
        );

        return true;

    } catch (err) {

        console.error(
            '❌ Telegram Error:'
        );

        console.error(
            err.response?.data || err.message
        );

        // Telegram Flood Control
        if (
            err.response?.data?.error_code === 429
        ) {

            const retryAfter =
                err.response.data.parameters.retry_after;

            console.log(
                `⏳ Telegram Limit รอ ${retryAfter} วินาที`
            );

            await new Promise(resolve =>
                setTimeout(
                    resolve,
                    retryAfter * 1000
                )
            );

            return await sendTelegram(
                chatId,
                message
            );

        }

        return false;

    }

}
module.exports = sendTelegram;