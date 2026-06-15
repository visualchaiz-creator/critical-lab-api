const express = require('express');
const router = express.Router();

const db = require('../db');
const sendTelegram = require('../utils/telegramNotify');

/*
|--------------------------------------------------------------------------
| ดูรายการ Alert
|--------------------------------------------------------------------------
*/
router.get('/', async (req, res) => {

    try {

        const [rows] = await db.query(`
            SELECT *
            FROM critical_lab_alert
            ORDER BY id DESC
            LIMIT 200
        `);

        res.json({
            ok: true,
            total: rows.length,
            data: rows
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            ok: false,
            error: err.message
        });

    }

});


/*
|--------------------------------------------------------------------------
| Process Critical Lab
|--------------------------------------------------------------------------
*/
router.get('/process', async (req, res) => {

    try {

        const sql = `
        SELECT

            h.lab_order_number,
            h.hn,
            h.vn,

            CONCAT(
                p.pname,
                p.fname,
                ' ',
                p.lname
            ) AS patient_name,

            CASE
                WHEN p.sex='1' THEN 'ชาย'
                WHEN p.sex='2' THEN 'หญิง'
                ELSE '-'
            END AS sex_name,

            TIMESTAMPDIFF(
                YEAR,
                p.birthday,
                CURDATE()
            ) AS age,

            COALESCE(
                w.name,
                'OPD/ER'
            ) AS ward_name,

            h.report_date,
            h.report_time,

            o.lab_items_code,
            o.lab_order_result,

            r.lab_items_name,
            r.critical_low,
            r.critical_high

        FROM lab_head h

        INNER JOIN lab_order o
            ON h.lab_order_number=o.lab_order_number

        INNER JOIN critical_lab_rule r
            ON r.lab_items_code=o.lab_items_code

        LEFT JOIN patient p
            ON p.hn=h.hn

        LEFT JOIN an_stat a
            ON a.an=h.vn

        LEFT JOIN ward w
            ON w.ward=a.ward

        WHERE
            r.active='Y'

            AND h.report_date >= DATE_SUB(
                CURDATE(),
                INTERVAL 1 DAY
            )
        `;

        const [rows] = await db.query(sql);

        let newAlerts = 0;

        for (const row of rows) {

            const value = parseFloat(
                String(row.lab_order_result)
                .replace(/,/g, '')
            );

            if (isNaN(value)) {
                continue;
            }

            let isCritical = false;

            if (
                row.critical_low !== null &&
                value < Number(row.critical_low)
            ) {
                isCritical = true;
            }

            if (
                row.critical_high !== null &&
                value > Number(row.critical_high)
            ) {
                isCritical = true;
            }

            if (!isCritical) {
                continue;
            }

            const [exists] = await db.query(
                `
                SELECT id
                FROM critical_lab_alert
                WHERE
                    lab_order_number=?
                    AND lab_items_code=?
                LIMIT 1
                `,
                [
                    row.lab_order_number,
                    row.lab_items_code
                ]
            );

            if (exists.length > 0) {
                continue;
            }

            await db.query(
                `
                INSERT INTO critical_lab_alert
                (
                    lab_order_number,
                    hn,
                    patient_name,
                    sex_name,
                    age,
                    vn,
                    ward,

                    lab_items_code,
                    lab_items_name,

                    result_value,

                    critical_low,
                    critical_high,

                    alert_datetime,

                    status,
                    telegram_sent
                )
                VALUES
                (
                    ?,?,?,?,?,?,?,
                    ?,?,
                    ?,
                    ?,?,
                    NOW(),
                    'NEW',
                    'N'
                )
                `,
                [
                    row.lab_order_number,
                    row.hn,
                    row.patient_name,
                    row.sex_name,
                    row.age,
                    row.vn,
                    row.ward_name,

                    row.lab_items_code,
                    row.lab_items_name,

                    value,

                    row.critical_low,
                    row.critical_high
                ]
            );

            newAlerts++;

        }

        res.json({
            ok: true,
            totalRows: rows.length,
            newAlerts
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            ok: false,
            error: err.message
        });

    }

});


