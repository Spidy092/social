const cron = require('node-cron');
const { recoverStalledJobs, enqueueDuePosts, processNextJob } = require('../services/publicationQueue');

function startScheduler() {
  cron.schedule('*/15 * * * * *', async () => {
    try {
      await recoverStalledJobs();
      await enqueueDuePosts();
      while (await processNextJob()) {
        // Drain currently available jobs before the next tick.
      }
    } catch (err) {
      console.error('[scheduler] cron error:', err.message);
    }
  });
  console.log('[scheduler] started — checking every 15s');
}

module.exports = { startScheduler };
