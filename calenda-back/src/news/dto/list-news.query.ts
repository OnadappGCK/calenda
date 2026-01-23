import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class ListNewsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  pageSize?: number;
}
