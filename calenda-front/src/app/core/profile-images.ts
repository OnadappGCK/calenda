export const PROFILE_IMAGES = [
  'img/profil/picture/bird-pp.png',
  'img/profil/picture/cat-pp.png',
  'img/profil/picture/dauphin-pp.png',
  'img/profil/picture/dog-pp.png',
  'img/profil/picture/fish-pp.png',
] as const;

export type ProfileImagePath = (typeof PROFILE_IMAGES)[number];

export function profileImageUrl(path: string | null | undefined) {
  const p = (path ?? '').trim();
  if (!p) {
    return '/assets/img/profil/picture/bird-pp.png';
  }
  return `/assets/${p}`;
}

export function allowedProfileImagesForRole(isAdmin: boolean | null | undefined) {
  if (isAdmin) {
    return [...PROFILE_IMAGES];
  }
  return PROFILE_IMAGES.filter((p) => /-pp\.png$/i.test(p));
}
