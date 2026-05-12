// deadline 임박 알림 BullMQ producer를 제공합니다.
import {
  buildDeadlineReminderJobId,
  DEADLINE_REMINDER_LEAD_TIMES_MINUTES,
  DEADLINE_REMINDER_QUEUE_NAME,
  type DeadlineReminderJobData,
} from "@psstudio/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { ENV } from "../../config/env.js";

let cachedConnection: Redis | null = null;
let cachedQueue: Queue<DeadlineReminderJobData> | null = null;

function getBullConnection(): Redis {
  if (cachedConnection === null) {
    cachedConnection = new Redis(ENV.redisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return cachedConnection;
}

export function getDeadlineReminderQueue(): Queue<DeadlineReminderJobData> {
  if (cachedQueue === null) {
    cachedQueue = new Queue<DeadlineReminderJobData>(DEADLINE_REMINDER_QUEUE_NAME, {
      connection: getBullConnection(),
    });
  }
  return cachedQueue;
}

export function computeDeadlineReminderDelayMs(
  dueAt: Date,
  leadTimeMinutes: number,
  nowMs: number = Date.now(),
): number | null {
  const dueAtMs = dueAt.getTime();
  if (Number.isNaN(dueAtMs) || dueAtMs <= nowMs) return null;
  const triggerAtMs = dueAtMs - leadTimeMinutes * 60_000;
  const delayMs = triggerAtMs - nowMs;
  return delayMs > 0 ? delayMs : null;
}

export async function removeAssignmentDeadlineReminderJobs(assignmentId: string): Promise<void> {
  const queue = getDeadlineReminderQueue();
  for (const leadTimeMinutes of DEADLINE_REMINDER_LEAD_TIMES_MINUTES) {
    const job = await queue.getJob(buildDeadlineReminderJobId(assignmentId, leadTimeMinutes));
    if (job !== null && job !== undefined) {
      await job.remove();
    }
  }
}

export async function syncAssignmentDeadlineReminderJobs(
  assignmentId: string,
  dueAt: Date,
): Promise<void> {
  const queue = getDeadlineReminderQueue();
  await removeAssignmentDeadlineReminderJobs(assignmentId);
  const dueAtIso = dueAt.toISOString();
  for (const leadTimeMinutes of DEADLINE_REMINDER_LEAD_TIMES_MINUTES) {
    const delay = computeDeadlineReminderDelayMs(dueAt, leadTimeMinutes);
    if (delay === null) continue;
    await queue.add(
      DEADLINE_REMINDER_QUEUE_NAME,
      {
        assignmentId,
        dueAtIso,
        leadTimeMinutes,
      },
      {
        jobId: buildDeadlineReminderJobId(assignmentId, leadTimeMinutes),
        delay,
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    );
  }
}

export async function closeDeadlineReminderQueue(): Promise<void> {
  if (cachedQueue !== null) {
    await cachedQueue.close();
    cachedQueue = null;
  }
  if (cachedConnection !== null) {
    await cachedConnection.quit();
    cachedConnection = null;
  }
}
