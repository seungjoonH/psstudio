// 컨트롤러 핸들러에서 현재 사용자 객체를 주입받기 위한 데코레이터입니다.
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthedRequest, RequestUser } from "../guards/auth.guard.js";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (req.currentUser === undefined) {
    throw new Error("currentUser is not set; AuthGuard 누락이거나 가드 실행 순서 문제입니다.");
  }
  return req.currentUser;
});

export const CurrentSessionId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (req.sessionId === undefined) {
    throw new Error("sessionId is not set; AuthGuard 누락입니다.");
  }
  return req.sessionId;
});
