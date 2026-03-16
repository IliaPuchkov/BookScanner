import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkSessionsService } from './work-sessions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Work Sessions')
@Controller('work-sessions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkSessionsController {
  constructor(private readonly sessionsService: WorkSessionsService) {}

  @Post('start')
  @ApiOperation({ summary: 'Начать рабочую сессию' })
  start(@CurrentUser() user: User) {
    return this.sessionsService.startSession(user.id);
  }

  @Get('active')
  @ApiOperation({ summary: 'Получить активную сессию' })
  getActive(@CurrentUser() user: User) {
    return this.sessionsService.getActiveSession(user.id);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'Завершить рабочую сессию' })
  end(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.sessionsService.endSession(id, user.id);
  }
}
