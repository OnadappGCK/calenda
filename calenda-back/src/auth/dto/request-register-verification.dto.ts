import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RequestRegisterVerificationDto {
  @IsEmail({}, { message: 'email_invalid' })
  email!: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;
}
