import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@bookscanner/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CardDefaultsService } from './card-defaults.service';
import { CardDefaultsDto } from './dto/card-defaults.dto';
import { DEFAULT_CARD_DEFAULTS } from './card-defaults';

@ApiTags('Admin - Card defaults')
@Controller('admin/settings/card-defaults')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class CardController {
  constructor(private readonly cardDefaults: CardDefaultsService) {}

  @Get()
  @ApiOperation({ summary: 'Значения по умолчанию для карточки (и стандартные)' })
  async get() {
    return { defaults: await this.cardDefaults.get(), standard: DEFAULT_CARD_DEFAULTS };
  }

  @Put()
  @ApiOperation({ summary: 'Сохранить значения по умолчанию' })
  async save(@Body() dto: CardDefaultsDto) {
    return { defaults: await this.cardDefaults.save(dto) };
  }

  @Get('apply')
  @ApiOperation({ summary: 'Сколько неопубликованных карточек получат новые значения по умолчанию' })
  async count() {
    return { count: await this.cardDefaults.countStale() };
  }

  @Post('apply')
  @ApiOperation({ summary: 'Переписать подставленные поля неопубликованных карточек текущими значениями' })
  apply(@CurrentUser() user: { id: string }) {
    return this.cardDefaults.apply(user.id);
  }
}
