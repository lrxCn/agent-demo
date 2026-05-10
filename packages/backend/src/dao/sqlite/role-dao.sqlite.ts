import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from '../../permission/permission.entity';
import { Role } from '../../role/role.entity';
import {
  PaginatedResult,
  PaginationQuery,
} from '../interfaces/base-dao.interface';
import { IRoleDao } from '../interfaces/role-dao.interface';
import { resolvePagination, toPaginatedResult } from './pagination';

@Injectable()
export class RoleDaoSqlite implements IRoleDao {
  constructor(
    @InjectRepository(Role)
    private readonly repo: Repository<Role>,
  ) {}

  async findById(id: string): Promise<Role | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByName(name: string): Promise<Role | null> {
    return this.repo.findOne({ where: { name } });
  }

  async findByIdsWithPermissions(ids: string[]): Promise<Role[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.repo.find({
      where: { id: In(ids) },
      relations: ['permissions'],
    });
  }

  async setPermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    const role = await this.repo.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    if (!role) {
      throw new NotFoundException(`角色不存在: ${roleId}`);
    }
    const uniqueIds = [...new Set(permissionIds)];
    if (uniqueIds.length === 0) {
      role.permissions = [];
      await this.repo.save(role);
    } else {
      const perms = await this.repo.manager.getRepository(Permission).findBy({
        id: In(uniqueIds),
      });
      if (perms.length !== uniqueIds.length) {
        throw new BadRequestException('存在无效的权限 ID');
      }
      role.permissions = perms;
      await this.repo.save(role);
    }
    const reloaded = await this.repo.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    if (!reloaded) {
      throw new NotFoundException(`角色不存在: ${roleId}`);
    }
    return reloaded;
  }

  async findAll(query?: PaginationQuery): Promise<PaginatedResult<Role>> {
    const { page, pageSize, skip, keyword } = resolvePagination(query);
    const qb = this.repo.createQueryBuilder('r');
    if (keyword) {
      qb.where('(r.name LIKE :kw OR r.description LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    const total = await qb.getCount();
    const items = await qb
      .orderBy('r.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getMany();
    return toPaginatedResult(items, total, page, pageSize);
  }

  async create(data: Partial<Role>): Promise<Role> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<Role>): Promise<Role> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`角色不存在: ${id}`);
    }
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
