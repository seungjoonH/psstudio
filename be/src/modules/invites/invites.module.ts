// 그룹 초대 도메인 모듈입니다.
import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { InvitesController } from "./invites.controller.js";
import { InvitesPublicController } from "./invites-public.controller.js";
import { InvitesService } from "./invites.service.js";

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => GroupsModule)],
  controllers: [InvitesPublicController, InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
