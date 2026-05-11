// DB와 Redis 헬스체크를 제공하는 컨트롤러입니다.
import { Controller, Dependencies, Get } from "@nestjs/common";
import { HealthService } from "./health.service.js";

@Controller("api/v1/health")
@Dependencies(HealthService)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("db")
  async getDbHealth() {
    return { success: true, data: await this.healthService.checkDb() };
  }

  @Get("redis")
  async getRedisHealth() {
    return { success: true, data: await this.healthService.checkRedis() };
  }
}
