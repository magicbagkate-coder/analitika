import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SitniksClientService } from './sitniks-client.service';

@Module({
  imports: [HttpModule],
  providers: [SitniksClientService],
  exports: [SitniksClientService],
})
export class SitniksClientModule {}
