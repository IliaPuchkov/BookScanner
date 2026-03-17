import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OzonService } from './ozon.service';
import { PublishDto } from './dto/publish.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@bookscanner/shared';

@ApiTags('Ozon')
@Controller('ozon')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OzonController {
  constructor(private readonly ozonService: OzonService) {}

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
}
