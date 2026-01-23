import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** DTO d'inscription (`POST /api/auth/register`). */
export class RegisterDto {
  /** Pseudo affiché. */
  @IsString()
  pseudo!: string;

  /** Email utilisateur. */
  @IsEmail()
  email!: string;

  /** Ville. */
  @IsString()
  ville!: string;

  /** Lieu (ex: quartier). */
  @IsString()
  lieu!: string;

  /** Mot de passe (min 8). */
  @IsString()
  @MinLength(8)
  password!: string;

  /** Confirmation de mot de passe (doit matcher `password`). */
  @IsString()
  @MinLength(8)
  passwordConfirmation!: string;

  /** Token captcha (optionnel selon config). */
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
