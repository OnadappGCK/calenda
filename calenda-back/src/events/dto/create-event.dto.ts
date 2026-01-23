import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { EventCategory } from '../../common/enums/event-category.enum';

export class CreateEventDto {
  @IsString()
  titre!: string;

  @IsString()
  description!: string;

  @IsEnum(EventCategory)
  categorie!: EventCategory;

  @IsString()
  ville!: string;

  @IsString()
  lieu!: string;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsDateString()
  dateDebut!: string;

  @IsDateString()
  dateFin!: string;

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
