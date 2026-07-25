import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  // Bind 0.0.0.0 so the container's published port is reachable (Render/Docker).
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
