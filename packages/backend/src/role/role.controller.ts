import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaginationQuery } from '../dao/interfaces/base-dao.interface';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermissions('role:view')
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('keyword') keyword?: string,
  ) {
    const query: PaginationQuery = { page, pageSize, keyword };
    return this.roleService.list(query);
  }

  @Post()
  @RequirePermissions('role:create')
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Post(':id/permissions')
  @RequirePermissions('role:assign-permission')
  assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignRolePermissionsDto,
  ) {
    return this.roleService.assignPermissions(id, dto);
  }

  @Post(':id')
  @RequirePermissions('role:update')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('role:delete')
  remove(@Param('id') id: string) {
    return this.roleService.remove(id);
  }
}
