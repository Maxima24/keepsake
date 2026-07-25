import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * The real request pipeline — shared by main.ts and the e2e tests so tests
 * exercise exactly what production does (validation, error shape, CORS).
 * The global JwtAuthGuard + RolesGuard are wired via APP_GUARD in AppModule.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({ origin: allowedOrigins() });
}

/**
 * Origins permitted to call the API. Local dev (4200) is always allowed; the
 * deployed web origin(s) come from WEB_ORIGIN (comma-separated). A bare host
 * like `keepsake-web.onrender.com` is upgraded to `https://…` so a Render
 * `fromService` host value works without a scheme.
 */
function allowedOrigins(): string[] {
  const configured = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => (/^https?:\/\//.test(o) ? o : `https://${o}`));
  return [...new Set(['http://localhost:4200', ...configured])];
}
