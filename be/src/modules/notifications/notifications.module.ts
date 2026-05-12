// 알림 SSE 모듈입니다.
import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsStreamService } from "./notifications-stream.service.js";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [NotificationsController],
  providers: [NotificationsStreamService],
  exports: [NotificationsStreamService],
})
export class NotificationsModule {}
