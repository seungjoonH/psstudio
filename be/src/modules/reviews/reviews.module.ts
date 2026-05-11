// 코드 리뷰 답글 도메인 모듈입니다.
import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { ReactionsModule } from "../reactions/reactions.module.js";
import { ReviewsController } from "./reviews.controller.js";
import { ReviewsService } from "./reviews.service.js";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => GroupsModule),
    forwardRef(() => ReactionsModule),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
