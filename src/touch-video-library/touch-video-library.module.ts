import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TouchVideoLibraryService } from './touch-video-library.service';

@Module({
  imports: [HttpModule],
  providers: [TouchVideoLibraryService],
  exports: [TouchVideoLibraryService],
})
export class TouchVideoLibraryModule {}
