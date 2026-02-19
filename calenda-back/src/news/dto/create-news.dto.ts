import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateNewsDto {
  @IsString()
  @IsNotEmpty()
  titre!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  datePublication!: string;

  @IsString()
  @IsNotEmpty()
  texte!: string;

  @IsOptional()
  @IsString()
  image?: string | null;
}
