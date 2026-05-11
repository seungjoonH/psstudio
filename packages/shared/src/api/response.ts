// BE 응답 표준 포맷의 공용 타입과 헬퍼입니다.
import type { ErrorCode } from "./error-codes.js";

export type SuccessResponse<T> = {
  success: true;
  data: T;
};

export type ErrorResponse = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type StandardResponse<T> = SuccessResponse<T> | ErrorResponse;

export function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

export function fail(code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorResponse {
  return { success: false, error: { code, message, details } };
}
