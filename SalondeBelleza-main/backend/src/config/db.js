require('dotenv').config();

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('ERROR: falta la variable de entorno DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: false
});

module.exports = pool;
