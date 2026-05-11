import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaginationQuery } from '../dao/interfaces/base-dao.interface';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/types/jwt-user.types';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions('user:view')
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('keyword') keyword?: string,
  ) {
    const query: PaginationQuery = { page, pageSize, keyword };
    return this.userService.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    // 允许用户读取自己的信息；读取其他用户仍需具备 user:view 权限（或 * 通配）
    if (user.id !== id) {
      const canViewOthers =
        user.permissionCodes.includes('*') ||
        user.permissionCodes.includes('user:view');
      if (!canViewOthers) {
        throw new ForbiddenException('Forbidden resource');
      }
    }
    return this.userService.findOne(id);
  }

  @Post()
  @RequirePermissions('user:create')
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('user:update')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('user:delete')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }

  @Put(':id/roles')
  @RequirePermissions('user:assign-role')
  assignRoles(@Param('id') id: string, @Body() dto: AssignUserRolesDto) {
    return this.userService.assignRoles(id, dto);
  }
}
