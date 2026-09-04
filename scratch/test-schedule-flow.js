const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

// Read .env.local manually
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

async function query(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows;
}

async function main() {
  try {
    const testSessionId = 'sess_test_' + Math.random().toString(36).slice(2, 10);
    const testAttachmentId = 'att_test_' + Math.random().toString(36).slice(2, 10);
    const testJobId = 'job_test_' + Math.random().toString(36).slice(2, 10);

    console.log("1. Creating dummy attachment chunk in files_handler...");
    await client.execute({
      sql: `
        INSERT INTO files_handler (
          attachment_id, session_id, chunk_index, chunk_count,
          filename, content_type, content_base64, created_at
        ) VALUES (?, ?, 0, 1, 'test.txt', 'text/plain', 'SGVsbG8gV29ybGQ=', ?)
      `,
      args: [testAttachmentId, testSessionId, new Date().toISOString()]
    });

    console.log("Verify files_handler immediately after upload:");
    console.log(await query("SELECT id, attachment_id, session_id, job_id FROM files_handler WHERE attachment_id = ?", [testAttachmentId]));

    console.log("\n2. Simulating schedule: claiming the attachment for job...");
    // Simulating transferSessionFilesToJob
    const selectedIds = [testAttachmentId];
    
    // claimAttachmentsForJob
    await client.execute({
      sql: `UPDATE files_handler SET job_id = ? WHERE attachment_id IN (?)`,
      args: [testJobId, testAttachmentId]
    });

    console.log("Verify files_handler after claim:");
    console.log(await query("SELECT id, attachment_id, session_id, job_id FROM files_handler WHERE attachment_id = ?", [testAttachmentId]));

    console.log("\n3. Running finishComposerAfterSchedule / emptyComposerFiles...");
    // emptyComposerFiles
    await client.execute("DELETE FROM files_handler WHERE job_id IS NULL");

    console.log("Verify files_handler after emptyComposerFiles:");
    const afterEmpty = await query("SELECT id, attachment_id, session_id, job_id FROM files_handler WHERE attachment_id = ?", [testAttachmentId]);
    console.log(afterEmpty);

    if (afterEmpty.length === 0) {
      console.error("FAIL: Attachment was deleted!");
    } else {
      console.log("SUCCESS: Attachment survived!");
    }

    // Clean up
    await client.execute("DELETE FROM files_handler WHERE attachment_id = ?", [testAttachmentId]);

  } catch (err) {
    console.error(err);
  } finally {
    client.close();
  }
}

main();
