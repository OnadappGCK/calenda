import { Controller, Get, Query } from '@nestjs/common';
import { ListNewsQueryDto } from './dto/list-news.query';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async list(@Query() query: ListNewsQueryDto) {
    return this.newsService.list(query.page, query.pageSize);
  }
}
