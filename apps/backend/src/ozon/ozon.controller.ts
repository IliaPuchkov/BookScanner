import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OzonService } from './ozon.service';
import { PublishDto } from './dto/publish.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Ozon')
@Controller('ozon')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OzonController {
  constructor(private readonly ozonService: OzonService) {}

  @Post('publish')
  @ApiOperation({ summary: 'Опубликовать карточку на Ozon' })
  publish(@Body() dto: PublishDto) {
    return this.ozonService.publish(dto.bookId);
  }

  @Get('price-lookup')
  @ApiOperation({ summary: 'Поиск средней цены на Ozon' })
  @ApiQuery({ name: 'query', description: 'ISBN, название или автор' })
  priceLookup(@Query('query') query: string) {
    return this.ozonService.priceLookup(query);
  }
}
