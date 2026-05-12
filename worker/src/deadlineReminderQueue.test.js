// deadline reminder worker consumer의 저장/발행 동작을 검증합니다.
import { NOTIFICATION_STREAM_EVENTS, NOTIFICATION_TYPES } from "@psstudio/shared";
import { describe, expect, it, vi } from "vitest";
import {
  formatDeadlineReminderTitle,
  processDeadlineReminderJob,
} from "./queues/deadlineReminderQueue.js";

describe("formatDeadlineReminderTitle", () => {
  it("1시간 전 알림 제목을 만든다", () => {
    expect(formatDeadlineReminderTitle("투 포인터", 60)).toBe('"투 포인터" 과제 마감까지 1시간 남았습니다.');
  });
});

describe("processDeadlineReminderJob", () => {
  it("현재 dueAt이 job payload와 다르면 저장을 건너뛴다", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: "assignment-1",
            groupId: "group-1",
            title: "기한 변경 과제",
            dueAt: "2026-05-12T10:00:00.000Z",
          },
        ],
      }),
    };
    const publisher = { publish: vi.fn() };

    const result = await processDeadlineReminderJob(
      {
        assignmentId: "assignment-1",
        dueAtIso: "2026-05-12T09:00:00.000Z",
        leadTimeMinutes: 60,
      },
      { pool, publisher },
    );

    expect(result).toEqual({ createdCount: 0, skippedReason: "due_at_changed" });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("활성 멤버별로 알림을 저장하고 SSE 이벤트를 발행한다", async () => {
    const publisher = {
      publish: vi.fn().mockResolvedValue(1),
    };
    const pool = {
      query: vi.fn(async (sql, params) => {
        const statement = String(sql);
        if (statement.includes("from assignments")) {
          return {
            rows: [
              {
                id: "assignment-1",
                groupId: "group-1",
                title: "해시 과제",
                dueAt: "2026-05-12T11:00:00.000Z",
              },
            ],
          };
        }
        if (statement.includes("from group_members")) {
          return {
            rows: [{ userId: "user-1" }, { userId: "user-2" }],
          };
        }
        if (statement.includes("insert into notifications")) {
          return {
            rows: [{ id: `notification-${params[0]}` }],
          };
        }
        throw new Error(`unexpected query: ${statement}`);
      }),
    };

    const result = await processDeadlineReminderJob(
      {
        assignmentId: "assignment-1",
        dueAtIso: "2026-05-12T11:00:00.000Z",
        leadTimeMinutes: 60,
      },
      { pool, publisher },
    );

    expect(result).toEqual({ createdCount: 2 });
    expect(publisher.publish).toHaveBeenCalledTimes(2);
    const payloads = publisher.publish.mock.calls.map((call) => JSON.parse(call[1]));
    expect(payloads).toEqual([
      {
        event: NOTIFICATION_STREAM_EVENTS.CREATED,
        recipientUserId: "user-1",
        notificationId: "notification-user-1",
        notificationType: NOTIFICATION_TYPES.DEADLINE_SOON,
        groupId: "group-1",
        assignmentId: "assignment-1",
        leadTimeMinutes: 60,
      },
      {
        event: NOTIFICATION_STREAM_EVENTS.CREATED,
        recipientUserId: "user-2",
        notificationId: "notification-user-2",
        notificationType: NOTIFICATION_TYPES.DEADLINE_SOON,
        groupId: "group-1",
        assignmentId: "assignment-1",
        leadTimeMinutes: 60,
      },
    ]);
  });
});
