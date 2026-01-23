import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { EventCategory } from '../../common/enums/event-category.enum';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  titre?: string;

  @IsOptional()
  @IsString()
  description?: string;

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
  theme?: string;

  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @IsOptional()
  @IsBoolean()
  public?: boolean;

  @IsOptional()
  @IsBoolean()
  enAvant?: boolean;

  @IsOptional()
  @IsString()
  couleur?: string;
}
