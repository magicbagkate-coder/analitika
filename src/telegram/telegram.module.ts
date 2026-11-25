import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TelegramOwnerBotService } from './telegram-owner-bot.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [HttpModule],
  providers: [TelegramService, TelegramOwnerBotService],
  exports: [TelegramService, TelegramOwnerBotService],
})
export class TelegramModule {}
