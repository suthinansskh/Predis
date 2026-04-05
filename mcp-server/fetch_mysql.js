import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import 'dotenv/config';

async function main() {
    const host = process.env.MYSQL_HOST || '14.11.0.3';
    const user = process.env.MYSQL_USER || 'drug_queue';
    const password = process.env.MYSQL_PASSWORD || 'drug_queue@drug_queue';
    const database = process.env.MYSQL_DATABASE || 'hos';

    console.log(`Connecting to database ${host}...`);
    const connection = await mysql.createConnection({
        host,
        user,
        password,
        database
    });

    console.log("Connected. Executing query...");

    const [rows, fields] = await connection.execute(
        "SELECT * FROM `itemlist` WHERE `ItemType` IN ('ITEM_IN1', 'ITEM_IN2', 'ITEM_IN3') AND `no_use` LIKE '%0%'"
    );

    console.log(`Fetched ${rows.length} rows.`);

    // Save raw data
    await fs.writeFile('../drug_list_raw.json', JSON.stringify(rows, null, 2));
    console.log("Saved raw data to ../drug_list_raw.json");

    // Transform to app format
    const transformed = rows.map(row => ({
        drugCode: (row.itemcode || '').trim(),
        drugName: (row.Name || '').trim(),
        group: row.ItemType || '',
        had: row.high_alert_drug === 1 ? 'High' : 'Regular',
        status: String(row.no_use) === '0' ? 'Active' : 'Inactive',
        unit: (row.UnitName || '').trim(),
        strength: (row.strength || '').trim(),
        dosageForm: (row.dosage_form || '').trim(),
        tmtCode: (row.tmt_code || '').trim(),
        unitPrice: row.UnitPrice || 0
    }));

    await fs.writeFile('../drug_list.json', JSON.stringify(transformed, null, 2));
    console.log(`Saved ${transformed.length} transformed drugs to ../drug_list.json`);

    await connection.end();
}

main().catch(console.error);
