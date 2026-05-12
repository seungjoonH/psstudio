// 알림 SSE 스트림 엔드포인트를 제공합니다.
import { Controller, Dependencies, Req, Sse, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Observable } from "rxjs";
import { startWith } from "rxjs/operators";
import type { MessageEvent } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { NotificationsStreamService } from "./notifications-stream.service.js";

@Controller("api/v1/notifications")
@UseGuards(AuthGuard)
@Dependencies(NotificationsStreamService)
export class NotificationsController {
  constructor(private readonly notificationsStream: NotificationsStreamService) {}

  @Sse("stream")
  stream(
    @CurrentUser() me: { id: string },
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const stream = this.notificationsStream.register(me.id);
    req.on("close", () => {
      this.notificationsStream.unregister(me.id, stream);
    });
    return stream.pipe(
      startWith({
        type: "ready",
        data: { ok: true },
      }),
    );
  }
}
