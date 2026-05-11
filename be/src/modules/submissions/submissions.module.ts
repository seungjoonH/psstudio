// 제출 도메인 모듈입니다.
import { forwardRef, Module } from "@nestjs/common";
import { AssignmentsModule } from "../assignments/assignments.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { ReactionsModule } from "../reactions/reactions.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { SubmissionsController } from "./submissions.controller.js";
import { SubmissionsService } from "./submissions.service.js";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => GroupsModule),
    forwardRef(() => AssignmentsModule),
    forwardRef(() => ReactionsModule),
    forwardRef(() => ReviewsModule),
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
