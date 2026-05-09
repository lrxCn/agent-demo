import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../permission/permission.entity';
import {
  PaginatedResult,
  PaginationQuery,
} from '../interfaces/base-dao.interface';
import { IPermissionDao } from '../interfaces/permission-dao.interface';
import { resolvePagination, toPaginatedResult } from './pagination';

@Injectable()
export class PermissionDaoSqlite implements IPermissionDao {
  constructor(
    @InjectRepository(Permission)
    private readonly repo: Repository<Permission>,
  ) {}

  async findById(id: string): Promise<Permission | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByCode(code: string): Promise<Permission | null> {
    return this.repo.findOne({ where: { code } });
  }

  async findAllOrdered(): Promise<Permission[]> {
    return this.repo.find({
      order: { groupName: 'ASC', code: 'ASC' },
    });
  }

  async findAll(query?: PaginationQuery): Promise<PaginatedResult<Permission>> {
    const { page, pageSize, skip, keyword } = resolvePagination(query);
    const qb = this.repo.createQueryBuilder('p');
    if (keyword) {
      qb.where('(p.code LIKE :kw OR p.name LIKE :kw OR p.groupName LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    const total = await qb.getCount();
    const items = await qb
      .orderBy('p.groupName', 'ASC')
      .addOrderBy('p.code', 'ASC')
      .skip(skip)
      .take(pageSize)
      .getMany();
    return toPaginatedResult(items, total, page, pageSize);
  }

  async create(data: Partial<Permission>): Promise<Permission> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<Permission>): Promise<Permission> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`权限不存在: ${id}`);
    }
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
