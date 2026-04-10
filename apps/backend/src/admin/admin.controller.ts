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
import { SearchBooksDto } from './dto/search-books.dto';

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

  // Pending review
  @Get('books/pending-review/counts-by-box')
  @ApiOperation({ summary: 'Количество карточек в ожидании проверки по коробкам' })
  getPendingReviewCountsByBox() {
    return this.adminService.getPendingReviewCountsByBox();
  }

  @Get('books/pending-review/ids')
  @ApiOperation({ summary: 'ID всех карточек в ожидании проверки (опционально по коробке)' })
  @ApiQuery({ name: 'boxId', required: false })
  getPendingReviewIds(@Query('boxId') boxId?: string) {
    return this.adminService.getPendingReviewIds(boxId);
  }

  @Get('books/pending-review')
  @ApiOperation({ summary: 'Карточки ожидающие проверки' })
  getPendingReviewBooks(@Query() dto: SearchBooksDto) {
    return this.adminService.getPendingReviewBooks(dto);
  }

  @Get('books/failed-publication')
  @ApiOperation({ summary: 'Карточки с ошибкой публикации на Ozon' })
  getFailedPublicationBooks(@Query() pagination: PaginationDto) {
    return this.adminService.getFailedPublicationBooks(pagination);
  }

  // Book database
  @Get('books/database')
  @ApiOperation({ summary: 'Поиск по базе книг' })
  searchBooks(@Query() dto: SearchBooksDto) {
    return this.adminService.searchBooks(dto);
  }
}
