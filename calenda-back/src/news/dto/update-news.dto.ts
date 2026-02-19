import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateNewsDto {
  @IsOptional()
  @IsString()
  titre?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  datePublication?: string;

  @IsOptional()
  @IsString()
  texte?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    const v = String(value ?? '').trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
  })
  removeImage?: boolean;
}
