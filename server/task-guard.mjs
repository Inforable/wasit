import { HttpError } from './errors.mjs';

// Called after the request row is locked, before a task writes any domain state.
export async function assertTaskGeneration(tx, {
  requestId, branchId, expectedGeneration, taskId, leaseToken, now = Date.now(),
}) {
  const request = (await tx.query('SELECT generation,archived_at FROM requests WHERE id=$1', [requestId])).rows[0];
  if (!request || request.archived_at != null || (expectedGeneration != null && Number(request.generation) !== Number(expectedGeneration))) {
    throw new HttpError(409, 'stale_task', 'This request was reset or replaced. Discard the expired task.');
  }
  if (taskId != null || leaseToken != null) {
    const task = (await tx.query('SELECT * FROM tasks WHERE id=$1 AND request_id=$2', [taskId, requestId])).rows[0];
    if (!task || task.status !== 'processing' || task.lease_token !== leaseToken ||
        Number(task.lease_until) <= Number(now) || Number(task.generation) !== Number(request.generation) ||
        (branchId != null && task.branch_id !== branchId)) {
      throw new HttpError(409, 'stale_task', 'This task lease has expired. Its result was discarded.');
    }
  }
}
