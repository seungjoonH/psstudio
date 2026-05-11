// 인증/사용자/그룹/문서/헬스 API를 묶는 루트 모듈입니다.
import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { DocsController } from "./docs/docs.controller.js";
import { AssignmentsModule } from "./assignments/assignments.module.js";
import { EmailModule } from "./email/email.module.js";
import { GroupsModule } from "./groups/groups.module.js";
import { HealthModule } from "./health/health.module.js";
import { InvitesModule } from "./invites/invites.module.js";
import { ReactionsModule } from "./reactions/reactions.module.js";
import { ReviewsModule } from "./reviews/reviews.module.js";
import { SubmissionsModule } from "./submissions/submissions.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    EmailModule,
    AuthModule,
    UsersModule,
    GroupsModule,
    InvitesModule,
    AssignmentsModule,
    SubmissionsModule,
    ReactionsModule,
    ReviewsModule,
    HealthModule,
  ],
  controllers: [DocsController],
})
export class AppModule {}
