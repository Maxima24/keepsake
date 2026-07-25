import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeyService } from '../../modules/apikeys/apikeys.service';
import { AuthUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * The single global authentication guard (registered before RolesGuard).
 * Resolution order:
 *   1. @Public() route            → allow.
 *   2. `X-API-Key` header present  → authenticate the key, set req.user to the
 *                                    service principal (so RolesGuard works).
 *   3. otherwise                   → fall back to JWT (Bearer token).
 * RolesGuard then authorizes uniformly on `req.user.role`.
 */
@Injectable()
export class CompositeAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeyService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown>; user?: AuthUser }>();
    const header = req.headers['x-api-key'];
    if (typeof header === 'string' && header.length > 0) {
      req.user = await this.apiKeys.authenticate(header);
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}
