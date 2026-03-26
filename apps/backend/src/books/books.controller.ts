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
  UseInterceptors,
  UploadedFiles,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { MAX_PHOTOS_PER_BOOK, MAX_FILE_SIZE_BYTES } from '@bookscanner/shared';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { GetBooksQueryDto } from './dto/get-books-query.dto';
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

  @Post('create-with-photos')
  @ApiOperation({ summary: 'Создать карточку книги вместе с фотографиями (атомарно)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS_PER_BOOK, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  createWithPhotos(
    @Body() body: { title: string; boxId: string; workSessionId?: string },
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: User,
  ) {
    return this.booksService.createWithPhotos(
      { title: body.title, boxId: body.boxId, workSessionId: body.workSessionId },
      files,
      user.id,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Список книг' })
  findAll(
    @Query() query: GetBooksQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.booksService.findAll(
      user.id, user.role, query, query.boxId, query.search,
      undefined, undefined, undefined, query.workSessionId, query.status,
    );
  }

  @Get('counts-by-box')
  @ApiOperation({ summary: 'Количество книг по коробкам' })
  countByBox(
    @Query('workSessionId') workSessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.booksService.countByBox(user.id, user.role, workSessionId);
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
