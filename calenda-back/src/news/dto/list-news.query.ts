import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

/** DTO de query pour lister les news (`GET /api/news`). */
export class ListNewsQueryDto {
  /** Page (transformée en number). */
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  page?: number;

  /** Taille de page (transformée en number). */
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  pageSize?: number;
}
