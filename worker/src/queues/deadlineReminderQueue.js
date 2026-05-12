// deadline 임박 알림 BullMQ consumer와 저장 로직입니다.
import {
  DEADLINE_REMINDER_QUEUE_NAME,
  NOTIFICATION_EVENTS_CHANNEL,
  NOTIFICATION_STREAM_EVENTS,
  NOTIFICATION_TYPES,
} from "@psstudio/shared";
import { Worker } from "bullmq";
import { getDbPool } from "../db.js";
import { getBullRedisConnection, getRedisPublisher } from "../redis.js";

function formatLeadTimeLabel(leadTimeMinutes) {
  if (leadTimeMinutes === 60) return "1시간";
  if (leadTimeMinutes === 1440) return "24시간";
  return `${leadTimeMinutes}분`;
}

export function formatDeadlineReminderTitle(assignmentTitle, leadTimeMinutes) {
  return `"${assignmentTitle}" 과제 마감까지 ${formatLeadTimeLabel(leadTimeMinutes)} 남았습니다.`;
}

async function loadAssignment(pool, assignmentId) {
  const result = await pool.query(
    `
      select
        id,
        group_id as "groupId",
        title,
        due_at as "dueAt"
      from assignments
      where id = $1
        and deleted_at is null
      limit 1
    `,
    [assignmentId],
  );
  return result.rows[0] ?? null;
}

async function loadActiveMemberIds(pool, groupId) {
  const result = await pool.query(
    `
      select user_id as "userId"
      from group_members
      where group_id = $1
        and left_at is null
      order by joined_at asc
    `,
    [groupId],
  );
  return result.rows.map((row) => row.userId);
}

async function insertNotificationIfMissing(pool, params) {
  const { recipientUserId, assignment, leadTimeMinutes, dueAtIso } = params;
  const title = formatDeadlineReminderTitle(assignment.title, leadTimeMinutes);
  const payload = {
    title,
    groupId: assignment.groupId,
    assignmentId: assignment.id,
    leadTimeMinutes,
    dueAt: dueAtIso,
  };
  const identityPayload = {
    assignmentId: assignment.id,
    leadTimeMinutes,
  };
  const result = await pool.query(
    `
      insert into notifications (
        recipient_user_id,
        type,
        payload,
        is_read,
        read_at,
        created_at
      )
      select
        $1,
        $2,
        $3::jsonb,
        false,
        null,
        now()
      where not exists (
        select 1
        from notifications
        where recipient_user_id = $1
          and type = $2
          and deleted_at is null
          and payload @> $4::jsonb
      )
      returning id
    `,
    [
      recipientUserId,
      NOTIFICATION_TYPES.DEADLINE_SOON,
      JSON.stringify(payload),
      JSON.stringify(identityPayload),
    ],
  );
  return {
    id: result.rows[0]?.id ?? null,
    payload,
  };
}

export async function processDeadlineReminderJob(jobData, deps = {}) {
  const pool = deps.pool ?? getDbPool();
  const publisher = deps.publisher ?? getRedisPublisher();
  const assignment = await loadAssignment(pool, jobData.assignmentId);
  if (assignment === null) {
    return { createdCount: 0, skippedReason: "assignment_missing" };
  }
  const currentDueAtIso = new Date(assignment.dueAt).toISOString();
  if (currentDueAtIso !== jobData.dueAtIso) {
    return { createdCount: 0, skippedReason: "due_at_changed" };
  }
  const memberIds = await loadActiveMemberIds(pool, assignment.groupId);
  let createdCount = 0;
  for (const recipientUserId of memberIds) {
    const inserted = await insertNotificationIfMissing(pool, {
      recipientUserId,
      assignment,
      leadTimeMinutes: jobData.leadTimeMinutes,
      dueAtIso: currentDueAtIso,
    });
    if (inserted.id === null) continue;
    createdCount += 1;
    await publisher.publish(
      NOTIFICATION_EVENTS_CHANNEL,
      JSON.stringify({
        event: NOTIFICATION_STREAM_EVENTS.CREATED,
        recipientUserId,
        notificationId: inserted.id,
        notificationType: NOTIFICATION_TYPES.DEADLINE_SOON,
        groupId: assignment.groupId,
        assignmentId: assignment.id,
        leadTimeMinutes: jobData.leadTimeMinutes,
      }),
    );
  }
  return { createdCount };
}

export function startDeadlineReminderWorker() {
  const worker = new Worker(
    DEADLINE_REMINDER_QUEUE_NAME,
    async (job) => processDeadlineReminderJob(job.data),
    {
      connection: getBullRedisConnection(),
      concurrency: 4,
    },
  );
  return worker;
}
