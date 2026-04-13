import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EventSlotDto } from './event-slot.dto';
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

  /** Adresse (optionnel). */
  @IsOptional()
  @IsString()
  adresse?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;

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
  @IsString()
  contact?: string | null;

  @IsOptional()
  @IsUUID()
  organisateurId?: string;

  /**
   * Créneaux horaires (remplace tous les slots existants si fournis).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventSlotDto)
  slots?: EventSlotDto[];

  /** Date/heure de début (ISO, optionnel) — utilisé si slots absent. */
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  /** Date/heure de fin (ISO, optionnel) — utilisé si slots absent. */
  @IsOptional()
  @IsDateString()
  dateFin?: string | null;

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
