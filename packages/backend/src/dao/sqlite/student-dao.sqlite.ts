import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../../student/student.entity';
import { PaginatedResult, PaginationQuery } from '../interfaces/base-dao.interface';
import { IStudentDao } from '../interfaces/student-dao.interface';
import { resolvePagination, toPaginatedResult } from './pagination';

@Injectable()
export class StudentDaoSqlite implements IStudentDao {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
  ) {}

  async findById(id: string): Promise<Student | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAll(query?: PaginationQuery): Promise<PaginatedResult<Student>> {
    const { page, pageSize, skip, keyword } = resolvePagination(query);
    const qb = this.repo.createQueryBuilder('s');
    if (keyword) {
      qb.where(
        '(s.name LIKE :kw OR s.studentNo LIKE :kw OR s.className LIKE :kw OR s.phone LIKE :kw OR s.email LIKE :kw)',
        { kw: `%${keyword}%` },
      );
    }
    const total = await qb.getCount();
    const items = await qb.orderBy('s.createdAt', 'DESC').skip(skip).take(pageSize).getMany();
    return toPaginatedResult(items, total, page, pageSize);
  }

  async create(data: Partial<Student>): Promise<Student> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<Student>): Promise<Student> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException(`学生不存在: ${id}`);
    }
    Object.assign(existing, data);
    return this.repo.save(existing);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete({ id });
  }
}
