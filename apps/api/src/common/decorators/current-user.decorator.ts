import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../roles';

/** The authenticated principal attached to the request by the JWT strategy. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  disabled: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
