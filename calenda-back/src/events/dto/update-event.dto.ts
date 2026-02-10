import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EventCategory } from '../../common/enums/event-category.enum';
import { EventTag } from '../../common/enums/event-tag.enum';

/** DTO de mise à jour d'événement (`PATCH /api/events/:id`). */
export class UpdateEventDto {
  /** Titre (optionnel). */
  @IsOptional()
  @IsString()
  titre?: string;

  /** Description (optionnel). */
  @IsOptional()
  @IsString()
  description?: string;

  /** Catégorie (optionnel). */
  @IsOptional()
  @IsEnum(EventCategory)
  categorie?: EventCategory;

  /** Ville (optionnel). */
  @IsOptional()
  @IsString()
  ville?: string;

  /** Lieu (optionnel). */
  @IsOptional()
  @IsString()
  lieu?: string;

  /** Thème (optionnel). */
  @IsOptional()
  @IsString()
  theme?: string;

  /** Caractéristiques (tags) optionnelles (max 3). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsEnum(EventTag, { each: true })
  caracteristiques?: EventTag[] | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  tarif?: string | null;

  @IsOptional()
  @IsUUID()
  organisateurId?: string;

  /** Date/heure de début (ISO, optionnel). */
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  /** Date/heure de fin (ISO, optionnel). */
  @IsOptional()
  @IsDateString()
  dateFin?: string;

  /** Public (réservé à l'admin). */
  @IsOptional()
  @IsBoolean()
  public?: boolean;

  /** Flag "en avant" (optionnel). */
  @IsOptional()
  @IsBoolean()
  enAvant?: boolean;

  /** Couleur custom (optionnel). */
  @IsOptional()
  @IsString()
  couleur?: string;
}
