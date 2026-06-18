const axios = require('axios');

async function sendMorProm(
clientKey,
secretKey,
message
) {


try {

    const payload = {
        datas: ["3341300123038"],
        messages: [
            {
                type: "text",
                text: message
            }
        ]
    };

    const response = await axios.post(
    'https://morpromt2f.moph.go.th/api/notify/send',
    payload,
    {
        headers: {
    'client-key': clientKey,
    'secret-key': secretKey,
    'Content-Type': 'application/json'
}
    }
);

    console.log(
        '📱 MorProm Success:',
        response.data
    );

    return true;

} catch (err) {

    console.error(
        '❌ MorProm Error:',
        err.response?.data || err.message
    );

    return false;

}


}

module.exports = sendMorProm;
