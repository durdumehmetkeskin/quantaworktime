import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();
  app.enableShutdownHooks();
  // Behind Cloudflare + host nginx + container nginx: honor X-Forwarded-For so
  // @Ip() and the throttler see the real client, not the proxy chain.
  app.getHttpAdapter().getInstance().set("trust proxy", true);

  const config = app.get(ConfigService);
  const port = config.get<number>("port", 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Quanta API listening on :${port}`);
}

void bootstrap();
