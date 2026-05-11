// 사용자별 AI 토큰 잔액 엔티티입니다.
import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "ai_token_balances" })
@Index(["userId"], { unique: true })
export class AiTokenBalance {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "balance_tokens", type: "int", default: 0 })
  balanceTokens!: number;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
