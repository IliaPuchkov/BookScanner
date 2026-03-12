import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@bookscanner/shared';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // User management
  @Get('users')
  @ApiOperation({ summary: 'Список всех пользователей' })
  getUsers(@Query() pagination: PaginationDto) {
    return this.adminService.getUsers(pagination);
  }

  @Post('users')
  @ApiOperation({ summary: 'Создать пользователя (с автоматическим подтверждением)' })
  createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Обновить пользователя' })
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Удалить пользователя' })
  deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteUser(id);
  }

  // Statistics
  @Get('statistics')
  @ApiOperation({ summary: 'Получить статистику' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getStatistics(@Query('days') days?: number) {
    return this.adminService.getStatistics(days);
  }

  // Book database
  @Get('books/database')
  @ApiOperation({ summary: 'Поиск по базе книг' })
  @ApiQuery({ name: 'search', required: false })
  searchBooks(
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.adminService.searchBooks(pagination, search);
  }
}
