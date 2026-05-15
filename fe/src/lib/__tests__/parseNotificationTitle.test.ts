import { describe, expect, it } from "vitest";
import {
  parseAssignmentCreatedTitle,
  parseDeadlineSoonTitle,
  parseReactionTitle,
} from "../parseNotificationTitle";

describe("parseAssignmentCreatedTitle", () => {
  it("과제 등록 알림 제목에서 그룹명·과제명을 추출한다", () => {
    expect(
      parseAssignmentCreatedTitle('병오취뽀 그룹에서 "1909. Remove One Element" 과제가 등록되었습니다.'),
    ).toEqual({
      groupName: "병오취뽀",
      assignmentTitle: "1909. Remove One Element",
    });
  });

  it("형식이 맞지 않으면 null", () => {
    expect(parseAssignmentCreatedTitle("알 수 없는 알림")).toBeNull();
  });
});

describe("parseDeadlineSoonTitle", () => {
  it("과제명이 있는 마감 알림을 파싱한다", () => {
    expect(parseDeadlineSoonTitle('"투 포인터" 과제 마감까지 1시간 남았습니다.')).toEqual({
      assignmentTitle: "투 포인터",
      leadTimeMinutes: 60,
    });
  });

  it("과제명 없는 마감 알림을 파싱한다", () => {
    expect(parseDeadlineSoonTitle("과제 마감까지 24시간 남았습니다.")).toEqual({
      assignmentTitle: null,
      leadTimeMinutes: 1440,
    });
  });
});

describe("parseReactionTitle", () => {
  it("이모지 반응 알림에서 닉네임·이모지를 추출한다", () => {
    expect(parseReactionTitle("레오님이 나의 리뷰 스레드에 👍 이모지를 눌렀습니다.")).toEqual({
      actorNickname: "레오",
      emoji: "👍",
    });
  });
});
