const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function migrate(retries = 5) {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log(`Running migration: ${file}...`);
      await pool.query(sql);
    }
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
