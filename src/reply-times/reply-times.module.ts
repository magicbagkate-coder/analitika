import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReplyTimeEntity } from './reply-time.entity';
import { ReplyTimesService } from './reply-times.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReplyTimeEntity])],
  providers: [ReplyTimesService],
  exports: [ReplyTimesService],
})
export class ReplyTimesModule {}
