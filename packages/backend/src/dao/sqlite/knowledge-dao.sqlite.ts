import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeBase } from '../../knowledge/knowledge-base.entity';
import {
  PaginatedResult,
  PaginationQuery,
} from '../interfaces/base-dao.interface';
import { IKnowledgeDao } from '../interfaces/knowledge-dao.interface';
import { resolvePagination, toPaginatedResult } from './pagination';

@Injectable()
export class KnowledgeDaoSqlite implements IKnowledgeDao {
  constructor(
    @InjectRepository(KnowledgeBase)
    private readonly repo: Repository<KnowledgeBase>,
  ) {}

  async findById(id: string): Promise<KnowledgeBase | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAll(
    query?: PaginationQuery,
  ): Promise<PaginatedResult<KnowledgeBase>> {
    const { page, pageSize, skip, keyword } = resolvePagination(query);
    const qb = this.repo.createQueryBuilder('k');
    if (keyword) {
      qb.where(
        '(k.name LIKE :kw OR k.description LIKE :kw OR k.fileName LIKE :kw)',
        {
          kw: `%${keyword}%`,
        },
      );
    }
    const total = await qb.getCount();
    const items = await qb
      .orderBy('k.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getMany();
    return toPaginatedResult(items, total, page, pageSize);
  }

  async create(data: Partial<KnowledgeBase>): Promise<KnowledgeBase> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(
    id: string,
    data: Partial<KnowledgeBase>,
  ): Promise<KnowledgeBase> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`知识库不存在: ${id}`);
    }
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
