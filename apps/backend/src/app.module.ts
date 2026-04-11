import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BoxesModule } from './boxes/boxes.module';
import { BooksModule } from './books/books.module';
import { PhotosModule } from './photos/photos.module';
import { VisionModule } from './vision/vision.module';
import { OzonModule } from './ozon/ozon.module';
import { AdminModule } from './admin/admin.module';
import { StatsModule } from './stats/stats.module';
import { SettingsModule } from './settings/settings.module';
import { WorkSessionsModule } from './work-sessions/work-sessions.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'password'),
        database: config.get<string>('DB_NAME', 'bookscanner'),
        autoLoadEntities: true,
        synchronize: config.get<string>('TYPEORM_SYNCHRONIZE', 'false') === 'true',
      }),
    }),
    AuthModule,
    UsersModule,
    BoxesModule,
    BooksModule,
    PhotosModule,
    VisionModule,
    OzonModule,
    AdminModule,
    StatsModule,
    SettingsModule,
    WorkSessionsModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
