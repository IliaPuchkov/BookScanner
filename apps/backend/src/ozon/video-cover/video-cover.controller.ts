import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsString, Length } from 'class-validator';
import { UserRole } from '@bookscanner/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { VIDEO_COVER } from './render-video-cover';
import { VideoCoverService } from './video-cover.service';

class SetVideoCoverEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

class UploadVideoCoverDto {
  @IsString()
  @Length(16, 16)
  photosHash: string;
}

@ApiTags('Ozon video covers')
@Controller('ozon/video-covers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class VideoCoverController {
  constructor(private readonly videoCovers: VideoCoverService) {}

  @Get('status')
  @ApiOperation({ summary: 'Видеообложки: включены ли, сколько готово и отправлено в Ozon' })
  status() {
    return this.videoCovers.status();
  }

  @Put('enabled')
  @ApiOperation({ summary: 'Включить/выключить видеообложки' })
  setEnabled(@Body() dto: SetVideoCoverEnabledDto) {
    return this.videoCovers.setEnabled(dto.enabled);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Опубликованные книги без видеообложки (для скрипта догрузки)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'after', required: false, description: 'id последней книги прошлой страницы' })
  pending(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('after') after?: string,
  ) {
    return this.videoCovers.listPending(limit, after);
  }

  @Post('push')
  @ApiOperation({ summary: 'Отправить готовые видеообложки в Ozon сейчас' })
  push() {
    return this.videoCovers.pushPending();
  }

  @Post(':bookId')
  @ApiOperation({ summary: 'Загрузить готовую видеообложку книги (MP4, 3:4, 8–30 с)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: VIDEO_COVER.MAX_BYTES } }))
  upload(
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadVideoCoverDto,
  ) {
    return this.videoCovers.acceptUpload(bookId, file, dto.photosHash);
  }

  @Post(':bookId/render')
  @ApiOperation({ summary: 'Собрать видеообложку книги на сервере (в очереди)' })
  async render(@Param('bookId', ParseUUIDPipe) bookId: string) {
    await this.videoCovers.enqueue(bookId, true);
    return { queued: true };
  }
}
