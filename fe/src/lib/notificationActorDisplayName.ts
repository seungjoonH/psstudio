// 알림 DTO에서 아바타·표시용 행위자 이름을 만듭니다.
import type { HomeRecentNotification } from "../auth/api.server";

export function notificationActorDisplayName(
  n: Pick<HomeRecentNotification, "actorNickname" | "title">,
): string {
  const fromApi = n.actorNickname?.trim();
  if (fromApi !== undefined && fromApi.length > 0) return fromApi;
  const m = /^(.+?)님이/.exec(n.title.trim());
  const fromTitle = m?.[1]?.trim();
  if (fromTitle !== undefined && fromTitle.length > 0) return fromTitle;
  return "?";
}