/*
|--------------------------------------------------------------------------
| Send Telegram
|--------------------------------------------------------------------------
*/
router.get('/send-telegram', async (req, res) => {

    try {

        const [alerts] = await db.query(`
            SELECT *
            FROM critical_lab_alert
            WHERE telegram_sent='N'
            ORDER BY ward,id
            LIMIT 50
        `);
        console.log(
    `📨 พบรายการรอส่ง ${alerts.length} ราย`
);

        if (alerts.length === 0) {

            return res.json({
                ok: true,
                total: 0,
                sent: 0
            });

        }

        // Group By Ward
        const wardGroups = {};

        for (const row of alerts) {

            const ward = row.ward || 'OPD/ER';

            if (!wardGroups[ward]) {
                wardGroups[ward] = [];
            }

            wardGroups[ward].push(row);

        }

        let sentCount = 0;

        function chunkArray(array, size) {

            const result = [];

            for (let i = 0; i < array.length; i += size) {
                result.push(
                    array.slice(i, i + size)
                );
            }

            return result;

        }

        for (const wardName of Object.keys(wardGroups)) {

            const [chatRows] = await db.query(
                `
                SELECT chat_id
                FROM ward_telegram
                WHERE ward_name=?
                LIMIT 1
                `,
                [wardName]
            );

            if (chatRows.length === 0) {

                console.log(
                    `❌ ไม่พบ Chat ID : ${wardName}`
                );

                continue;

            }

            const chatId = chatRows[0].chat_id;

            const groups = chunkArray(
                wardGroups[wardName],
                5
            );

            for (const group of groups) {

                let message =
`🚨 CRITICAL LAB ALERT

Ward : ${wardName}

จำนวน ${group.length} ราย

`;

                const ids = [];

                for (const row of group) {

                    message +=
`HN : ${row.hn}
ชื่อ : ${row.patient_name}
เพศ : ${row.sex_name}
อายุ : ${row.age} ปี

Lab : ${row.lab_items_name}
Result : ${row.result_value}
เกณฑ์วิกฤติ :
-------------------------

`;

                    ids.push(row.id);

                }

                const sent =
                    await sendTelegram(
                        chatId,
                        message
                    );

                if (sent) {

                    await db.query(`
                        UPDATE critical_lab_alert
                        SET
                            telegram_sent='Y',
                            telegram_sent_datetime=NOW()
                        WHERE id IN (${ids.join(',')})
                    `);

                    sentCount += group.length;

                    console.log(
                        `✅ ส่ง Ward ${wardName} จำนวน ${group.length} ราย`
                    );

                }

                // หน่วง 3 วินาที
                await new Promise(
                    resolve =>
                        setTimeout(
                            resolve,
                            3000
                        )
                );

            }

        }
console.log(
    `✅ ส่งสำเร็จ ${sentCount} ราย`
);
        res.json({

            ok: true,
            total: alerts.length,
            sent: sentCount

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            ok: false,
            error: err.message

        });

    }

});

//////////////ส่งให้ C#
//เพิ่ม API ใหม่
//GET Pending
//GET /api/critical-lab/pending/ตึกอายุรกรรมชาย 2

router.get('/pending/:ward', async (req, res) => {

    try {

        const ward = req.params.ward;

        const [rows] = await db.query(`
            SELECT *
            FROM critical_lab_alert
            WHERE ward=?
            AND acknowledge_status='N'
            ORDER BY id DESC
        `,[ward]);

        res.json(rows);

    } catch(err){

        res.status(500).json({
            error: err.message
        });

    }

});

//API เมื่อกดปุ่มรับทราบ บน c#
//PUT /api/critical-lab/ack/123
// router.put('/ack/:id', async (req,res)=>{

//     const id = req.params.id;

//     await db.query(`
//         UPDATE critical_lab_alert
//         SET
//             acknowledge_status='Y',
//             acknowledge_datetime=NOW()
//         WHERE id=?
//     `,[id]);

//     res.json({
//         ok:true
//     });

// });

router.put('/ack/:id', async (req, res) => {

    try {

        const id = req.params.id;

        await db.query(`
            UPDATE critical_lab_alert
            SET
                acknowledge_status='Y',
                acknowledge_datetime=NOW()
            WHERE id=?
        `, [id]);

        res.json({
            ok: true
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            ok: false,
            error: err.message
        });

    }

});



module.exports = router;