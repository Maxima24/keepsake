import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/roles';
import { AuthRepository } from './auth.repository';
import { toUserDto } from './auth.mapper';
import { UserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly repo: AuthRepository) {}

  async list(): Promise<UserDto[]> {
    const users = await this.repo.findAll();
    return users.map(toUserDto);
  }

  async changeRole(id: string, role: Role, actorId: string): Promise<UserDto> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    return toUserDto(await this.repo.updateRole(id, role, actorId));
  }

  async setDisabled(
    id: string,
    disabled: boolean,
    actorId: string,
  ): Promise<UserDto> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    return toUserDto(await this.repo.setDisabled(id, disabled, actorId));
  }
}
