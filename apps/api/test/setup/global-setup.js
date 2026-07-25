// Runs once before all suites: ensure the test DB exists and is migrated.
// Plain JS so jest can load it without a TS transform.
const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

module.exports = async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes('keepsake_test')) {
    throw new Error(`Refusing to run tests: DATABASE_URL is not the test DB (${url})`);
  }

  // Create the test database (ignore if it already exists).
  try {
    execSync(
      'docker exec keepsake-postgres psql -U keepsake -d keepsake -c "CREATE DATABASE keepsake_test"',
      { stdio: 'ignore' },
    );
  } catch {
    /* already exists */
  }

  // Apply migrations to the test DB (DATABASE_URL overrides prisma.config.ts's dotenv default).
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
};
