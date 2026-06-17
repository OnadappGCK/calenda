import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailCodeDto {
  @IsString({ message: 'verification_code_invalid' })
  @IsNotEmpty({ message: 'verification_code_required' })
  code!: string;
}
