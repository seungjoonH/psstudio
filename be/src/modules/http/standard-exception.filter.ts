// NestJS 예외를 표준 API 에러 응답으로 변환하는 전역 필터입니다.
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ERROR_CODES, fail, type ErrorCode } from "@psstudio/shared";
import type { Response } from "express";

function errorCodeForStatus(status: number): ErrorCode {
  if (status === HttpStatus.UNAUTHORIZED) return ERROR_CODES.UNAUTHORIZED;
  if (status === HttpStatus.FORBIDDEN) return ERROR_CODES.FORBIDDEN;
  if (status === HttpStatus.NOT_FOUND) return ERROR_CODES.NOT_FOUND;
  if (status === HttpStatus.CONFLICT) return ERROR_CODES.CONFLICT;
  if (status === HttpStatus.TOO_MANY_REQUESTS) return ERROR_CODES.RATE_LIMITED;
  if (status === HttpStatus.BAD_REQUEST) return ERROR_CODES.VALIDATION_ERROR;
  return ERROR_CODES.INTERNAL_ERROR;
}

function messageFromHttpException(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === "string") return response;
  if (response !== null && typeof response === "object") {
    const message = (response as Record<string, unknown>).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
      return message.join(", ");
    }
  }
  return exception.message;
}

function detailsFromHttpException(exception: HttpException): Record<string, unknown> | undefined {
  const response = exception.getResponse();
  if (response === null || typeof response !== "object") return undefined;
  const message = (response as Record<string, unknown>).message;
  if (!Array.isArray(message) || !message.every((item) => typeof item === "string")) return undefined;
  return { validationErrors: message };
}

@Catch()
export class StandardExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttpException ? messageFromHttpException(exception) : "서버 오류가 발생했습니다.";
    const details = isHttpException ? detailsFromHttpException(exception) : undefined;
    response.status(status).json(fail(errorCodeForStatus(status), message, details));
  }
}
