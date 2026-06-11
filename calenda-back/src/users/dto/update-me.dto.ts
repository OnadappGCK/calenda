import { IsOptional, IsString, MinLength } from 'class-validator';

/** DTO de mise à jour du profil courant (`PATCH /api/users/me`). */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  email?: string;

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

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  /** Nouveau mot de passe (min 8). */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  /** Confirmation du nouveau mot de passe. */
  @IsOptional()
  @IsString()
  passwordConfirmation?: string;

  @IsOptional()
  @IsString()
  emailVerificationCode?: string;
}
