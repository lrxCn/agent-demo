import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { USER_DAO } from '../../dao/dao.tokens';
import { IUserDao } from '../../dao/interfaces/user-dao.interface';
import { userEntityToJwtUser } from '../jwt-user.util';
import { JwtUser } from '../types/jwt-user.types';

const ACCESS_TYP = 'access';

/** 从 Authorization Bearer 解析 access JWT 并加载当前用户 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Inject(USER_DAO) private readonly userDao: IUserDao,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub?: string; typ?: string }): Promise<JwtUser> {
    if (payload.typ !== ACCESS_TYP || !payload.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.userDao.findWithRolesById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return userEntityToJwtUser(user);
  }
}
