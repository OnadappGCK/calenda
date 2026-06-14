import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConversationGroupDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  firstMessage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lieuRdv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  heureRdv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactRdv?: string;
}
