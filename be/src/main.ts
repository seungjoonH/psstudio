// NestJS 백엔드 애플리케이션의 진입점입니다.
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ENV } from "./config/env.js";
import { dataSource } from "./config/data-source.js";
import { AppModule } from "./modules/app.module.js";

async function bootstrap() {
  if (!dataSource.isInitialized) await dataSource.initialize();

  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: ENV.fePublicBaseUrl(),
    credentials: true,
  });

  const port = ENV.bePort();
  await app.listen(port);
  console.log(`BE listening on http://localhost:${port}`);
}

bootstrap();
