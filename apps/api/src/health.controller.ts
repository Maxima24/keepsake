import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

/** Unauthenticated liveness probe for the platform health check (Render, etc.). */
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health(): { status: string; time: string } {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
