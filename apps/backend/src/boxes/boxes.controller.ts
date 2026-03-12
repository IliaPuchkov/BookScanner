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
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BoxesService } from './boxes.service';
import { CreateBoxDto } from './dto/create-box.dto';
import { UpdateBoxDto } from './dto/update-box.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Boxes')
@Controller('boxes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BoxesController {
  constructor(private readonly boxesService: BoxesService) {}

  @Post('create')
  @ApiOperation({ summary: 'Создать новую коробку' })
  create(@Body() dto: CreateBoxDto, @CurrentUser() user: User) {
    return this.boxesService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Список коробок' })
  findAll(@Query() pagination: PaginationDto, @CurrentUser() user: User) {
    return this.boxesService.findAll(user.id, user.role, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Детали коробки' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.boxesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обновить коробку' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoxDto,
    @CurrentUser() user: User,
  ) {
    return this.boxesService.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить коробку' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.boxesService.remove(id, user.id, user.role);
  }
}
