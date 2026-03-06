import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class AdminCreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  pseudo!: string;

  @IsString()
  ville!: string;

  @IsString()
  lieu!: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(8)
  passwordConfirmation!: string;
}
