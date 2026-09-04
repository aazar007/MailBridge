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
    console.log("=== Active send_jobs ===");
    const jobs = await client.execute("SELECT job_id, scheduled_at, status, label, error FROM send_jobs");
    console.log(jobs.rows);

    console.log("\n=== files_handler entries ===");
    const files = await client.execute("SELECT id, attachment_id, session_id, job_id, chunk_index, chunk_count, filename, length(content_base64) as len, created_at FROM files_handler");
    console.log(files.rows);
  } catch (err) {
    console.error(err);
  } finally {
    client.close();
  }
}

main();
