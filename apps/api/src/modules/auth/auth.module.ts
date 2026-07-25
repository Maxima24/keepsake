import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './jwt.strategy';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    AuditModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-insecure-secret',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, AuthRepository, JwtStrategy, UsersService],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
