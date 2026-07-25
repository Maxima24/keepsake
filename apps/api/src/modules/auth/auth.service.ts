import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/roles';
import { AuthRepository } from './auth.repository';
import { toUserDto } from './auth.mapper';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserDto } from './dto/user.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered.');
    }
    const passwordHash = await argon2.hash(dto.password);
    // Self-registration always creates a least-privilege viewer; an admin promotes.
    const user = await this.repo.create({
      email: dto.email,
      passwordHash,
      role: 'viewer',
    });
    return this.issueToken(user);
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.repo.findByEmail(dto.email);
    if (!user || user.disabled) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    return this.issueToken(user);
  }

  /** Re-load the principal for the JWT strategy (reflects current role/disabled). */
  async validateJwtUser(id: string): Promise<AuthUser | null> {
    const user = await this.repo.findById(id);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      disabled: user.disabled,
    };
  }

  async me(id: string): Promise<UserDto> {
    const user = await this.repo.findById(id);
    if (!user) throw new UnauthorizedException();
    return toUserDto(user);
  }

  private issueToken(user: { id: string; email: string; role: string }): {
    accessToken: string;
  } {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return { accessToken: this.jwt.sign(payload) };
  }
}
