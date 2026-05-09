import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'plan2code_permissions';

/** 声明访问所需权限 code（需全部满足，`*` 通配由守卫识别，需配合 PermissionsGuard） */
export const RequirePermissions = (...codes: string[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
