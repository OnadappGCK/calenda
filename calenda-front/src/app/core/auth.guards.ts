import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/** Guard: exige d'être connecté, sinon redirige vers `/login`. */
export const requireAuthGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.token()) {
    return router.parseUrl('/login');
  }

  try {
    await auth.ensureLoaded();
  } catch {
    // If the backend is temporarily unreachable (or /users/me fails), keep navigation working.
    // Protected pages will handle their own API errors.
    return true;
  }

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.parseUrl('/login');
};

/** Guard: exige le rôle ADMIN, sinon redirige vers `/`. */
export const requireAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  try {
    await auth.ensureLoaded();
  } catch {
    return router.parseUrl('/');
  }

  if (auth.user()?.isAdmin) {
    return true;
  }

  return router.parseUrl('/');
};
