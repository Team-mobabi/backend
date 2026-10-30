import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://daisy.wisoft.io",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // 요청 검증은 각 컨트롤러에서 Effect Schema로 디코딩한다 (BaseController.decode)
  const config = new DocumentBuilder()
    .setTitle("Git Project API")
    .setDescription("Git 레포지토리 관리 시스템 API")
    .setVersion("1.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "JWT-auth",
    )
    .build();
  SwaggerModule.setup("api", app, SwaggerModule.createDocument(app, config));

  await app.listen(configService.get<number>("PORT", 3000));
  const url = await app.getUrl();
  logger.log(`Application is running on: ${url}`);
  logger.log(`Swagger documentation: ${url}/api`);
}

bootstrap();
