import { BadRequestException, Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { UserRole } from '@bookscanner/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OzonApiClient } from './ozon-api.client';
import { ContentScopeService } from './content-scope.service';

class SetContentScopeDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  storeIds: string[];
}

@ApiTags('Ozon content scope')
@Controller('ozon/content-scope')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ContentScopeController {
  constructor(
    private readonly scope: ContentScopeService,
    private readonly ozonApiClient: OzonApiClient,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Магазины для видеообложек и Rich-контента (storeIds: [] — все)' })
  async get() {
    const [scope, stores] = await Promise.all([this.scope.get(), this.ozonApiClient.getAllStores()]);
    return { storeIds: scope.storeIds ?? [], stores };
  }

  @Put()
  @ApiOperation({ summary: 'Задать магазины для видеообложек и Rich-контента ([] — все)' })
  async set(@Body() dto: SetContentScopeDto) {
    const stores = await this.ozonApiClient.getAllStores();
    const unknown = dto.storeIds.filter((id) => !stores.some((s) => s.id === id));
    if (unknown.length) throw new BadRequestException(`Неизвестные магазины: ${unknown.join(', ')}`);
    const scope = await this.scope.set(dto.storeIds);
    return { storeIds: scope.storeIds ?? [], stores };
  }
}
