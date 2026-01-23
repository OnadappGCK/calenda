import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { News } from './news.entity';

@Injectable()
export class NewsService {
  constructor(@InjectRepository(News) private readonly newsRepo: Repository<News>) {}

  async list(page = 1, pageSize = 10) {
    const take = Math.min(Math.max(pageSize, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await this.newsRepo.findAndCount({
      order: { datePublication: 'DESC' },
      take,
      skip,
    });

    return {
      items,
      page: Math.max(page, 1),
      pageSize: take,
      total,
    };
  }
}
