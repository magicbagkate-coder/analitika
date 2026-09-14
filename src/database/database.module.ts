import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigService } from '../config/app-config.service';

/**
 * Postgres connection, provisioned ahead of need (2026-09-14) — no entities registered yet,
 * `autoLoadEntities` picks up whatever feature modules register via `TypeOrmModule.forFeature`
 * once there's an actual reason to persist something beyond Sitniks tags/notes.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => ({
        type: 'postgres',
        host: appConfig.getPostgresHost(),
        port: appConfig.getPostgresPort(),
        username: appConfig.getPostgresUser(),
        password: appConfig.getPostgresPassword(),
        database: appConfig.getPostgresDatabase(),
        entities: [],
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
