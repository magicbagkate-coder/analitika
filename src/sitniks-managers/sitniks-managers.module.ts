import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksManagersService } from './sitniks-managers.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksManagersService],
  exports: [SitniksManagersService],
})
export class SitniksManagersModule {}
