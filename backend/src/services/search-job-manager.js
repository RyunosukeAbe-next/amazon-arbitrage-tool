const crypto = require('crypto');

const JOB_TTL_MS = Number(process.env.SEARCH_JOB_TTL_MS || 30 * 60 * 1000);
const jobs = new Map();

function toPublicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    userId: job.userId,
    name: job.name,
    status: job.status,
    message: job.message,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    error: job.error,
    result: job.status === 'completed' ? job.result : undefined,
  };
}

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    const updatedAt = new Date(job.updatedAt || job.createdAt).getTime();
    if (Number.isFinite(updatedAt) && now - updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

function updateJob(job, updates) {
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  return job;
}

function createSearchJob(userId, name, params, runner) {
  cleanupJobs();

  const id = `search_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();
  const job = {
    id,
    userId,
    name,
    params,
    status: 'waiting',
    message: '検索ジョブを開始待ちです。',
    createdAt: now,
    updatedAt: now,
    cancelled: false,
  };
  jobs.set(id, job);

  setImmediate(async () => {
    if (job.cancelled) {
      updateJob(job, { status: 'cancelled', message: 'キャンセルされました。', completedAt: new Date().toISOString() });
      return;
    }

    updateJob(job, { status: 'fetching', message: '検索処理を開始しました。' });
    try {
      const result = await runner({
        isCancelled: () => job.cancelled,
        update: (message) => updateJob(job, { message }),
      });

      if (job.cancelled) {
        updateJob(job, { status: 'cancelled', message: 'キャンセルされました。', completedAt: new Date().toISOString() });
        return;
      }

      updateJob(job, {
        status: 'completed',
        message: result?.message || '検索が完了しました。',
        result,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (job.cancelled) {
        updateJob(job, { status: 'cancelled', message: 'キャンセルされました。', completedAt: new Date().toISOString() });
        return;
      }

      updateJob(job, {
        status: 'error',
        message: error.message || '検索中にエラーが発生しました。',
        error: error.message || String(error),
        completedAt: new Date().toISOString(),
      });
    }
  });

  return toPublicJob(job);
}

function getSearchJob(userId, jobId) {
  cleanupJobs();
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  return toPublicJob(job);
}

function cancelSearchJob(userId, jobId) {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;

  if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
    jobs.delete(jobId);
    return toPublicJob({ ...job, status: 'cancelled', message: 'ジョブを削除しました。' });
  }

  job.cancelled = true;
  updateJob(job, { status: 'cancelled', message: 'キャンセル要求を受け付けました。', completedAt: new Date().toISOString() });
  return toPublicJob(job);
}

module.exports = {
  createSearchJob,
  getSearchJob,
  cancelSearchJob,
};
