require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://db_user:E4Yqv5Z3KWZjg3pZHwSDABKOvChcJQcL@dpg-cv8lknan91rc738ke5cg-a:5432/food_delivery_db_lxa6',
  ssl: {
    rejectUnauthorized: false,
  }
});

pool.connect()
  .then(() => console.log("✅ PostgreSQL Connected!"))
  .catch(err => console.error("❌ Database Connection Error:", err));

module.exports = pool;
