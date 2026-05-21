import { IsString, Matches } from 'class-validator';

/** DTO d'un créneau horaire (date + heures). */
export class EventSlotDto {
  /** Date du créneau, format « YYYY-MM-DD ». */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date doit être au format YYYY-MM-DD' })
  date!: string;

  /** Heure de début, format « HH:MM ». */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'heureDebut doit être au format HH:MM' })
  heureDebut!: string;

  /** Heure de fin, format « HH:MM ». */
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'heureFin doit être au format HH:MM' })
  heureFin!: string;
}
