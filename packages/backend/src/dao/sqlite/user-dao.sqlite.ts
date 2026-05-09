import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../../role/role.entity';
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

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  async findWithRolesById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id }, relations: ['roles'] });
  }

  async assignRoles(userId: string, roleIds: string[]): Promise<User> {
    const user = await this.repo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }
    const uniqueIds = [...new Set(roleIds)];
    if (uniqueIds.length === 0) {
      user.roles = [];
      await this.repo.save(user);
    } else {
      const roles = await this.repo.manager.getRepository(Role).findBy({
        id: In(uniqueIds),
      });
      if (roles.length !== uniqueIds.length) {
        throw new BadRequestException('存在无效的角色 ID');
      }
      user.roles = roles;
      await this.repo.save(user);
    }
    const reloaded = await this.repo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!reloaded) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }
    return reloaded;
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
