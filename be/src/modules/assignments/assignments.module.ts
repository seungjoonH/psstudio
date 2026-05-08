// 과제 도메인 모듈입니다.
import { forwardRef, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { AssignmentsController } from "./assignments.controller.js";
import { AssignmentCohortAnalysisService } from "./assignment-cohort-analysis.service.js";
import { AssignmentsService } from "./assignments.service.js";

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => GroupsModule)],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentCohortAnalysisService],
  exports: [AssignmentsService, AssignmentCohortAnalysisService],
})
export class AssignmentsModule {}
