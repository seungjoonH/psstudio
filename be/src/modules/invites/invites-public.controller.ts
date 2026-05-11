// 인증 없이 접근 가능한 초대 미리보기 API입니다.
import { Controller, Dependencies, Get, Param, Query } from "@nestjs/common";
import { InvitesService } from "./invites.service.js";

@Controller()
@Dependencies(InvitesService)
export class InvitesPublicController {
  constructor(private readonly invites: InvitesService) {}

  @Get("api/v1/invites/preview")
  async preview(@Query("code") code?: string, @Query("link") link?: string) {
    const data = await this.invites.preview({ code, link });
    return { success: true, data };
  }

  @Get("api/v1/invites/links/:token")
  async resolveLinkMeta(@Param("token") token: string) {
    const { group } = await this.invites.resolveInviteLink(token);
    return {
      success: true,
      data: {
        groupId: group.id,
        groupName: group.name,
      },
    };
  }
}
