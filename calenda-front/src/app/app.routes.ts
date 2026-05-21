import { Routes } from '@angular/router';

import { requireAdminGuard, requireAuthGuard } from './core/auth.guards';
import { AdminPendingPage } from './pages/admin-pending/admin-pending.page';
import { AdminAccountsPage } from './pages/admin-accounts/admin-accounts.page';
import { CalendarPage } from './pages/calendar/calendar.page';
import { EventDetailPage } from './pages/event-detail/event-detail.page';
import { FavoritesPage } from './pages/favorites/favorites.page';
import { ContactPage } from './pages/contact/contact.page';
import { HomePage } from './pages/home/home.page';
import { LoginPage } from './pages/login/login.page';
import { NewsPage } from './pages/news/news.page';
import { ProfilePage } from './pages/profile/profile.page';
import { PublicProfileEventsPage } from './pages/public-profile-events/public-profile-events.page';
import { PublicProfilePage } from './pages/public-profile/public-profile.page';
import { RegisterPage } from './pages/register/register.page';
import { PlacesPage } from './pages/places/places.page';
import { PlaceDetailPage } from './pages/place-detail/place-detail.page';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'news', component: NewsPage },
  { path: 'contact', component: ContactPage },
  { path: 'login', component: LoginPage },
  { path: 'register', component: RegisterPage },
  { path: 'calendar', component: CalendarPage },
  { path: 'events/:id', component: EventDetailPage },
  { path: 'places', component: PlacesPage },
  { path: 'places/:id', component: PlaceDetailPage },
  { path: 'favorites', component: FavoritesPage, canActivate: [requireAuthGuard] },
  { path: 'profile', component: ProfilePage, canActivate: [requireAuthGuard] },
  { path: 'profiles/:id', component: PublicProfilePage },
  { path: 'profiles/:id/events', component: PublicProfileEventsPage },
  { path: 'admin/pending-events', component: AdminPendingPage, canActivate: [requireAdminGuard] },
  { path: 'admin/accounts', component: AdminAccountsPage, canActivate: [requireAdminGuard] },
  { path: '**', redirectTo: '' },
];
