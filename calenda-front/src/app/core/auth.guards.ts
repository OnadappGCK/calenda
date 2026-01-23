import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const requireAuthGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureLoaded();

  if (auth.isLoggedIn()) {
    return true;
  }

  return router.parseUrl('/login');
};

export const requireAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureLoaded();

  if (auth.user()?.role === 'ADMIN') {
    return true;
  }

  return router.parseUrl('/');
};
