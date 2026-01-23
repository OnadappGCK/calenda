import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  pseudo!: string;

  @IsEmail()
  email!: string;

  @IsString()
  ville!: string;

  @IsString()
  lieu!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(8)
  passwordConfirmation!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
