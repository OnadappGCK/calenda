import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** DTO d'inscription (`POST /api/auth/register`). */
export class RegisterDto {
  /** Pseudo affiché. */
  @IsString({ message: 'pseudo_invalid' })
  @IsNotEmpty({ message: 'pseudo_required' })
  @MinLength(2, { message: 'pseudo_too_short' })
  @MaxLength(30, { message: 'pseudo_too_long' })
  pseudo!: string;

  /** Email utilisateur. */
  @IsEmail({}, { message: 'email_invalid' })
  @IsNotEmpty({ message: 'email_required' })
  email!: string;

  @IsString({ message: 'adresse_invalid' })
  @IsNotEmpty({ message: 'adresse_required' })
  @MinLength(3, { message: 'adresse_too_short' })
  @MaxLength(200, { message: 'adresse_too_long' })
  adresse!: string;

  /** Ville. */
  @IsOptional()
  @IsString({ message: 'ville_invalid' })
  ville?: string;

  /** Lieu (ex: quartier). */
  @IsOptional()
  @IsString({ message: 'lieu_invalid' })
  lieu?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  /** Mot de passe (min 8). */
  @IsString({ message: 'password_invalid' })
  @IsNotEmpty({ message: 'password_required' })
  @MinLength(8, { message: 'password_too_short' })
  @MaxLength(72, { message: 'password_too_long' })
  password!: string;

  /** Confirmation de mot de passe (doit matcher `password`). */
  @IsString({ message: 'password_confirmation_invalid' })
  @IsNotEmpty({ message: 'password_confirmation_required' })
  @MinLength(8, { message: 'password_confirmation_too_short' })
  @MaxLength(72, { message: 'password_confirmation_too_long' })
  passwordConfirmation!: string;

  /** Token captcha (optionnel selon config). */
  @IsOptional()
  @IsString()
  captchaToken?: string;
}
