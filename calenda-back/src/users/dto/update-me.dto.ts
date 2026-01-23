import { IsOptional, IsString, MinLength } from 'class-validator';

/** DTO de mise à jour du profil courant (`PATCH /api/users/me`). */
export class UpdateMeDto {
  /** Nouveau pseudo (optionnel). */
  @IsOptional()
  @IsString()
  pseudo?: string;

  /** Nouvelle ville (optionnel). */
  @IsOptional()
  @IsString()
  ville?: string;

  /** Nouveau lieu (optionnel). */
  @IsOptional()
  @IsString()
  lieu?: string;

  /** Nouveau mot de passe (min 8). */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /** Confirmation du nouveau mot de passe. */
  @IsOptional()
  @IsString()
  passwordConfirmation?: string;
}
