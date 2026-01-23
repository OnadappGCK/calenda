import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** DTO de connexion (`POST /api/auth/login`). */
export class LoginDto {
  /** Email utilisateur. */
  @IsEmail()
  email!: string;

  /** Mot de passe (min 8). */
  @IsString()
  @MinLength(8)
  password!: string;

  /** Token captcha (optionnel selon config). */
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
