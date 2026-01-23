import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EventCategory } from '../../common/enums/event-category.enum';

export class ListEventsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsEnum(EventCategory)
  categorie?: EventCategory;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  lieu?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  favoris?: boolean;
}
