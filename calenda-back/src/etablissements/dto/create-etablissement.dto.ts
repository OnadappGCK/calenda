import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { EtablissementType } from '../../common/enums/etablissement-type.enum';

export class CreateEtablissementDto {
  @IsString()
  nom!: string;

  @IsOptional() @IsString()
  description?: string | null;

  @IsOptional() @IsString()
  adresse?: string | null;

  @IsOptional() @IsString()
  ville?: string | null;

  @IsOptional() @IsString()
  imageUrl?: string | null;

  @IsArray() @IsEnum(EtablissementType, { each: true })
  types!: EtablissementType[];

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsNumber()
  latitude?: number | null;

  @IsOptional() @IsNumber()
  longitude?: number | null;

  @IsOptional() @IsString()
  sourceUrl?: string | null;

  @IsOptional() @IsString()
  contact?: string | null;

  @IsOptional() @IsString()
  horaires?: string | null;

  @IsOptional() @IsString()
  heureOuverture?: string | null;

  @IsOptional() @IsString()
  heureFermeture?: string | null;

  @IsOptional() @IsBoolean()
  public?: boolean;

  @IsOptional() @IsBoolean()
  featured?: boolean;

  @IsOptional() @IsNumber()
  featuredTier?: number;

  @IsOptional() @IsString()
  featuredStart?: string | null;

  @IsOptional() @IsString()
  featuredEnd?: string | null;

  @IsOptional() @IsString()
  proprietaireId?: string | null;
}

export class UpdateEtablissementDto {
  @IsOptional() @IsString()
  nom?: string;

  @IsOptional() @IsString()
  description?: string | null;

  @IsOptional() @IsString()
  adresse?: string | null;

  @IsOptional() @IsString()
  ville?: string | null;

  @IsOptional() @IsString()
  imageUrl?: string | null;

  @IsOptional() @IsArray() @IsEnum(EtablissementType, { each: true })
  types?: EtablissementType[];

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsNumber()
  latitude?: number | null;

  @IsOptional() @IsNumber()
  longitude?: number | null;

  @IsOptional() @IsString()
  sourceUrl?: string | null;

  @IsOptional() @IsString()
  contact?: string | null;

  @IsOptional() @IsString()
  horaires?: string | null;

  @IsOptional() @IsString()
  heureOuverture?: string | null;

  @IsOptional() @IsString()
  heureFermeture?: string | null;

  @IsOptional() @IsBoolean()
  public?: boolean;

  @IsOptional() @IsBoolean()
  featured?: boolean;

  @IsOptional() @IsNumber()
  featuredTier?: number;

  @IsOptional() @IsString()
  featuredStart?: string | null;

  @IsOptional() @IsString()
  featuredEnd?: string | null;

  @IsOptional() @IsString()
  proprietaireId?: string | null;
}
