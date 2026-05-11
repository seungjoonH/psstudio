// 코드 리뷰 답글 REST 컨트롤러입니다.
import {
  Body,
  Controller,
  Delete,
  Dependencies,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { AuthGuard } from "../auth/guards/auth.guard.js";
import { ReviewsService } from "./reviews.service.js";

class CreateReplyBody {
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}

function serializeReply(item: Awaited<ReturnType<ReviewsService["createReply"]>>) {
  return {
    id: item.id,
    reviewId: item.reviewId,
    parentReplyId: item.parentReplyId,
    authorUserId: item.authorUserId,
    authorNickname: item.authorNickname,
    authorProfileImageUrl: item.authorProfileImageUrl,
    body: item.body,
    isAdminHidden: item.isAdminHidden,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    reactions: item.reactions,
  };
}

@Controller()
@Dependencies(ReviewsService)
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get("api/v1/reviews/:reviewId/replies")
  async list(
    @CurrentUser() me: { id: string },
    @Param("reviewId") reviewId: string,
  ) {
    const items = await this.reviews.listReplies(reviewId, me.id);
    return { success: true, data: items.map(serializeReply) };
  }

  @Post("api/v1/reviews/:reviewId/replies")
  async create(
    @CurrentUser() me: { id: string },
    @Param("reviewId") reviewId: string,
    @Body() body: CreateReplyBody,
  ) {
    const reply = await this.reviews.createReply(reviewId, me.id, body.body);
    return { success: true, data: serializeReply(reply) };
  }

  @Delete("api/v1/review-replies/:replyId")
  @HttpCode(200)
  async remove(
    @CurrentUser() me: { id: string },
    @Param("replyId") replyId: string,
  ) {
    await this.reviews.deleteReply(replyId, me.id);
    return { success: true, data: { ok: true } };
  }
}
