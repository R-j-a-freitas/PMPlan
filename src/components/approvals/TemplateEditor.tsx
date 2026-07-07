import { useState } from 'react';
import { useAuthStore, useTemplateStore, useUiStore } from '../../stores';
import type { Country, EmailTemplateKey } from '../../types';
import { Button } from '../ui';

const TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  engineer_approval: 'Aprovação — Engenheiro',
  client_proposal: 'Proposta — Cliente',
  signature_letter: 'Carta de assinatura — Cliente',
};

const COUNTRY_LABELS: Record<Country, string> = { PT: 'Portugal', ES: 'Espanha' };

interface EditingState {
  key: EmailTemplateKey;
  country: Country;
}

// Editor de templates de email (assunto/corpo com placeholders {{ano}}, {{hospital}},
// {{engenheiro}}, {{tabela}}) — usado pela página Aprovações antes do envio. Cada
// template tem uma versão PT e uma ES (email_templates.country) — o envio escolhe
// sempre a versão do país do hospital (ver Approvals.tsx), nunca uma única versão fixa.
export function TemplateEditor() {
  const templates = useTemplateStore((state) => state.templates);
  const updateTemplate = useTemplateStore((state) => state.updateTemplate);
  const profile = useAuthStore((state) => state.profile);
  const pushToast = useUiStore((state) => state.pushToast);

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(key: EmailTemplateKey, country: Country) {
    const template = templates.find((item) => item.key === key && item.country === country);
    setEditing({ key, country });
    setSubject(template?.subject ?? '');
    setBody(template?.body ?? '');
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      await updateTemplate(editing.key, editing.country, subject, body, profile?.id ?? null);
      setEditing(null);
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : 'Falha ao gravar template.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-gray-200 p-3">
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Templates de email</h2>
      <p className="mb-2 text-xs text-gray-400">
        Placeholders disponíveis: {'{{ano}}'}, {'{{hospital}}'}, {'{{engenheiro}}'}, {'{{tabela}}'} (tabela automática
        gerada a partir das PMs). Cada template tem uma versão PT e uma ES — o envio usa sempre a versão do país do
        hospital.
      </p>
      <div className="flex flex-col gap-3">
        {(Object.keys(TEMPLATE_LABELS) as EmailTemplateKey[]).map((key) => (
          <div key={key}>
            <span className="text-sm font-medium">{TEMPLATE_LABELS[key]}</span>
            <div className="mt-1 flex flex-col gap-2">
              {(['PT', 'ES'] as Country[]).map((country) => {
                const template = templates.find((item) => item.key === key && item.country === country);
                const isEditing = editing?.key === key && editing.country === country;
                return (
                  <div key={country} className="rounded-md border border-gray-100 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase text-gray-500">{COUNTRY_LABELS[country]}</span>
                      {!isEditing && (
                        <Button variant="secondary" onClick={() => startEdit(key, country)}>
                          Editar
                        </Button>
                      )}
                    </div>
                    {!isEditing && template && <p className="mt-1 truncate text-xs text-gray-500">{template.subject}</p>}
                    {isEditing && (
                      <div className="mt-2 flex flex-col gap-2">
                        <input
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          value={subject}
                          onChange={(event) => setSubject(event.target.value)}
                          placeholder="Assunto"
                        />
                        <textarea
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                          rows={6}
                          value={body}
                          onChange={(event) => setBody(event.target.value)}
                          placeholder="Corpo"
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
                            Cancelar
                          </Button>
                          <Button onClick={handleSave} disabled={saving}>
                            Guardar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
