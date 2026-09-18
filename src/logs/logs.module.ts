import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogEntryEntity } from './log-entry.entity';
import { LogsService } from './logs.service';
import { PersistentLogger } from './persistent-logger';

@Module({
  imports: [TypeOrmModule.forFeature([LogEntryEntity])],
  providers: [LogsService, PersistentLogger],
  exports: [LogsService, PersistentLogger],
})
export class LogsModule {}
