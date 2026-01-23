import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { EventCategory } from '../../common/enums/event-category.enum';

/** DTO de création d'événement (`POST /api/events`). */
export class CreateEventDto {
  /** Titre. */
  @IsString()
  titre!: string;

  /** Description. */
  @IsString()
  description!: string;

  /** Catégorie. */
  @IsEnum(EventCategory)
  categorie!: EventCategory;

  /** Ville. */
  @IsString()
  ville!: string;

  /** Lieu. */
  @IsString()
  lieu!: string;

  /** Thème (optionnel). */
  @IsOptional()
  @IsString()
  theme?: string;

  /** Date/heure de début (ISO). */
  @IsDateString()
  dateDebut!: string;

  /** Date/heure de fin (ISO). */
  @IsDateString()
  dateFin!: string;

  /** Public (réservé à l'admin côté service). */
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
