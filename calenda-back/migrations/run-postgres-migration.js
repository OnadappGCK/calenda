const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '/tmp/calenda-back.env', override: true });

const sqlFile = process.argv[2] || path.join(__dirname, '20250622000000-multiple-place-types.sql');

const client = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('Connexion à', process.env.DB_HOST, ':', process.env.DB_PORT, '/', process.env.DB_NAME);
  await client.connect();

  const sql = fs.readFileSync(sqlFile, 'utf-8');
  const statements = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    console.log('Exécution :', stmt);
    try {
      await client.query(stmt + ';');
      console.log('OK');
    } catch (err) {
      if (err.message.includes('does not exist')) {
        console.log('Ignoré (colonne/table déjà absente ou déjà renommée) :', err.message);
      } else {
        console.error('Erreur :', err.message);
        throw err;
      }
    }
  }

  await client.end();
  console.log('Migration PostgreSQL terminée.');
}

run().catch((err) => {
  console.error('Échec :', err.message);
  process.exit(1);
});
