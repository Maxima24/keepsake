import { SetMetadata } from '@nestjs/common';
import { Role } from '../roles';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given roles. No @Roles + not @Public => admin-only. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
