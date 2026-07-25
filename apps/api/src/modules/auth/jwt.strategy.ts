import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-insecure-secret',
    });
  }

  // Re-load the user each request so role changes / disabling take effect immediately.
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.auth.validateJwtUser(payload.sub);
    if (!user || user.disabled) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
