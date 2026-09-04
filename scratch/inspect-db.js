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
  const targetId = 'att_mqvwmu9l_6cgl9rfr';
  try {
    console.log(`=== Searching for ${targetId} ===`);
    
    // Search files_handler
    const files = await client.execute({
      sql: "SELECT * FROM files_handler WHERE attachment_id = ?",
      args: [targetId]
    });
    console.log("files_handler matches:", files.rows);

    // Search work_sessions
    const sessions = await client.execute("SELECT session_id, length(payload_json) as len FROM work_sessions");
    for (const row of sessions.rows) {
      if (row.payload_json && row.payload_json.includes(targetId)) {
        console.log(`Found in work_session: ${row.session_id}`);
      }
    }

    // Search send_jobs
    const jobs = await client.execute("SELECT id, job_id, payload_json FROM send_jobs");
    for (const row of jobs.rows) {
      if (row.payload_json && row.payload_json.includes(targetId)) {
        console.log(`Found in send_job: ${row.job_id}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.close();
  }
}

main();
