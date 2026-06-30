/** Enum des origines d'un événement (création manuelle ou import externe). */
export enum EventOrigin {
  /** Événement créé via l'UI (calendrier/admin), sans import. */
  MANUAL = 'MANUAL',
  /** Événement importé depuis la source externe "martigues_site" (future méthode de merge). */
  MARTIGUES_SITE = 'MARTIGUES_SITE',
  /** Événement importé depuis la source externe "salsa_olivier" (future méthode de merge). */
  SALSA_OLIVIER = 'SALSA_OLIVIER',
  /** Événement importé depuis l'OT de Carry-le-Rouet (otcarrylerouet.fr). */
  CARRY_LE_ROUET = 'CARRY_LE_ROUET',
  /** Événement importé depuis le site de la ville de Sausset-les-Pins. */
  SAUSSET_LES_PINS = 'SAUSSET_LES_PINS',
}
