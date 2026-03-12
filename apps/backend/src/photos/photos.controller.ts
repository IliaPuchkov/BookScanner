import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { PhotosService } from './photos.service';
import { ReorderPhotosDto } from './dto/reorder-photos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MAX_PHOTOS_PER_BOOK, MAX_FILE_SIZE_BYTES } from '@bookscanner/shared';

@ApiTags('Photos')
@Controller('books/:bookId/photos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Post()
  @ApiOperation({ summary: 'Загрузить фотографии книги' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS_PER_BOOK, {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  upload(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.photosService.upload(bookId, files);
  }

  @Patch(':photoId')
  @ApiOperation({ summary: 'Заменить фотографию' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  replace(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.photosService.replace(bookId, photoId, file);
  }

  @Delete(':photoId')
  @ApiOperation({ summary: 'Удалить фотографию' })
  remove(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.photosService.remove(bookId, photoId);
  }

  @Post('reorder')
  @ApiOperation({ summary: 'Изменить порядок фотографий' })
  reorder(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() dto: ReorderPhotosDto,
  ) {
    return this.photosService.reorder(bookId, dto);
  }
}
