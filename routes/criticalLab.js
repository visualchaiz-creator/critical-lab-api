const express = require('express');
const router = express.Router();

const db = require('../db');
const sendTelegram = require('../utils/telegramNotify');
const sendMorProm = require('../utils/morpromNotify'); // เพิ่มบรรทัดนี้

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
| Send หมอพร้อม
|--------------------------------------------------------------------------
*/
router.get('/send-telegram', async (req, res) => {

try {

    const [alerts] = await db.query(`
        SELECT *
        FROM critical_lab_alert
        WHERE morprom_sent='N'
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

    const wardGroups = {};

    for (const row of alerts) {

        const ward =
            row.ward || 'OPD/ER';

        if (!wardGroups[ward]) {

            wardGroups[ward] = [];

        }

        wardGroups[ward].push(row);

    }

    let sentCount = 0;

    for (const wardName of Object.keys(wardGroups)) {

        const [configRows] =
        await db.query(`
            SELECT
                client_key,
                secret_key
            FROM critical_lab_morprom_config
            WHERE ward_name=?
            AND active='Y'
            LIMIT 1
        `, [wardName]);

        if (configRows.length === 0) {

            console.log(
                `❌ ไม่พบ Config : ${wardName}`
            );

            continue;

        }

        const clientKey =
            configRows[0].client_key;

        const secretKey =
            configRows[0].secret_key;

        const total =
            wardGroups[wardName].length;

        let message =

`🚨 แจ้งเตือนผล LAB วิกฤติ

🏥 Ward : ${wardName}
📋 จำนวน : ${total} ราย

====================

`;

        const ids = [];

        for (const row of wardGroups[wardName]) {

            let criticalText = '';

            if (
                row.critical_low !== null &&
                Number(row.result_value) <
                Number(row.critical_low)
            ) {

                criticalText =
                    '🔻 ต่ำกว่าค่าวิกฤติ';

            }

            if (
                row.critical_high !== null &&
                Number(row.result_value) >
                Number(row.critical_high)
            ) {

                criticalText =
                    '🔺 สูงกว่าค่าวิกฤติ';

            }

            message +=

`👤 ${row.patient_name}
🆔 HN : ${row.hn}
⚧  เพศ :${row.sex_name} ปี
🎂 อายุ : ${row.age} ปี
🧪 Lab: ${row.lab_items_name}
📈 Result : ${row.result_value}
${criticalText}

`;

            ids.push(row.id);

        }

        console.log(
            `WARD= ${wardName}`
        );

        const sent =
            await sendMorProm(
                clientKey,
                secretKey,
                message
            );

        if (sent) {

            await db.query(`
                UPDATE critical_lab_alert
                SET
                    morprom_sent='Y',
                    morprom_sent_datetime=NOW()
                WHERE id IN (${ids.join(',')})
            `);

            sentCount += ids.length;

            console.log(
                `✅ MorProm ${wardName} : ${ids.length} ราย`
            );

        }

    }

    console.log(
        `🎯 ส่งสำเร็จ ${sentCount} ราย`
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
//GET /api/critical-lab/pending/

router.get('/pending/:ward', async (req, res) => {

    try {

        const ward = req.params.ward;

        const [rows] = await db.query(`
            SELECT *
            FROM critical_lab_alert
            WHERE ward=?
            AND acknowledge_status='N'
            ORDER BY id DESC
        `, [ward]);

        res.json(rows);

    } catch (err) {

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
//ส่งเข้าหมอพร้อม





module.exports = router;