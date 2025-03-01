const pool = require('./db');
const fs = require('fs');

const migration = fs.readFileSync('migration.sql', 'utf8');

(async () => {
  try {
    console.log('Running migration...');
    await pool.query(migration);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    pool.end();
  }
})();
