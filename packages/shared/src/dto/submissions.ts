// 제출 생성/수정 DTO입니다.
import { z } from "zod";
import { MAX_SUBMISSION_CODE_BYTES } from "../domain/submission.js";

const codeSchema = z
  .string()
  .min(1)
  .refine(
    (s) => Buffer.byteLength(s, "utf8") <= MAX_SUBMISSION_CODE_BYTES,
    `제출 코드는 ${MAX_SUBMISSION_CODE_BYTES} 바이트를 넘을 수 없습니다.`,
  );

export const createSubmissionDto = z.object({
  title: z.string().trim().max(100).optional(),
  language: z.string().min(1).max(50),
  code: codeSchema,
});

export type CreateSubmissionDto = z.infer<typeof createSubmissionDto>;

export const updateSubmissionCodeDto = z.object({
  language: z.string().min(1).max(50),
  code: codeSchema,
});

export type UpdateSubmissionCodeDto = z.infer<typeof updateSubmissionCodeDto>;

export const renameSubmissionDto = z.object({
  title: z.string().trim().min(1).max(100),
});

export type RenameSubmissionDto = z.infer<typeof renameSubmissionDto>;

export const submissionListQuery = z.object({
  sort: z.enum(["createdAtAsc", "createdAtDesc"]).default("createdAtAsc"),
  authorId: z.string().uuid().optional(),
  language: z.string().optional(),
  isLate: z.boolean().optional(),
});

export type SubmissionListQuery = z.infer<typeof submissionListQuery>;
