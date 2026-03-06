import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { EventCategory } from '../../common/enums/event-category.enum';
import { EventTag } from '../../common/enums/event-tag.enum';

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

  /** Filtre: adresse (match partiel). */
  @IsOptional()
  @IsString()
  adresse?: string;

  /** Filtre: recherche plein texte (titre/description). */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined,
  )
  @IsEnum(EventTag, { each: true })
  caracteristiques?: EventTag[];

  /** Filtre: uniquement les favoris (si user connecté). */
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  favoris?: boolean;

  /** Admin: inclure les événements non-public (en attente) dans le listing. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === '1')
  @IsBoolean()
  includePending?: boolean;

  /** Pagination: nombre max d'items à retourner (optionnel). */
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  /** Pagination: offset (index de départ) pour la page (optionnel). */
  @IsOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number;
}
