import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OzonService } from './ozon.service';
import { OzonApiClient } from './ozon-api.client';
import { PublishDto } from './dto/publish.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, OZON_ATTR_BRAND, OZON_ATTR_AUTHOR } from '@bookscanner/shared';

@ApiTags('Ozon')
@Controller('ozon')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OzonController {
  constructor(
    private readonly ozonService: OzonService,
    private readonly ozonApiClient: OzonApiClient,
  ) {}

  @Post('publish')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Опубликовать карточку на Ozon' })
  publish(@Body() dto: PublishDto) {
    return this.ozonService.publish(dto.bookId);
  }

  @Post('check-status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Проверить статус публикации на Ozon' })
  checkStatus(@Body() dto: PublishDto) {
    return this.ozonService.checkStatus(dto.bookId);
  }

  @Get('price-lookup')
  @ApiOperation({ summary: 'Поиск средней цены на Ozon' })
  @ApiQuery({ name: 'query', description: 'ISBN, название или автор' })
  priceLookup(@Query('query') query: string) {
    return this.ozonService.priceLookup(query);
  }

  @Get('debug/dictionary')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'DEBUG: поиск значения в словаре Ozon' })
  @ApiQuery({ name: 'value', description: 'Искомое значение' })
  @ApiQuery({ name: 'attr', description: 'brand | author', required: false })
  async debugDictionary(
    @Query('value') value: string,
    @Query('attr') attr: 'brand' | 'author' = 'brand',
  ) {
    const attributeId = attr === 'author' ? OZON_ATTR_AUTHOR : OZON_ATTR_BRAND;
    const id = await this.ozonApiClient.findDictionaryValue(attributeId, value);
    return { attributeId, searchValue: value, foundId: id ?? null };
  }

  @Get('debug/dictionary-raw')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'DEBUG: сырой ответ словаря Ozon (первые 10 значений)' })
  @ApiQuery({ name: 'attr', description: 'brand | author', required: false })
  @ApiQuery({ name: 'value', description: 'Фильтр value (опционально)', required: false })
  async debugDictionaryRaw(
    @Query('attr') attr: 'brand' | 'author' = 'brand',
    @Query('value') value?: string,
  ) {
    const attributeId = attr === 'author' ? OZON_ATTR_AUTHOR : OZON_ATTR_BRAND;
    return this.ozonApiClient.fetchDictionaryRaw(attributeId, value);
  }
}
