// Resend API를 통해 트랜잭션 메일을 발송합니다.
import { Injectable } from "@nestjs/common";
import { Resend } from "resend";
import { ENV } from "../../config/env.js";

export type SendTransactionalMailInput = {
  to: string;
  subject: string;
  html: string;
};

@Injectable()
export class ResendMailService {
  private client: Resend | null = null;

  private getClient(): Resend {
    if (this.client === null) {
      this.client = new Resend(ENV.resendApiKey());
    }
    return this.client;
  }

  async sendTransactional(input: SendTransactionalMailInput): Promise<{ id: string | undefined }> {
    const { data, error } = await this.getClient().emails.send({
      from: ENV.emailFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error !== null) {
      throw new Error(error.message ?? "메일 발송에 실패했습니다.");
    }
    return { id: data?.id };
  }
}
