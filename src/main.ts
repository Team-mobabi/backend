import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  const port = configService.get<number>("PORT", 3000);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("Git Project API")
    .setDescription("Git 레포지토리 관리 시스템 API")
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      "JWT-auth",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // "Repos" 태그 제거 (Controller 경로에서 자동 생성된 태그)
  if (document.tags) {
    document.tags = document.tags.filter(tag => tag.name !== 'Repos');
  }

  // 모든 엔드포인트에서 "Repos" 태그 제거
  Object.keys(document.paths).forEach(path => {
    Object.keys(document.paths[path]).forEach(method => {
      const operation = document.paths[path][method];
      if (operation.tags) {
        operation.tags = operation.tags.filter(tag => tag !== 'Repos');
      }
    });
  });

  SwaggerModule.setup("api", app, document);

  await app.listen(port);
  console.info(`Application is running on: ${await app.getUrl()}`);
  console.info(`Swagger documentation: ${await app.getUrl()}/api`);
}

bootstrap();
