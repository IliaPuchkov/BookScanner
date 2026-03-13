import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.interface';
import { S3StorageService } from './s3-storage.service';
import { LocalStorageService } from './local-storage.service';

@Module({})
export class StorageModule {
  static register(): DynamicModule {
    return {
      module: StorageModule,
      providers: [
        {
          provide: STORAGE_PROVIDER,
          useFactory: (configService: ConfigService) => {
            const bucket = configService.get<string>('AWS_S3_BUCKET');
            if (bucket) {
              return new S3StorageService(configService);
            }
            return new LocalStorageService(configService);
          },
          inject: [ConfigService],
        },
      ],
      exports: [STORAGE_PROVIDER],
    };
  }
}
