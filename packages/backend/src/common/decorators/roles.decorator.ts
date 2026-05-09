import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'plan2code_roles';

/** 声明访问所需角色名（满足其一即可，需配合 RolesGuard） */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
