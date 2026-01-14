const { spawnSync } = require('child_process');
const path = require('path');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — cannot run migrations');
    process.exit(1);
  }

  console.log('Running migrations (node-pg-migrate) ...');

  // Prefer local bin, fallback to npx
  const localBin = path.join(__dirname, '..', 'node_modules', '.bin', 'node-pg-migrate');
  const useNpx = process.platform === 'win32' ? true : false;

  const cmd = useNpx ? 'npx' : localBin;
  const args = useNpx ? ['node-pg-migrate', 'up', '--migrations-dir', 'migrations'] : ['up', '--migrations-dir', 'migrations'];

  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: path.join(__dirname, '..'), shell: useNpx });

  if (result.error) {
    console.error('Migration process failed:', result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('Migrations exited with code', result.status);
    process.exit(result.status || 1);
  }

  console.log('Migrations completed successfully.');
}

run();
