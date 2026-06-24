import { IsEmail } from 'class-validator';

export class RequestEmailChangeVerificationDto {
  @IsEmail({}, { message: 'email_invalid' })
  email!: string;
}
