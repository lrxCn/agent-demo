import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQuery } from '../dao/interfaces/base-dao.interface';
import { ROLE_DAO } from '../dao/dao.tokens';
import { IRoleDao } from '../dao/interfaces/role-dao.interface';
import { Role } from './role.entity';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

/** 对外返回的角色（列表项，不含关联实体） */
export type PublicRole = Pick<
  Role,
  'id' | 'name' | 'description' | 'createdAt' | 'updatedAt'
>;

/** 含权限摘要的角色 */
export type RoleWithPermissionSummary = PublicRole & {
  permissions: Array<{
    id: string;
    code: string;
    name: string;
    groupName: string;
  }>;
};

@Injectable()
export class RoleService {
  constructor(@Inject(ROLE_DAO) private readonly roleDao: IRoleDao) {}

  async list(query: PaginationQuery) {
    const page = await this.roleDao.findAll(query);
    return {
      ...page,
      items: page.items.map((r) => this.toPublicRole(r)),
    };
  }

  async create(dto: CreateRoleDto): Promise<PublicRole> {
    const dup = await this.roleDao.findByName(dto.name);
    if (dup) {
      throw new ConflictException('角色名已存在');
    }
    const created = await this.roleDao.create({
      name: dto.name,
      description: dto.description ?? null,
    });
    return this.toPublicRole(created);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<PublicRole> {
    const current = await this.roleDao.findById(id);
    if (!current) {
      throw new NotFoundException(`角色不存在: ${id}`);
    }
    if (dto.name !== undefined && dto.name !== current.name) {
      const taken = await this.roleDao.findByName(dto.name);
      if (taken && taken.id !== id) {
        throw new ConflictException('角色名已存在');
      }
    }
    const patch: Partial<Role> = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
    }
    if (dto.description !== undefined) {
      patch.description = dto.description;
    }
    const updated = await this.roleDao.update(id, patch);
    return this.toPublicRole(updated);
  }

  async remove(id: string): Promise<void> {
    const current = await this.roleDao.findById(id);
    if (!current) {
      throw new NotFoundException(`角色不存在: ${id}`);
    }
    await this.roleDao.delete(id);
  }

  async assignPermissions(
    id: string,
    dto: AssignRolePermissionsDto,
  ): Promise<RoleWithPermissionSummary> {
    const updated = await this.roleDao.setPermissions(id, dto.permissionIds);
    return this.toRoleWithPermissions(updated);
  }

  private toPublicRole(role: Role): PublicRole {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private toRoleWithPermissions(role: Role): RoleWithPermissionSummary {
    return {
      ...this.toPublicRole(role),
      permissions: (role.permissions ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        groupName: p.groupName,
      })),
    };
  }
}
