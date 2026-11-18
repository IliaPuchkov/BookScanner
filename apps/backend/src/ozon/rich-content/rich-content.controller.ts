import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { UserRole } from '@bookscanner/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RichContentService } from './rich-content.service';

class SetRichContentEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

@ApiTags('Ozon rich content')
@Controller('ozon/rich-content')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class RichContentController {
  constructor(private readonly richContent: RichContentService) {}

  @Get('status')
  @ApiOperation({ summary: 'Rich-контент: включён ли, в скольких карточках Ozon уже есть' })
  status() {
    return this.richContent.status();
  }

  @Put('enabled')
  @ApiOperation({ summary: 'Включить/выключить Rich-контент' })
  setEnabled(@Body() dto: SetRichContentEnabledDto) {
    return this.richContent.setEnabled(dto.enabled);
  }

  @Post('push')
  @ApiOperation({ summary: 'Отправить Rich-контент в опубликованные карточки сейчас' })
  push() {
    return this.richContent.pushPending();
  }
}
