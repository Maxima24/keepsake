import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { ChangeRoleDto } from './dto/change-role.dto';
import { SetDisabledDto } from './dto/set-disabled.dto';
import { UserDto } from './dto/user.dto';

@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserDto[]> {
    return this.users.list();
  }

  @Patch(':id/role')
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.users.changeRole(id, dto.role, actor.id);
  }

  @Patch(':id/disable')
  setDisabled(
    @Param('id') id: string,
    @Body() dto: SetDisabledDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.users.setDisabled(id, dto.disabled, actor.id);
  }
}
