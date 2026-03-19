export type LanguageCode = 'fr' | 'en' | 'es' | 'it' | 'de';

export type TranslationTree = {
  [key: string]: string | TranslationTree;
};

export type LanguageOption = {
  code: LanguageCode;
  flag: string;
  label: string;
};
