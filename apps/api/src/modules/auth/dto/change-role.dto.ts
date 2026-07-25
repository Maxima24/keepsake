import { IsIn } from 'class-validator';
import { ROLES } from '../../../common/roles';
import type { Role } from '../../../common/roles';

export class ChangeRoleDto {
  @IsIn(ROLES)
  role!: Role;
}
