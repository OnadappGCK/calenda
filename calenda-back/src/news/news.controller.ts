import { Controller, Get, Query } from '@nestjs/common';
import { ListNewsQueryDto } from './dto/list-news.query';
import { NewsService } from './news.service';

@Controller('news')
/**
 * Controller News.
 * Expose les endpoints publics de consultation des news (pagination).
 */
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  /** Liste paginée des news (page/pageSize). */
  async list(@Query() query: ListNewsQueryDto) {
    return this.newsService.list(query.page, query.pageSize);
  }
}
