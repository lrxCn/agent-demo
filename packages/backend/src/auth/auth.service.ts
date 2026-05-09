import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare as bcryptCompare } from 'bcryptjs';
import { USER_DAO } from '../dao/dao.tokens';
import { IUserDao } from '../dao/interfaces/user-dao.interface';
import { User } from '../user/user.entity';
import { userEntityToJwtUser } from './jwt-user.util';
import { LoginDto } from './dto/login.dto';

const ACCESS_TYP = 'access' as const;
const REFRESH_TYP = 'refresh' as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(USER_DAO) private readonly userDao: IUserDao,
  ) {}

  /** 校验用户名密码；成功则返回带角色与权限的用户实体 */
  async validateUser(username: string, password: string): Promise<User | null> {
    const row = await this.userDao.findByUsername(username);
    if (!row) {
      return null;
    }
    const match = await bcryptCompare(password, row.password);
    if (!match) {
      return null;
    }
    const full = await this.userDao.findWithRolesById(row.id);
    return full;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.username, dto.password);
    if (!user) {
      throw new UnauthorizedException({
        code: 40001,
        message: '用户名或密码错误',
      });
    }
    const accessTtl = this.config.get<string>('JWT_EXPIRES_IN') ?? '1h';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const secret = this.config.getOrThrow<string>('JWT_SECRET');

    const access_token = this.jwtService.sign(
      { sub: user.id, typ: ACCESS_TYP },
      { secret, expiresIn: accessTtl } as never,
    );
    const refresh_token = this.jwtService.sign(
      { sub: user.id, typ: REFRESH_TYP },
      { secret, expiresIn: refreshTtl } as never,
    );

    const jwtUser = userEntityToJwtUser(user);
    return {
      access_token,
      refresh_token,
      expires_in: this.secondsUntilExpiry(access_token),
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        roles: jwtUser.roleNames,
        permissions: jwtUser.permissionCodes,
      },
    };
  }

  async refresh(refreshToken: string) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    let payload: { sub?: string; typ?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; typ: string }>(
        refreshToken,
        { secret },
      );
    } catch {
      throw new UnauthorizedException({
        code: 40002,
        message: 'refresh_token 无效或已过期',
      });
    }
    if (payload.typ !== REFRESH_TYP || !payload.sub) {
      throw new UnauthorizedException({
        code: 40002,
        message: 'refresh_token 无效或已过期',
      });
    }
    const user = await this.userDao.findWithRolesById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: 40002,
        message: 'refresh_token 无效或已过期',
      });
    }
    const accessTtl = this.config.get<string>('JWT_EXPIRES_IN') ?? '1h';
    const access_token = this.jwtService.sign(
      { sub: user.id, typ: ACCESS_TYP },
      { secret, expiresIn: accessTtl } as never,
    );
    return {
      access_token,
      expires_in: this.secondsUntilExpiry(access_token),
    };
  }

  private secondsUntilExpiry(token: string): number {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) {
      return 3600;
    }
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, decoded.exp - now);
  }
}
