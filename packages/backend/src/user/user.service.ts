import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash as bcryptHash } from 'bcryptjs';
import { PaginationQuery } from '../dao/interfaces/base-dao.interface';
import { USER_DAO } from '../dao/dao.tokens';
import { IUserDao } from '../dao/interfaces/user-dao.interface';
import { User } from './user.entity';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

/** 对外返回的用户结构（不含密码） */
export type PublicUser = Omit<User, 'password'>;

@Injectable()
export class UserService {
  constructor(@Inject(USER_DAO) private readonly userDao: IUserDao) {}

  async list(query: PaginationQuery) {
    const page = await this.userDao.findAll(query);
    return {
      ...page,
      items: page.items.map((u) => this.toPublicUser(u)),
    };
  }

  async findOne(id: string): Promise<PublicUser> {
    const user = await this.userDao.findWithRolesById(id);
    if (!user) {
      throw new NotFoundException(`用户不存在: ${id}`);
    }
    return this.toPublicUser(user);
  }

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const dup = await this.userDao.findByUsername(dto.username);
    if (dup) {
      throw new ConflictException('用户名已存在');
    }
    const passwordHash = await bcryptHash(dto.password, BCRYPT_ROUNDS);
    const created = await this.userDao.create({
      username: dto.username,
      password: passwordHash,
      nickname: dto.nickname ?? '',
    });
    return this.toPublicUser(created);
  }

  async update(id: string, dto: UpdateUserDto): Promise<PublicUser> {
    const current = await this.userDao.findById(id);
    if (!current) {
      throw new NotFoundException(`用户不存在: ${id}`);
    }
    if (dto.username !== undefined && dto.username !== current.username) {
      const taken = await this.userDao.findByUsername(dto.username);
      if (taken && taken.id !== id) {
        throw new ConflictException('用户名已存在');
      }
    }
    const patch: Partial<User> = {};
    if (dto.username !== undefined) {
      patch.username = dto.username;
    }
    if (dto.nickname !== undefined) {
      patch.nickname = dto.nickname;
    }
    if (dto.password !== undefined) {
      patch.password = await bcryptHash(dto.password, BCRYPT_ROUNDS);
    }
    const updated = await this.userDao.update(id, patch);
    return this.toPublicUser(updated);
  }

  async remove(id: string): Promise<void> {
    const current = await this.userDao.findById(id);
    if (!current) {
      throw new NotFoundException(`用户不存在: ${id}`);
    }
    await this.userDao.delete(id);
  }

  async assignRoles(id: string, dto: AssignUserRolesDto): Promise<PublicUser> {
    const user = await this.userDao.assignRoles(id, dto.roleIds);
    return this.toPublicUser(user);
  }

  private toPublicUser(user: User): PublicUser {
    const { password: _p, ...rest } = user;
    return rest as PublicUser;
  }
}
