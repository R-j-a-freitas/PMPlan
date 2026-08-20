import { useEffect, useState } from 'react';
import { PageShell } from '../app/PageShell';
import { supabase } from '../lib/supabase';
import { useAuthStore, useEngineerStore, useUiStore } from '../stores';
import type { UserProfile, UserRole } from '../types';
import type { EngineerWithZones } from '../types';
import { Badge, Button, Card, EmptyState, FormModal, PageHeader } from '../components/ui';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'planner', label: 'Planeador' },
  { value: 'engineer', label: 'Engenheiro' },
  { value: 'readonly', label: 'Consulta' },
];

const EMPTY_FORM = { name: '', email: '', role: 'readonly' as UserRole, engineerId: '' };

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
  engineers,
  saving,
  onCancel,
  onSubmit,
}: {
  engineers: EngineerWithZones[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: UserForm) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  return (
    <FormModal
      title="Novo utilizador"
      submitLabel="Criar utilizador"
      saving={saving}
      canSubmit={Boolean(form.email.trim())}
      onCancel={onCancel}
      onSubmit={() => onSubmit(form)}
    >
      <input
        autoFocus
        placeholder="Nome"
        className="pm-field"
        value={form.name}
        onChange={(event) => setForm({ ...form, name: event.target.value })}
      />
      <input
        placeholder="Email (obrigatório)"
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
            {option.label}
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
          <option value="">Associar a engenheiro…</option>
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
  const canManageUsers = useAuthStore((state) => state.permissions.canManageUsers);
  const engineers = useEngineerStore((state) => state.engineers);
  const fetchEngineers = useEngineerStore((state) => state.fetchEngineers);
  const pushToast = useUiStore((state) => state.pushToast);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastCreated, setLastCreated] = useState<CreateUserResponse | null>(null);

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
        message:
          err instanceof Error
            ? err.message
            : 'Falha ao criar utilizador (a Edge Function admin-create-user está deployed?).',
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
        <PageHeader title="Utilizadores" />
        <Card>
          <EmptyState>Acesso restrito a administradores.</EmptyState>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Utilizadores"
        description="Contas de acesso à app. A palavra-passe definitiva é sempre definida pelo próprio, no primeiro login."
        actions={<Button onClick={() => setCreating(true)}>Adicionar utilizador</Button>}
      />

      <div>
        {lastCreated && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {lastCreated.tempPassword ? (
              <>
                Conta criada para <strong>{lastCreated.email}</strong>. Palavra-passe temporária (comunique-a
                uma única vez — será substituída no primeiro login):{' '}
                <code className="rounded bg-amber-100 px-1.5 py-0.5">{lastCreated.tempPassword}</code>
              </>
            ) : (
              <>
                Já existia uma conta para <strong>{lastCreated.email}</strong> — o perfil foi actualizado. Para
                definir a palavra-passe, use <em>“Esqueci-me da palavra-passe”</em> no ecrã de login.
              </>
            )}
          </div>
        )}

        <Card padded={false} title={`${users.length} utilizador(es)`}>
        <div className="overflow-x-auto">
        <table className="pm-table">
          <thead>
            <tr>
              <th className="py-1.5 pr-2">Nome</th>
              <th className="py-1.5 pr-2">Email</th>
              <th className="py-1.5 pr-2">Role</th>
              <th className="py-1.5 pr-2">Engenheiro</th>
              <th className="py-1.5 pr-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="py-1.5 pr-2">
                  <input
                    key={user.id}
                    defaultValue={user.name ?? ''}
                    placeholder="(sem nome)"
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
                        {option.label}
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
                      <option value="">Associar…</option>
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
                    <Badge tone="warning">Aguarda 1º login</Badge>
                  ) : (
                    <Badge tone="success">Activa</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {loading && <EmptyState size="compact">A carregar…</EmptyState>}
        {!loading && users.length === 0 && (
          <EmptyState action={<Button onClick={() => setCreating(true)}>Adicionar utilizador</Button>}>
            Ainda não há utilizadores registados.
          </EmptyState>
        )}
        </Card>
      </div>

      {creating && (
        <UserFormModal
          engineers={engineers}
          saving={saving}
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}
    </PageShell>
  );
}
