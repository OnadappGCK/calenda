import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

/** DTO de mise à jour d'une mise en avant (`PATCH /api/highlights/:id`). */
export class UpdateHighlightDto {
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
