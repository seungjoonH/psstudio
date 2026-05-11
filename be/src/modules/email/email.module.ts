// Resend 기반 메일 발송 모듈입니다.
import { Global, Module } from "@nestjs/common";
import { ResendMailService } from "./resend-mail.service.js";

@Global()
@Module({
  providers: [ResendMailService],
  exports: [ResendMailService],
})
export class EmailModule {}
