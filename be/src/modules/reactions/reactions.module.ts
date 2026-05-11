// 이모지 반응 도메인 모듈입니다.
import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { ReactionsController } from "./reactions.controller.js";
import { ReactionsService } from "./reactions.service.js";

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => GroupsModule)],
  controllers: [ReactionsController],
  providers: [ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
