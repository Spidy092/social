const os = require('os');
const { pool } = require('../db');
const { publishPost } = require('./publishService');

const WORKER_ID = `${os.hostname()}-${process.pid}`;

async function enqueuePublication(postId, runAt = new Date(), db = pool, options = {}) {
  const force = Boolean(options.force);
  await db.query(
    `INSERT INTO publication_jobs (post_id, run_at)
     VALUES ($1, $2)
     ON CONFLICT (post_id) DO UPDATE SET
       run_at = CASE
         WHEN publication_jobs.status = 'processing' THEN publication_jobs.run_at
         WHEN $3 THEN EXCLUDED.run_at
         ELSE LEAST(publication_jobs.run_at, EXCLUDED.run_at)
       END,
       status = CASE
         WHEN publication_jobs.status = 'processing' THEN publication_jobs.status
         WHEN publication_jobs.status = 'completed' AND NOT $3 THEN publication_jobs.status
         ELSE 'queued'
       END,
       attempts = CASE WHEN $3 THEN 0 ELSE publication_jobs.attempts END,
       locked_at = CASE WHEN $3 THEN NULL ELSE publication_jobs.locked_at END,
       lock_owner = CASE WHEN $3 THEN NULL ELSE publication_jobs.lock_owner END,
       last_error = CASE WHEN $3 THEN NULL ELSE publication_jobs.last_error END,
       updated_at = NOW()`,
    [postId, runAt, force]
  );
}

async function recoverStalledJobs() {
  await pool.query(
    `UPDATE publication_jobs
     SET status = 'retry', locked_at = NULL, lock_owner = NULL, updated_at = NOW()
     WHERE status = 'processing' AND locked_at < NOW() - INTERVAL '10 minutes'`
  );
}

async function enqueueDuePosts() {
  await pool.query(
    `INSERT INTO publication_jobs (post_id, run_at)
     SELECT id, COALESCE(scheduled_at, NOW())
     FROM posts
     WHERE status = 'pending' AND scheduled_at <= NOW()
     ON CONFLICT (post_id) DO UPDATE SET
       run_at = LEAST(publication_jobs.run_at, EXCLUDED.run_at),
       status = CASE
         WHEN publication_jobs.status = 'processing' THEN publication_jobs.status
         ELSE 'queued'
       END,
       locked_at = CASE WHEN publication_jobs.status = 'processing' THEN publication_jobs.locked_at ELSE NULL END,
       lock_owner = CASE WHEN publication_jobs.status = 'processing' THEN publication_jobs.lock_owner ELSE NULL END,
       updated_at = NOW()`
  );
}

async function claimNextJob() {
  const { rows } = await pool.query(
    `WITH next_job AS (
       SELECT id FROM publication_jobs
       WHERE status IN ('queued', 'retry') AND run_at <= NOW()
       ORDER BY run_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE publication_jobs pj
     SET status = 'processing', attempts = attempts + 1, locked_at = NOW(), lock_owner = $1, updated_at = NOW()
     FROM next_job
     WHERE pj.id = next_job.id
     RETURNING pj.*`,
    [WORKER_ID]
  );
  return rows[0] || null;
}

async function completeJob(job) {
  await pool.query(
    `UPDATE publication_jobs
     SET status = 'completed', locked_at = NULL, lock_owner = NULL, last_error = NULL, updated_at = NOW()
     WHERE id = $1`,
    [job.id]
  );
}

async function retryOrFailJob(job, errorMessage) {
  const shouldRetry = job.attempts < job.max_attempts;
  const delayMinutes = Math.min(2 ** Math.max(job.attempts - 1, 0), 60);
  await pool.query('UPDATE posts SET status = $1 WHERE id = $2', [shouldRetry ? 'pending' : 'failed', job.post_id]);
  await pool.query(
    `UPDATE publication_jobs
     SET status = $1,
         run_at = CASE WHEN $1 = 'retry' THEN NOW() + ($2 || ' minutes')::interval ELSE run_at END,
         locked_at = NULL,
         lock_owner = NULL,
         last_error = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [shouldRetry ? 'retry' : 'failed', delayMinutes, errorMessage, job.id]
  );
}

async function processNextJob() {
  const job = await claimNextJob();
  if (!job) return false;
  try {
    const result = await publishPost(job.post_id);
    if (result.allOk) await completeJob(job);
    else await retryOrFailJob(job, result.error || 'Partial publish failure');
  } catch (err) {
    await retryOrFailJob(job, err.message);
  }
  return true;
}

module.exports = { enqueuePublication, recoverStalledJobs, enqueueDuePosts, processNextJob };

