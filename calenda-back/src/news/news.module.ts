import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import { News } from './news.entity';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([News])],
  controllers: [NewsController],
  providers: [NewsService],
})
/** Module News (news.entity + service + controller). */
export class NewsModule {}
