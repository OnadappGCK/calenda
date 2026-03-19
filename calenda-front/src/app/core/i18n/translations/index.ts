import { TranslationTree, LanguageCode } from '../../i18n.types';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';

export const TRANSLATIONS: Record<LanguageCode, TranslationTree> = {
  fr,
  en,
  es,
  it,
  de,
};
