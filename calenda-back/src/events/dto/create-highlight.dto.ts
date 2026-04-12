import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

/** DTO de création d'une mise en avant (`POST /api/events/:id/highlights`). */
export class CreateHighlightDto {
  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  /** 0 = standard, >0 = premium. */
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
