const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function migrate(retries = 5) {
  try {
    const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration: 001_initial.sql...');
    await pool.query(sql);
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    if (retries > 0) {
      console.log(`Database not ready, retrying in 2 seconds... (${retries} retries left)`);
      setTimeout(() => migrate(retries - 1), 2000);
    } else {
      console.error('Migration failed after multiple retries:', err);
      process.exit(1);
    }
  }
}

migrate();
