import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQuery } from '../dao/interfaces/base-dao.interface';
import { STUDENT_DAO } from '../dao/dao.tokens';
import { IStudentDao } from '../dao/interfaces/student-dao.interface';
import { Student } from './student.entity';
import { BatchCreateStudentsDto } from './dto/batch-create-students.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

/** 对外返回的学生（与实体字段一致，JSON 为 camelCase） */
export type PublicStudent = Student;

@Injectable()
export class StudentService {
  constructor(@Inject(STUDENT_DAO) private readonly studentDao: IStudentDao) {}

  async list(query: PaginationQuery) {
    const page = await this.studentDao.findAll(query);
    return {
      ...page,
      items: page.items.map((s) => this.toPublic(s)),
    };
  }

  async findOne(id: string): Promise<PublicStudent> {
    const row = await this.studentDao.findById(id);
    if (!row) {
      throw new NotFoundException(`学生不存在: ${id}`);
    }
    return this.toPublic(row);
  }

  async create(dto: CreateStudentDto): Promise<PublicStudent> {
    await this.assertStudentNoAvailable(dto.student_no);
    const created = await this.studentDao.create(this.dtoToPartial(dto));
    return this.toPublic(created);
  }

  async update(id: string, dto: UpdateStudentDto): Promise<PublicStudent> {
    const current = await this.studentDao.findById(id);
    if (!current) {
      throw new NotFoundException(`学生不存在: ${id}`);
    }
    if (dto.student_no !== undefined && dto.student_no !== current.studentNo) {
      await this.assertStudentNoAvailable(dto.student_no);
    }
    const patch = this.updateDtoToPartial(dto);
    const updated = await this.studentDao.update(id, patch);
    return this.toPublic(updated);
  }

  async remove(id: string): Promise<void> {
    const current = await this.studentDao.findById(id);
    if (!current) {
      throw new NotFoundException(`学生不存在: ${id}`);
    }
    await this.studentDao.delete(id);
  }

  async batchCreate(
    dto: BatchCreateStudentsDto,
  ): Promise<{ items: PublicStudent[] }> {
    const nos = dto.items.map((i) => i.student_no);
    const unique = new Set(nos);
    if (unique.size !== nos.length) {
      throw new BadRequestException('批量创建中存在重复学号');
    }
    for (const item of dto.items) {
      await this.assertStudentNoAvailable(item.student_no);
    }
    const items: PublicStudent[] = [];
    for (const item of dto.items) {
      const row = await this.studentDao.create(this.dtoToPartial(item));
      items.push(this.toPublic(row));
    }
    return { items };
  }

  async batchDelete(ids: string[]): Promise<{ deleted: number }> {
    const deleted = await this.studentDao.deleteMany(ids);
    return { deleted };
  }

  private async assertStudentNoAvailable(studentNo: string): Promise<void> {
    const dup = await this.studentDao.findByStudentNo(studentNo);
    if (dup) {
      throw new ConflictException(`学号已存在: ${studentNo}`);
    }
  }

  private dtoToPartial(dto: CreateStudentDto): Partial<Student> {
    return {
      name: dto.name,
      studentNo: dto.student_no,
      gender: dto.gender ?? null,
      className: dto.class_name ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
    };
  }

  private updateDtoToPartial(dto: UpdateStudentDto): Partial<Student> {
    const patch: Partial<Student> = {};
    if (dto.name !== undefined) {
      patch.name = dto.name;
    }
    if (dto.student_no !== undefined) {
      patch.studentNo = dto.student_no;
    }
    if (dto.gender !== undefined) {
      patch.gender = dto.gender;
    }
    if (dto.class_name !== undefined) {
      patch.className = dto.class_name;
    }
    if (dto.phone !== undefined) {
      patch.phone = dto.phone;
    }
    if (dto.email !== undefined) {
      patch.email = dto.email;
    }
    return patch;
  }

  private toPublic(s: Student): PublicStudent {
    return { ...s };
  }
}
