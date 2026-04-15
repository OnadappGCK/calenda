import { EtablissementType } from '../../common/enums/etablissement-type.enum';

export class CreateEtablissementDto {
  nom!: string;
  description?: string | null;
  adresse?: string | null;
  ville?: string | null;
  imageUrl?: string | null;
  type!: EtablissementType;
  tags?: string[];
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl?: string | null;
  contact?: string | null;
  horaires?: string | null;
  public?: boolean;
  featured?: boolean;
}

export class UpdateEtablissementDto {
  nom?: string;
  description?: string | null;
  adresse?: string | null;
  ville?: string | null;
  imageUrl?: string | null;
  type?: EtablissementType;
  tags?: string[];
  latitude?: number | null;
  longitude?: number | null;
  sourceUrl?: string | null;
  contact?: string | null;
  horaires?: string | null;
  public?: boolean;
  featured?: boolean;
}
