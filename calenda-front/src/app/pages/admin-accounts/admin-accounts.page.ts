import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../core/admin.service';
import { allowedProfileImagesForRole, profileImageUrl } from '../../core/profile-images';

type UserDto = {
  id: string;
  email: string;
  pseudo: string;
  ville: string;
  lieu: string;
  numero?: string | null;
  isAdmin: boolean;
  emailVerified: boolean;
  profileImage: string | null;
  createdAt: string;
  updatedAt: string;
};

type SortKey = 'pseudo' | 'email' | 'isAdmin' | 'createdAt';

type EditModel = {
  id: string;
  email: string;
  pseudo: string;
  ville: string;
  lieu: string;
  numero: string;
  isAdmin: boolean;
  emailVerified: boolean;
  profileImage: string | null;
  password: string;
  passwordConfirmation: string;
};

type CreateModel = {
  email: string;
  pseudo: string;
  ville: string;
  lieu: string;
  numero: string;
  isAdmin: boolean;
  profileImage: string;
  password: string;
  passwordConfirmation: string;
};

@Component({
  selector: 'app-admin-accounts-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-accounts.page.html',
  styleUrl: './admin-accounts.page.scss',
})
export class AdminAccountsPage implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly items = signal<UserDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  q = '';
  isAdminFilter: '' | 'true' | 'false' = '';

  sortKey: SortKey = 'pseudo';
  sortDir: 'asc' | 'desc' = 'asc';

  readonly showCreate = signal(false);
  readonly showEdit = signal(false);

  readonly create = signal<CreateModel>({
    email: '',
    pseudo: '',
    ville: 'Dev',
    lieu: 'Dev',
    numero: '',
    isAdmin: false,
    profileImage: allowedProfileImagesForRole(false)[0] ?? 'img/profil/picture/dog-pp.png',
    password: '',
    passwordConfirmation: '',
  });

  readonly edit = signal<EditModel | null>(null);

  readonly filteredSorted = computed(() => {
    const list = this.items();
    const q = (this.q ?? '').trim().toLowerCase();
    const isAdminFilter = this.isAdminFilter;

    const filtered = list.filter((u) => {
      if (isAdminFilter === 'true' && !u.isAdmin) return false;
      if (isAdminFilter === 'false' && u.isAdmin) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.pseudo.toLowerCase().includes(q);
    });

    const dir = this.sortDir === 'asc' ? 1 : -1;
    const key = this.sortKey;

    return [...filtered].sort((a, b) => {
      const av = (a as any)[key];
      const bv = (b as any)[key];
      return dir * String(av ?? '').localeCompare(String(bv ?? ''), 'fr');
    });
  });

  protected readonly profileImageUrl = profileImageUrl;

  allowedImagesFor(isAdmin: boolean) {
    return allowedProfileImagesForRole(isAdmin);
  }

  private ensureProfileImageAllowed(isAdmin: boolean, current: string | null | undefined) {
    const allowed = allowedProfileImagesForRole(isAdmin);
    const cur = (current ?? '').trim();
    if (cur && allowed.includes(cur as any)) {
      return cur;
    }
    return allowed[0] ?? '';
  }

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const users = await this.adminService.users().toPromise();
      this.items.set((users ?? []) as any);
    } catch {
      this.error.set('load_failed');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    const isAdmin = false;
    this.create.set({
      email: '',
      pseudo: '',
      ville: 'Dev',
      lieu: 'Dev',
      numero: '',
      isAdmin,
      profileImage: this.ensureProfileImageAllowed(isAdmin, null),
      password: '',
      passwordConfirmation: '',
    });
    this.showCreate.set(true);
  }

  closeCreate() {
    this.showCreate.set(false);
  }

  onCreateIsAdminChange(isAdmin: boolean) {
    const c = this.create();
    this.create.set({
      ...c,
      isAdmin,
      profileImage: this.ensureProfileImageAllowed(isAdmin, c.profileImage),
    });
  }

  async submitCreate() {
    const c = this.create();
    await this.adminService
      .createUser({
        email: c.email.trim(),
        pseudo: c.pseudo.trim(),
        ville: c.ville.trim(),
        lieu: c.lieu.trim(),
        numero: c.numero.trim() || null,
        isAdmin: c.isAdmin,
        profileImage: c.profileImage,
        password: c.password,
        passwordConfirmation: c.passwordConfirmation,
      })
      .toPromise();

    this.showCreate.set(false);
    await this.reload();
  }

  openEdit(u: UserDto) {
    this.edit.set({
      id: u.id,
      email: u.email,
      pseudo: u.pseudo,
      ville: u.ville,
      lieu: u.lieu,
      numero: (u.numero ?? '').trim(),
      isAdmin: u.isAdmin,
      emailVerified: u.emailVerified,
      profileImage: u.profileImage,
      password: '',
      passwordConfirmation: '',
    });
    this.showEdit.set(true);
  }

  closeEdit() {
    this.showEdit.set(false);
    this.edit.set(null);
  }

  onEditIsAdminChange(isAdmin: boolean) {
    const e = this.edit();
    if (!e) return;
    this.edit.set({
      ...e,
      isAdmin,
      profileImage: this.ensureProfileImageAllowed(isAdmin, e.profileImage),
    });
  }

  async submitEdit() {
    const e = this.edit();
    if (!e) return;

    const payload: any = {
      email: e.email.trim(),
      pseudo: e.pseudo.trim(),
      ville: e.ville.trim(),
      lieu: e.lieu.trim(),
      numero: e.numero.trim() || null,
      isAdmin: e.isAdmin,
      profileImage: e.profileImage,
    };

    if (e.password || e.passwordConfirmation) {
      payload.password = e.password;
      payload.passwordConfirmation = e.passwordConfirmation;
    }

    await this.adminService.updateUser(e.id, payload).toPromise();
    this.showEdit.set(false);
    this.edit.set(null);
    await this.reload();
  }
}
