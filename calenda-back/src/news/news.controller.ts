import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CreateNewsDto } from './dto/create-news.dto';
import { ListNewsQueryDto } from './dto/list-news.query';
import { UpdateNewsDto } from './dto/update-news.dto';
import { NewsService } from './news.service';

@Controller('news')
/**
 * Controller News.
 * Expose les endpoints publics de consultation des news (pagination).
 */
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  private async safeUnlinkUploaded(file: { path?: string } | undefined) {
    const p = (file as any)?.path as string | undefined;
    if (!p) return;
    await fs.promises.unlink(p).catch(() => undefined);
  }

  private ensureUploadDir() {
    const dir = join(process.cwd(), 'uploads', 'news');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  @Get()
  /** Liste paginée des news (page/pageSize). */
  async list(@Query() query: ListNewsQueryDto) {
    return this.newsService.list(query.page, query.pageSize);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'news');
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = (extname(file.originalname) || '').toLowerCase();
          const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
          const rnd = Math.random().toString(16).slice(2);
          cb(null, `${Date.now()}-${rnd}${safeExt}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024, fieldSize: 20 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        if (!ok) {
          (req as any).fileValidationError = 'image_invalid';
          cb(null, false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async create(
    @Req() req: any,
    @UploadedFile() file: { filename: string; path: string } | undefined,
    @Body() dto: CreateNewsDto,
  ) {
    if (req.fileValidationError) {
      throw new BadRequestException(req.fileValidationError);
    }

    const imagePath = file ? `/uploads/news/${file.filename}` : null;
    try {
      return await this.newsService.create(dto, imagePath);
    } catch (e) {
      await this.safeUnlinkUploaded(file);
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'news');
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = (extname(file.originalname) || '').toLowerCase();
          const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
          const rnd = Math.random().toString(16).slice(2);
          cb(null, `${Date.now()}-${rnd}${safeExt}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024, fieldSize: 20 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        if (!ok) {
          (req as any).fileValidationError = 'image_invalid';
          cb(null, false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: { filename: string; path: string } | undefined,
    @Body() dto: UpdateNewsDto,
  ) {
    if (req.fileValidationError) {
      throw new BadRequestException(req.fileValidationError);
    }

    const nextImagePath = file ? `/uploads/news/${file.filename}` : undefined;
    try {
      return await this.newsService.update(id, dto, nextImagePath);
    } catch (e) {
      await this.safeUnlinkUploaded(file);
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }
}
