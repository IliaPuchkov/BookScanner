import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '@bookscanner/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { StatsService } from '../stats/stats.service';
import { CreateExportDto, ExportPeriodDto } from './dto';
import { describeExport, EXPORT_SHEETS, ExportSheetKey, isExportField } from './export-fields';
import { ExportService } from './export.service';
import { EXPORT_TTL_DAYS, ExportFilesService } from './export-files.service';

function period(dto: ExportPeriodDto) {
  const from = dto.from ? new Date(dto.from) : undefined;
  const to = dto.to ? new Date(dto.to) : undefined;
  if (from && to && from >= to) throw new BadRequestException('Начало периода позже конца');
  return { from, to, dateField: dto.dateField ?? 'created' };
}

/** jollybook_2026-11-01_2026-11-30.xlsx — dates on the phone's wall clock */
function fileName(from: Date | undefined, to: Date | undefined, tzOffset: number): string {
  const day = (d: Date) => new Date(d.getTime() - tzOffset * 60000).toISOString().slice(0, 10);
  const today = day(new Date());
  if (!from && !to) return `jollybook_все_${today}.xlsx`;
  // `to` is exclusive (the next midnight) — show the last included day
  const last = to ? day(new Date(to.getTime() - 1)) : today;
  return `jollybook_${from ? day(from) : 'начало'}_${last}.xlsx`;
}

@ApiTags('Admin')
@Controller('admin/export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly files: ExportFilesService,
    private readonly statsService: StatsService,
  ) {}

  @Get('fields')
  @ApiOperation({ summary: 'Поля для выгрузки в Excel, по группам, и дополнительные листы' })
  fields() {
    return { ...describeExport(), ttlDays: EXPORT_TTL_DAYS };
  }

  @Get('count')
  @ApiOperation({ summary: 'Сколько карточек попадёт в выгрузку за период' })
  async count(@Query() dto: ExportPeriodDto) {
    return { count: await this.exportService.count(period(dto)) };
  }

  @Post()
  @ApiOperation({
    summary: `Сделать выгрузку в Excel и сохранить её на ${EXPORT_TTL_DAYS} дней (видна только автору)`,
  })
  async create(@Body() dto: CreateExportDto, @CurrentUser() admin: User) {
    const fields = dto.fields.map((f) => f.trim()).filter(isExportField);
    if (!fields.length) throw new BadRequestException('Не выбрано ни одного поля');
    const sheetKeys = EXPORT_SHEETS.map((s) => s.key as string);
    const sheets = (dto.sheets ?? []).filter((s): s is ExportSheetKey => sheetKeys.includes(s));
    const p = period(dto);
    const tzOffset = dto.tzOffset ?? -180;

    const file = await this.files.create(
      admin.id,
      { ...p, fields, sheets, tzOffset },
      fileName(p.from, p.to, tzOffset),
    );
    await this.statsService.logActivity(admin.id, 'excel_export', 'export_file', file.id, {
      from: dto.from ?? null,
      to: dto.to ?? null,
      dateField: p.dateField,
      fields: fields.length,
      sheets,
      books: file.bookCount,
    });
    return file;
  }

  @Get('files')
  @ApiOperation({ summary: `Мои выгрузки за последние ${EXPORT_TTL_DAYS} дней` })
  list(@CurrentUser() admin: User) {
    return this.files.list(admin.id);
  }

  @Get('files/:id')
  @ApiOperation({ summary: 'Скачать свою выгрузку (.xlsx)' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: User,
    @Res() res: Response,
  ) {
    const { file, buffer } = await this.files.read(admin.id, id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="jollybook.xlsx"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

  @Delete('files/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить свою выгрузку' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: User) {
    await this.files.remove(admin.id, id);
  }
}
