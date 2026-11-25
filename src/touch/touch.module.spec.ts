import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../config/app-config.module';
import { TouchLogModule } from '../touch-log/touch-log.module';
import { TouchLogService } from '../touch-log/touch-log.service';
import { TouchModule } from './touch.module';
import { TouchSchedulerService } from './touch-scheduler.service';

@Module({ providers: [{ provide: TouchLogService, useValue: {} }], exports: [TouchLogService] })
class FakeTouchLogModule {}

describe('TouchModule', () => {
  it('wires every dependency, so the app starts with the touch bot off', async () => {
    Object.assign(process.env, {
      SITNIKS_API_URL: 'https://crm.example',
      SITNIKS_API_KEY: 'k',
      ANTHROPIC_API_KEY: 'k',
      TELEGRAM_BOT_TOKEN: 't',
      TELEGRAM_CHAT_ID: '1',
    });
    delete process.env.TOUCH_MODE;

    const module = await Test.createTestingModule({ imports: [AppConfigModule, TouchModule] })
      .overrideModule(TouchLogModule)
      .useModule(FakeTouchLogModule)
      .compile();

    expect(module.get(TouchSchedulerService)).toBeDefined();
  });
});
