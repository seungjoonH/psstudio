// 저장된 알림 제목 문자열에서 표시용 변수를 추출합니다.

export type ParsedAssignmentCreated = {
  groupName: string;
  assignmentTitle: string;
};

export type ParsedDeadlineSoon = {
  assignmentTitle: string | null;
  leadTimeMinutes: number | null;
};

export type ParsedReaction = {
  actorNickname: string;
  emoji: string;
};

export function parseAssignmentCreatedTitle(title: string): ParsedAssignmentCreated | null {
  const match = /^(.+?) 그룹에서 "(.+?)" 과제가 등록되었습니다\.$/.exec(title.trim());
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const groupName = match[1].trim();
  const assignmentTitle = match[2].trim();
  if (groupName.length === 0 || assignmentTitle.length === 0) return null;
  return { groupName, assignmentTitle };
}

export function parseDeadlineSoonTitle(title: string): ParsedDeadlineSoon | null {
  const trimmed = title.trim();
  const withAssignment = /^"(.+?)" 과제 마감까지 (.+?) 남았습니다\.$/.exec(trimmed);
  if (withAssignment?.[1] !== undefined && withAssignment[2] !== undefined) {
    const assignmentTitle = withAssignment[1].trim();
    if (assignmentTitle.length === 0) return null;
    return {
      assignmentTitle,
      leadTimeMinutes: parseLeadTimeLabelKo(withAssignment[2].trim()),
    };
  }
  const withoutAssignment = /^과제 마감까지 (.+?) 남았습니다\.$/.exec(trimmed);
  if (withoutAssignment?.[1] !== undefined) {
    return {
      assignmentTitle: null,
      leadTimeMinutes: parseLeadTimeLabelKo(withoutAssignment[1].trim()),
    };
  }
  return null;
}

export function parseReactionTitle(title: string): ParsedReaction | null {
  const match = /^(.+?)님이 나의 리뷰 스레드에 (.+?) 이모지를 눌렀습니다\.$/.exec(title.trim());
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const actorNickname = match[1].trim();
  const emoji = match[2].trim();
  if (actorNickname.length === 0 || emoji.length === 0) return null;
  return { actorNickname, emoji };
}

function parseLeadTimeLabelKo(label: string): number | null {
  if (label === "1시간") return 60;
  if (label === "24시간") return 1440;
  const minutesMatch = /^(\d+)분$/.exec(label);
  if (minutesMatch?.[1] !== undefined) {
    const minutes = Number.parseInt(minutesMatch[1], 10);
    return Number.isFinite(minutes) ? minutes : null;
  }
  return null;
}
