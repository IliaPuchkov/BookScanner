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
  Request,
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
import { ResolveDuplicateDto } from './dto/resolve-duplicate.dto';
import { DuplicateFiltersDto } from './dto/duplicate-filters.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'ISO date string, начало периода' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'ISO date string, конец периода' })
  @ApiQuery({ name: 'includeActiveSessions', required: false, type: Boolean })
  getStatistics(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('includeActiveSessions') includeActiveSessions?: string,
  ) {
    return this.adminService.getStatistics(dateFrom, dateTo, includeActiveSessions === 'true');
  }

  // Pending review
  @Get('books/pending-review/counts-by-box')
  @ApiOperation({ summary: 'Количество карточек в ожидании проверки по коробкам' })
  getPendingReviewCountsByBox() {
    return this.adminService.getPendingReviewCountsByBox();
  }

  @Get('books/pending-review/ids')
  @ApiOperation({ summary: 'ID всех карточек в ожидании проверки (опционально по коробке и фильтрам)' })
  getPendingReviewIds(@Query() dto: SearchBooksDto) {
    const { boxId, search, createdById, dateFrom, dateTo, priceMin, priceMax, yearFrom, yearTo, printRunMin, printRunMax } = dto;
    return this.adminService.getPendingReviewIds(boxId, { search, createdById, dateFrom, dateTo, priceMin, priceMax, yearFrom, yearTo, printRunMin, printRunMax });
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

  // Duplicates
  @Get('books/duplicates')
  @ApiOperation({ summary: 'Книги с возможными дубликатами' })
  getDuplicates(@Query() dto: DuplicateFiltersDto) {
    return this.adminService.getDuplicates(dto);
  }

  @Post('books/duplicates/resolve')
  @ApiOperation({ summary: 'Пометить пару книг как не дубликаты' })
  resolveDuplicate(@Body() dto: ResolveDuplicateDto, @CurrentUser() user: any) {
    return this.adminService.resolveDuplicate(dto.book1Id, dto.book2Id, user.id);
  }

  @Post('books/mark-copies')
  @ApiOperation({ summary: 'Пометить группу книг как копии друг друга' })
  markCopies(@Body() dto: { bookIds: string[] }) {
    return this.adminService.markCopies(dto.bookIds);
  }

  // Copies
  @Get('books/copies/groups')
  @ApiOperation({ summary: 'Копии (isCopy=true), сгруппированные по ISBN или названию' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['published', 'not_published', 'archived'] })
  getCopyGroups(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'published' | 'not_published' | 'archived',
  ) {
    return this.adminService.getCopyGroups({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      status,
    });
  }

  // OCR errors
  @Get('books/ocr-failed')
  @ApiOperation({ summary: 'Книги с ошибкой распознавания (OCR)' })
  getOcrFailedBooks(@Query() pagination: PaginationDto) {
    return this.adminService.getOcrFailedBooks(pagination);
  }

  // Underpriced books
  @Get('books/underpriced')
  @ApiOperation({ summary: 'Книги с возможно заниженной ценой (год ≤ 1985, тираж < 10 000)' })
  getUnderpricedBooks(@Query() pagination: PaginationDto) {
    return this.adminService.getUnderpricedBooks(pagination);
  }
}
