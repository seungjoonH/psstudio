import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendMailService } from "./resend-mail.service.js";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("../../config/env.js", () => ({
  ENV: {
    resendApiKey: () => "re_test_key",
    emailFromAddress: () => "from@example.com",
  },
}));

describe("ResendMailService", () => {
  afterEach(() => {
    sendMock.mockReset();
  });

  it("sendTransactional은 Resend emails.send를 호출한다", async () => {
    sendMock.mockResolvedValueOnce({ data: { id: "msg_1" }, error: null });
    const svc = new ResendMailService();
    const result = await svc.sendTransactional({
      to: "u@example.com",
      subject: "Hello",
      html: "<p>x</p>",
    });
    expect(sendMock).toHaveBeenCalledWith({
      from: "from@example.com",
      to: "u@example.com",
      subject: "Hello",
      html: "<p>x</p>",
    });
    expect(result.id).toBe("msg_1");
  });

  it("error가 있으면 예외를 던진다", async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "bad" } });
    const svc = new ResendMailService();
    await expect(
      svc.sendTransactional({ to: "u@example.com", subject: "x", html: "y" }),
    ).rejects.toThrow("bad");
  });
});
