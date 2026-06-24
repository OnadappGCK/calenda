const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', 'calenda.sqlite');
const sqlFile = process.argv[3] || path.join(__dirname, '20250622000000-multiple-place-types.sql');

if (!fs.existsSync(dbPath)) {
  console.log(`Base SQLite introuvable : ${dbPath}`);
  process.exit(0);
}

const db = new sqlite3.Database(dbPath);

const sql = fs.readFileSync(sqlFile, 'utf-8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

const statements = sql
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

db.serialize(() => {
  for (const stmt of statements) {
    console.log('Exécution :', stmt);
    db.run(stmt + ';', (err) => {
      if (err) {
        console.error('Erreur :', err.message);
      } else {
        console.log('OK');
      }
    });
  }
});

db.close((err) => {
  if (err) {
    console.error('Erreur fermeture :', err.message);
  } else {
    console.log('Migration SQLite terminée.');
  }
});
