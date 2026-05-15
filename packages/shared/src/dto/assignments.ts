// 과제 생성/수정 DTO입니다.
import { z } from "zod";
import { ASSIGNMENT_TITLE_MAX_LENGTH } from "../domain/assignment.js";

export const createAssignmentDto = z.object({
  title: z.string().trim().min(1).max(ASSIGNMENT_TITLE_MAX_LENGTH),
  description: z.string().max(2000).default(""),
  problemUrl: z.string().url(),
  dueAt: z.string().datetime(),
  allowLateSubmission: z.boolean().default(true),
});

export type CreateAssignmentDto = z.infer<typeof createAssignmentDto>;

export const updateAssignmentDto = createAssignmentDto.partial();

export type UpdateAssignmentDto = z.infer<typeof updateAssignmentDto>;

export const updateProblemMetadataDto = z.object({
  title: z.string().min(1).max(ASSIGNMENT_TITLE_MAX_LENGTH).optional(),
  difficulty: z.string().max(50).optional(),
  platform: z.enum(["BOJ", "Programmers", "LeetCode", "Other"]).optional(),
  algorithmTags: z.array(z.string().min(1).max(50)).optional(),
});

export type UpdateProblemMetadataDto = z.infer<typeof updateProblemMetadataDto>;
