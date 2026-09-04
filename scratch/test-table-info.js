const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  }
});

const client = createClient({
  url: env.TURSO_DATABASE_URL.replace('libsql://', 'https://'),
  authToken: env.TURSO_AUTH_TOKEN,
});

async function main() {
  try {
    const res = await client.execute("PRAGMA table_info(files_handler)");
    console.log("Rows returned by PRAGMA table_info:", res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    client.close();
  }
}

main();
