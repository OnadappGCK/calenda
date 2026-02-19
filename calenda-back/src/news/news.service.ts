import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Repository } from 'typeorm';
import { CreateNewsDto } from './dto/create-news.dto';
import { UpdateNewsDto } from './dto/update-news.dto';
import { News } from './news.entity';

@Injectable()
/**
 * Service News.
 * Fournit une liste paginée des news triées par date de publication.
 */
export class NewsService {
  constructor(@InjectRepository(News) private readonly newsRepo: Repository<News>) {}

  private readonly uploadPrefix = '/uploads/news/';

  private diskPathFromUrlPath(urlPath: string) {
    const p = (urlPath ?? '').trim();
    if (!p.startsWith(this.uploadPrefix)) {
      return null;
    }
    if (p.includes('..')) {
      return null;
    }
    return join(process.cwd(), p.replace(/^\//, ''));
  }

  private async safeUnlink(urlPath: string | null | undefined) {
    const disk = urlPath ? this.diskPathFromUrlPath(urlPath) : null;
    if (!disk) {
      return;
    }
    await fs.unlink(disk).catch(() => undefined);
  }

  /** Récupère une page de news (page/pageSize) avec bornes de sécurité sur `pageSize`. */
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

  async create(dto: CreateNewsDto, imagePath: string | null) {
    const item = this.newsRepo.create({
      titre: dto.titre.trim(),
      datePublication: dto.datePublication,
      texte: dto.texte.trim(),
      image: imagePath,
    });
    return this.newsRepo.save(item);
  }

  async update(id: string, dto: UpdateNewsDto, nextImagePath: string | null | undefined) {
    const item = await this.newsRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('news_not_found');
    }

    const prevImage = item.image;

    if (dto.titre !== undefined) item.titre = dto.titre.trim();
    if (dto.datePublication !== undefined) item.datePublication = dto.datePublication;
    if (dto.texte !== undefined) item.texte = dto.texte.trim();

    let shouldDeletePrev = false;
    if (nextImagePath !== undefined) {
      item.image = nextImagePath;
      shouldDeletePrev = prevImage !== nextImagePath;
    } else if (dto.removeImage) {
      item.image = null;
      shouldDeletePrev = !!prevImage;
    }

    const saved = await this.newsRepo.save(item);
    if (shouldDeletePrev) {
      await this.safeUnlink(prevImage);
    }
    return saved;
  }

  async remove(id: string) {
    const item = await this.newsRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('news_not_found');
    }

    const prevImage = item.image;
    await this.newsRepo.remove(item);
    await this.safeUnlink(prevImage);
    return { ok: true };
  }
}
