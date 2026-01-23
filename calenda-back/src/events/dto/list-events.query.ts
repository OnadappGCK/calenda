import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EventCategory } from '../../common/enums/event-category.enum';

/** DTO de query pour lister les événements (`GET /api/events`). */
export class ListEventsQueryDto {
  /** Filtre: date début >= from (ISO). */
  @IsOptional()
  @IsString()
  from?: string;

  /** Filtre: date début <= to (ISO). */
  @IsOptional()
  @IsString()
  to?: string;

  /** Filtre: catégorie. */
  @IsOptional()
  @IsEnum(EventCategory)
  categorie?: EventCategory;

  /** Filtre: ville (match exact case-insensitive). */
  @IsOptional()
  @IsString()
  ville?: string;

  /** Filtre: lieu (match partiel). */
  @IsOptional()
  @IsString()
  lieu?: string;

  /** Filtre: recherche plein texte (titre/description). */
  @IsOptional()
  @IsString()
  q?: string;

  /** Filtre: uniquement les favoris (si user connecté). */
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  favoris?: boolean;
}
