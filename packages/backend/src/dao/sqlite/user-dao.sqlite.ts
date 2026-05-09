import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/user.entity';
import { PaginatedResult, PaginationQuery } from '../interfaces/base-dao.interface';
import { IUserDao } from '../interfaces/user-dao.interface';
import { resolvePagination, toPaginatedResult } from './pagination';

@Injectable()
export class UserDaoSqlite implements IUserDao {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAll(query?: PaginationQuery): Promise<PaginatedResult<User>> {
    const { page, pageSize, skip, keyword } = resolvePagination(query);
    const qb = this.repo.createQueryBuilder('u');
    if (keyword) {
      qb.where('(u.username LIKE :kw OR u.nickname LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    }
    const total = await qb.getCount();
    const items = await qb.orderBy('u.createdAt', 'DESC').skip(skip).take(pageSize).getMany();
    return toPaginatedResult(items, total, page, pageSize);
  }

  async create(data: Partial<User>): Promise<User> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`用户不存在: ${id}`);
    }
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
