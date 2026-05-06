import { EventTag } from '../enums/event-tag.enum';

/**
 * Règles ordonnées par priorité : les tags les plus spécifiques d'abord.
 * La fonction retourne au maximum 3 tags.
 */
const RULES: { tag: EventTag; re: RegExp }[] = [
  { tag: EventTag.FEU_DARTIFICE, re: /feux?.?d.?artifice|pyrotechnie/i },
  { tag: EventTag.CONCERT,       re: /\bconcert\b|r[eé]cital/i },
  { tag: EventTag.DJ,            re: /\bdj\b|soir[eé]e dj|mix.?set|[eé]lectro/i },
  { tag: EventTag.SPORT,         re: /\bsport\b|football|tennis|natation|v[eé]lo|randonn[eé]e|trail|triathlon|course.?[aà].?pied|volley|basket|handball|rugby|athl[eé]tisme|escalade/i },
  { tag: EventTag.DANSE,         re: /\bdanse\b|salsa|tango|bachata|hip.?hop|\bsamba\b/i },
  { tag: EventTag.CONCOURS,      re: /\bconcours\b|comp[eé]tition/i },
  { tag: EventTag.PLEIN_AIR,     re: /plein.?air|ext[eé]rieur|en plein|\bparc\b|\bplage\b|esplanade|randonn[eé]e|\bv[eé]lo\b/i },
  { tag: EventTag.NUIT,          re: /\bnuit\b|nocturne|apr[eè]s.?minuit/i },
  { tag: EventTag.MUSIQUE,       re: /\bmusique\b|\bjazz\b|\brock\b|\bclassique\b|orchestre|chorale|guitare|piano|\bpop\b|\bblues\b|\bchanson\b/i },
  { tag: EventTag.FESTIF,        re: /f[eê]te\b|festif|carnaval|c[eé]l[eé]bration|\bbal\b/i },
  { tag: EventTag.CULTUREL,      re: /\bexposition\b|vernissage|patrimoine|conf[eé]rence culturelle/i },
  { tag: EventTag.ENFANT,        re: /\benfants?\b|jeune.?public|kids\b|ados?\b|adolescents?/i },
  { tag: EventTag.FAMILLE,       re: /\bfamilles?\b|en famille/i },
  { tag: EventTag.FOOD,          re: /gastronomie|march[eé].?gastr|produits.?locaux|\bd[iî]ner.?spectacle/i },
  { tag: EventTag.BOISSON,       re: /d[eé]gustation.?de.?vins?|\bvins?\b|\bchampagne\b|cave|ap[eé]ritif\b/i },
  { tag: EventTag.LIVE,          re: /\blive\b|en direct|acoustique\b/i },
  { tag: EventTag.NETWORKING,    re: /\bnetworking\b|afterwork/i },
  { tag: EventTag.RENCONTRE,     re: /\brencontre\b|\bforum\b|\bconf[eé]rence\b/i },
  { tag: EventTag.CALME,         re: /m[eé]ditation|\byoga\b|\blecture\b|retraite spirituelle/i },
  { tag: EventTag.TOUT_PUBLIC,   re: /tout public|tous publics|entr[eé]e gratuite/i },
  { tag: EventTag.INTERIEUR,     re: /\bauditorium\b|amphith[eé][aâ]tre|en salle/i },
];

/**
 * Déduit automatiquement jusqu'à 3 tags à partir du titre et de la description de l'événement.
 * Les règles sont testées dans l'ordre : les tags les plus spécifiques passent en premier.
 */
export function guessTags(titre: string, description: string): EventTag[] {
  const text = `${titre} ${description}`;
  const result: EventTag[] = [];
  for (const { tag, re } of RULES) {
    if (re.test(text)) {
      result.push(tag);
      if (result.length >= 3) break;
    }
  }
  return result;
}
