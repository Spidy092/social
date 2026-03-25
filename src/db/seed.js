const bcrypt = require('bcryptjs');
const { pool } = require('./index');
require('dotenv').config();

async function seed() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('ADMIN_EMAIL or ADMIN_PASSWORD missing in .env');
    process.exit(1);
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    
    // UPSERT: Insert or update if email exists
    await pool.query(`
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (email) 
      DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [email, passwordHash]);

    console.log(`Admin user created/updated: ${email}`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
