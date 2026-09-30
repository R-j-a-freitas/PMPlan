import { useEffect, useMemo, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { supabase } from '../lib/supabase';
import { useAuthStore, useEngineerStore, useUiStore } from '../stores';
import type { UserProfile, UserRole } from '../types';
import type { EngineerWithZones } from '../types';
import { useTableSort } from '../hooks';
import type { SortAccessors } from '../hooks';
import { Badge, Button, Card, EmptyState, FormModal, PageHeader, SortableTh } from '../components/ui';
import { RolePrivileges } from '../components/users';
import { useT, type TFunction, type TranslationKey } from '../i18n';

const ROLE_OPTIONS: { value: UserRole; labelKey: TranslationKey }[] = [
  { value: 'admin', labelKey: 'role.admin' },
  { value: 'planner', labelKey: 'role.planner' },
  { value: 'engineer', labelKey: 'role.engineer' },
  { value: 'readonly', labelKey: 'role.readonly' },
];

const EMPTY_FORM = { name: '', email: '', role: 'readonly' as UserRole, engineerId: '' };

type UserSortKey = 'name' | 'email' | 'role' | 'engineer' | 'state';

/** Ordem hierárquica dos papéis — a mesma de ROLE_OPTIONS. Ordenar por "Role" tem de
 *  agrupar por poder (admin → consulta) e não pelo acaso do alfabeto. */
const ROLE_RANK: Record<UserRole, number> = { admin: 0, planner: 1, engineer: 2, readonly: 3 };

interface CreateUserResponse {
  email: string;
  // null quando a conta já existia (idempotente) — nesse caso usa-se "Esqueci-me da
  // palavra-passe" para definir a password, em vez de uma temporária.
  tempPassword: string | null;
  existed?: boolean;
}

type UserForm = typeof EMPTY_FORM;

// Introdução de novo utilizador — ver FormModal para o porquê de estar em modal (o mesmo
// de Hospitais/Equipamentos/Engenheiros: quem vem consultar a lista vê a lista, e só quem
// vai criar é que abre o formulário). Estado próprio, montado só enquanto está aberto,
// para cada abertura começar com os campos limpos.
function UserFormModal({
  t,
  engineers,
  saving,
  onCancel,
  onSubmit,
}: {
  t: TFunction;
  engineers: EngineerWithZones[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: UserForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title={t('users.new')}
      submitLabel={t('users.create')}
      saving={saving}
      canSubmit={Boolean(form.email.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder={t('common.name')}
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder={t('users.emailRequired')}
        type="email"
        className="pm-field"
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
      />
      <select
        className="pm-field"
        value={form.role}
        onChange={(event) => setForm({ ...form, role: event.target.value as UserRole, engineerId: '' })}
      >
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
      {/* Associar a um engenheiro só faz sentido no perfil "Engenheiro" — é o que liga a
          conta às PMs dessa pessoa. */}
      {form.role === 'engineer' && (
        <select
          className="pm-field"
          value={form.engineerId}
          onChange={(event) => setForm({ ...form, engineerId: event.target.value })}
        >
          <option value="">{t('users.linkEngineer')}</option>
          {engineers.map((engineer) => (
            <option key={engineer.id} value={engineer.id}>
              {engineer.name}
            </option>
          ))}
        </select>
      )}
    </FormModal>
  );
}

// Gestão de utilizadores (secção: "todos os outros serão criados e aprovados pelos
// administradores"). Criar uma conta exige a service_role key, que nunca pode estar
// no browser — por isso chama a Edge Function admin-create-user em vez de Supabase
// directo. Essa função tem de estar deployed (supabase functions deploy admin-create-user).
export function Users() {
  const t = useT();
  const canManageUsers = useAuthStore((state) => state.permissions.canManageUsers);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const pushToast = useUiStore((state) => state.pushToast);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreateUserResponse | null>(null);

  // "Engenheiro" ordena pelo nome do engenheiro associado (o que a linha mostra); as
  // contas que não são de engenheiro não têm associação nenhuma e vão para o fim.
  const userSort = useMemo<SortAccessors<UserProfile, UserSortKey>>(
    () => ({
      name: (user) => user.name,
      email: (user) => user.email,
      role: (user) => ROLE_RANK[user.role],
      engineer: (user) => engineers.find((engineer) => engineer.id === user.engineer_id)?.name ?? null,
      // Ascendente põe primeiro as contas ainda por estrear — é o que exige acção.
      state: (user) => (user.must_change_password ? 0 : 1),
    }),
    [engineers],
  );

  const { rows: visibleUsers, sortableProps } = useTableSort(users, userSort, 'email');

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await supabase.from('user_profiles').select('*').order('email');
    if (error) {
      pushToast({ variant: 'error', message: error.message });
    } else {
      setUsers(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
    fetchEngineers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchEngineers]);

  async function handleCreate(form: UserForm) {
    if (!form.email) return;
    setSaving(true);
    setLastCreated(null);
    try {
      const { data, error } = await supabase.functions.invoke<CreateUserResponse>('admin-create-user', {
        body: {
          email: form.email,
          name: form.name || null,
          role: form.role,
          engineerId: form.engineerId || null,
        },
      });
      if (error) throw error;
      if (data) setLastCreated(data);
      setCreating(false);
      await fetchUsers();
    } catch (err) {
      pushToast({
        variant: 'error',
        message: err instanceof Error ? err.message : t('users.createFailed'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    const { error } = await supabase.from('user_profiles').update({ role }).eq('id', userId);
    if (error) {
      pushToast({ variant: 'error', message: error.message });
      return;
    }
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, role } : user)));
  }

  // O "Add user" do dashboard Supabase não tem campo de nome (só fica em auth.users
  // se vier por aqui ou pela Edge Function) — esta edição inline cobre esse caso.
  async function handleNameChange(userId: string, name: string) {
    const trimmed = name.trim() || null;
    const { error } = await supabase.from('user_profiles').update({ name: trimmed }).eq('id', userId);
    if (error) {
      pushToast({ variant: 'error', message: error.message });
      return;
    }
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, name: trimmed } : user)));
  }

  async function handleEngineerChange(userId: string, engineerId: string) {
    const value = engineerId || null;
    const { error } = await supabase.from('user_profiles').update({ engineer_id: value }).eq('id', userId);
    if (error) {
      pushToast({ variant: 'error', message: error.message });
      return;
    }
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, engineer_id: value } : user)));
  }

  if (!canManageUsers) {
    return (
      <PageShell>
        <PageHeader title={t('users.title')} />
        <Card>
          <EmptyState>{t('users.restricted')}</EmptyState>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('users.title')}
        description={t('users.description')}
        actions={<Button onClick={() => setCreating(true)}>{t('users.add')}</Button>}
      />

      <div>
        {lastCreated && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {lastCreated.tempPassword ? (
              <>
                {t('users.createdWithPassword', { email: lastCreated.email })}{' '}
                <code className="rounded bg-amber-100 px-1.5 py-0.5">{lastCreated.tempPassword}</code>
              </>
            ) : (
              t('users.alreadyExisted', { email: lastCreated.email })
            )}
          </div>
        )}

        <Card padded={false} title={t('users.count', { count: users.length })}>
        <div className="overflow-x-auto">
        <table className="pm-table">
          <thead>
            <tr>
              <SortableTh {...sortableProps('name')}>{t('common.name')}</SortableTh>
              <SortableTh {...sortableProps('email')}>{t('common.email')}</SortableTh>
              <SortableTh {...sortableProps('role')}>{t('common.role')}</SortableTh>
              <SortableTh {...sortableProps('engineer')}>{t('common.engineer')}</SortableTh>
              <SortableTh {...sortableProps('state')}>{t('common.status')}</SortableTh>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => (
              <tr key={user.id}>
                <td className="py-1.5 pr-2">
                  <input
                    key={user.id}
                    defaultValue={user.name ?? ''}
                    placeholder={t('users.noName')}
                    className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm transition-colors hover:border-gray-300 hover:bg-white focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    onBlur={(event) => {
                      if (event.target.value.trim() !== (user.name ?? '')) {
                        handleNameChange(user.id, event.target.value);
                      }
                    }}
                  />
                </td>
                <td className="py-1.5 pr-2">{user.email}</td>
                <td className="py-1.5 pr-2">
                  <select
                    className="pm-field"
                    value={user.role}
                    onChange={(event) => handleRoleChange(user.id, event.target.value as UserRole)}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 pr-2">
                  {user.role === 'engineer' ? (
                    <select
                      className="pm-field"
                      value={user.engineer_id ?? ''}
                      onChange={(event) => handleEngineerChange(user.id, event.target.value)}
                    >
                      <option value="">{t('users.link')}</option>
                      {engineers.map((engineer) => (
                        <option key={engineer.id} value={engineer.id}>
                          {engineer.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  {user.must_change_password ? (
                    <Badge tone="warning">{t('users.state.pending')}</Badge>
                  ) : (
                    <Badge tone="success">{t('users.state.active')}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {loading && <EmptyState size="compact">{t('common.loading')}</EmptyState>}
        {!loading && users.length === 0 && (
          <EmptyState action={<Button onClick={() => setCreating(true)}>{t('users.add')}</Button>}>
            {t('users.empty')}
          </EmptyState>
        )}
        </Card>

        <div className="mt-4">
          <RolePrivileges />
        </div>
      </div>

      {creating && (
        <UserFormModal
          t={t}
          engineers={engineers}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}
    </PageShell>
  );
}
