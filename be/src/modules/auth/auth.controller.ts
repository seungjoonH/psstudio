// OAuth start/callback와 로그아웃을 처리하는 컨트롤러입니다.
import {
  BadRequestException,
  Controller,
  Dependencies,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { parse as parseCookie } from "cookie";
import type { Request, Response } from "express";
import { ENV } from "../../config/env.js";
import { AuthService } from "./auth.service.js";
import { clearSessionCookie, clearStateCookie, setSessionCookie, setStateCookie, STATE_COOKIE_NAME } from "./auth-cookie.js";
import { CurrentSessionId } from "./decorators/current-user.decorator.js";
import { AuthGuard } from "./guards/auth.guard.js";
import { SessionService } from "./session/session.service.js";

@Controller("api/v1/auth")
@Dependencies(AuthService, SessionService)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Get("oauth/:provider/start")
  startOAuth(
    @Param("provider") providerRaw: string,
    @Res() res: Response,
  ): void {
    const provider = this.authService.parseProvider(providerRaw);
    const state = randomBytes(16).toString("hex");
    setStateCookie(res, state);
    const url = this.authService.buildAuthorizeUrl(provider, state);
    res.redirect(url);
  }

  @Get("oauth/:provider/callback")
  async callbackOAuth(
    @Param("provider") providerRaw: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = this.authService.parseProvider(providerRaw);
    if (typeof code !== "string" || code.length === 0) {
      throw new BadRequestException("code 가 필요합니다.");
    }
    const cookies = parseCookie(req.headers.cookie ?? "");
    const expectedState = cookies[STATE_COOKIE_NAME];
    if (typeof expectedState !== "string" || expectedState.length === 0 || expectedState !== state) {
      throw new BadRequestException("state 검증 실패");
    }
    clearStateCookie(res);
    const { sessionId } = await this.authService.completeOAuth(provider, code);
    setSessionCookie(res, sessionId);
    res.redirect(`${ENV.fePublicBaseUrl()}/?login=success`);
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  async logout(
    @CurrentSessionId() sessionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ success: true; data: { ok: true } }> {
    await this.sessionService.destroy(sessionId);
    clearSessionCookie(res);
    return { success: true, data: { ok: true } };
  }
}
