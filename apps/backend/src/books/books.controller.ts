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
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Books')
@Controller('books')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @ApiOperation({ summary: 'Создать карточку книги' })
  create(@Body() dto: CreateBookDto, @CurrentUser() user: User) {
    return this.booksService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Список книг' })
  @ApiQuery({ name: 'boxId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('boxId') boxId: string,
    @Query('search') search: string,
    @CurrentUser() user: User,
  ) {
    return this.booksService.findAll(user.id, user.role, pagination, boxId, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали книги' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.booksService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить книгу' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookDto,
    @CurrentUser() user: User,
  ) {
    return this.booksService.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить книгу' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.booksService.remove(id, user.id, user.role);
  }
}
