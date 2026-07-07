import { useEffect, useState } from 'react';
import { Topbar } from '../app/Topbar';
import { supabase } from '../lib/supabase';
import { useAuthStore, useEngineerStore, useUiStore } from '../stores';
import type { UserProfile, UserRole } from '../types';
import { Badge, Button } from '../components/ui';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'planner', label: 'Planeador' },
  { value: 'engineer', label: 'Engenheiro' },
  { value: 'readonly', label: 'Consulta' },
];

const EMPTY_FORM = { name: '', email: '', role: 'readonly' as UserRole, engineerId: '' };

interface CreateUserResponse {
  email: string;
  tempPassword: string;
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
  const [form, setForm] = useState(EMPTY_FORM);
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

  async function handleCreate() {
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
      setForm(EMPTY_FORM);
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
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <Topbar />
        <p className="p-4 text-sm text-gray-500">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex-1 overflow-y-auto p-4">
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Utilizadores</h1>

        {lastCreated && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            Conta criada para <strong>{lastCreated.email}</strong>. Palavra-passe temporária (comunique-a
            uma única vez — será substituída no primeiro login):{' '}
            <code className="rounded bg-amber-100 px-1.5 py-0.5">{lastCreated.tempPassword}</code>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-gray-200 p-3">
          <input
            placeholder="Nome"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            placeholder="Email"
            type="email"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <select
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {form.role === 'engineer' && (
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
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
          <Button onClick={handleCreate} disabled={saving || !form.email}>
            Criar utilizador
          </Button>
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-1.5 pr-2">Nome</th>
              <th className="py-1.5 pr-2">Email</th>
              <th className="py-1.5 pr-2">Role</th>
              <th className="py-1.5 pr-2">Engenheiro</th>
              <th className="py-1.5 pr-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-100">
                <td className="py-1.5 pr-2">
                  <input
                    key={user.id}
                    defaultValue={user.name ?? ''}
                    placeholder="(sem nome)"
                    className="rounded-md border border-transparent px-2 py-1 text-sm hover:border-gray-300 focus:border-gray-300"
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
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm"
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
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
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
                  {user.must_change_password && <Badge color="#D97706">Aguarda 1º login</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="mt-2 text-sm text-gray-400">A carregar…</p>}
      </div>
    </div>
  );
}
