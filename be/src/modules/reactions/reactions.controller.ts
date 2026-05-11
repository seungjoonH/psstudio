// 이모지 반응 추가/삭제 REST 컨트롤러입니다.
import {
  Body,
  Controller,
  Delete,
  Dependencies,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ReactionsService } from "./reactions.service.js";

class ReactionBody {
  @IsString() targetType!: string;
  @IsString() @MinLength(1) @MaxLength(64) targetId!: string;
  @IsString() @MinLength(1) @MaxLength(64) emoji!: string;
}

@Controller()
@Dependencies(ReactionsService)
@UseGuards(AuthGuard)
export class ReactionsController {
  constructor(private readonly reactions: ReactionsService) {}

  @Post("api/v1/reactions")
  @HttpCode(200)
  async add(@CurrentUser() me: { id: string }, @Body() body: ReactionBody) {
    const targetType = this.reactions.validateTargetType(body.targetType);
    const reaction = await this.reactions.add(targetType, body.targetId, me.id, body.emoji);
    return {
      success: true,
      data: {
        id: reaction.id,
        targetType: reaction.targetType,
        targetId: reaction.targetId,
        userId: reaction.userId,
        emoji: reaction.emoji,
        createdAt: reaction.createdAt.toISOString(),
      },
    };
  }

  @Delete("api/v1/reactions")
  @HttpCode(200)
  async remove(@CurrentUser() me: { id: string }, @Body() body: ReactionBody) {
    const targetType = this.reactions.validateTargetType(body.targetType);
    await this.reactions.remove(targetType, body.targetId, me.id, body.emoji);
    return { success: true, data: { ok: true } };
  }
}
