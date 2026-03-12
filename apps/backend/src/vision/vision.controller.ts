import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VisionService } from './vision.service';
import { ExtractDto } from './dto/extract.dto';
import { IsbnLookupDto } from './dto/isbn-lookup.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Vision & OCR')
@Controller('vision')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VisionController {
  constructor(private readonly visionService: VisionService) {}

  @Post('extract')
  @ApiOperation({ summary: 'Извлечь данные из фотографий книги' })
  extract(@Body() dto: ExtractDto) {
    return this.visionService.extractBookData(dto.bookId);
  }

  @Post('isbn-lookup')
  @ApiOperation({ summary: 'Поиск по ISBN' })
  isbnLookup(@Body() dto: IsbnLookupDto) {
    return this.visionService.isbnLookup(dto.isbn);
  }
}
