import { useState } from 'react';
import { APPROVAL_TRACKS, APPROVAL_TRACK_LABELS, templateKeyFor } from '../../lib/approvalTrack';
import { useAuthStore, useTemplateStore, useUiStore } from '../../stores';
import type { Country, EmailTemplateKey, EmailTemplateStep } from '../../types';
import { Button } from '../ui';

// As três etapas com email, iguais em todas as vias. A chave concreta do template sai de
// templateKeyFor(via, etapa) — a via de braquiterapia tem os seus (`brachy_*`, migração
// 0017), para que editar o texto de uma não mexa no da outra.
const STEP_LABELS: Record<EmailTemplateStep, string> = {
  engineer_approval: 'Aprovação — Engenheiro',
  client_proposal: 'Proposta — Cliente',
  signature_letter: 'Carta de assinatura — Cliente',
};

const STEPS = Object.keys(STEP_LABELS) as EmailTemplateStep[];

const COUNTRY_LABELS: Record<Country, string> = { PT: 'Portugal', ES: 'Espanha' };

interface EditingState {
  key: EmailTemplateKey;
  country: Country;
}

// Editor de templates de email (assunto/corpo com placeholders {{ano}}, {{hospital}},
// {{engenheiro}}, {{tabela}}) — usado pela página Aprovações antes do envio. Cada template
// tem uma versão PT e uma ES (email_templates.country) — o envio escolhe sempre a versão do
// país do hospital (ver Approvals.tsx), nunca uma única versão fixa. E cada via de
// aprovação tem o seu conjunto de templates, porque são processos independentes.
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
      <p className="mb-3 text-xs text-gray-400">
        Placeholders disponíveis: {'{{ano}}'}, {'{{hospital}}'}, {'{{engenheiro}}'}, {'{{tabela}}'} (tabela automática
        gerada a partir das PMs). Cada template tem uma versão PT e uma ES — o envio usa sempre a versão do país do
        hospital. Cada <strong>via de aprovação</strong> tem o seu conjunto próprio: a braquiterapia é um processo
        independente, e o texto que lhe corresponde edita-se aqui sem afectar o da via geral.
      </p>

      <div className="flex flex-col gap-5">
        {APPROVAL_TRACKS.map((track) => (
          <div key={track}>
            <h3 className="mb-2 border-b border-gray-100 pb-1 text-sm font-semibold text-gray-700">
              Via {APPROVAL_TRACK_LABELS[track]}
            </h3>
            <div className="flex flex-col gap-3">
              {STEPS.map((step) => {
                const key = templateKeyFor(track, step);
                return (
                  <div key={key}>
                    <span className="text-sm font-medium">{STEP_LABELS[step]}</span>
                    <div className="mt-1 flex flex-col gap-2">
                      {(['PT', 'ES'] as Country[]).map((country) => {
                        const template = templates.find((item) => item.key === key && item.country === country);
                        const isEditing = editing?.key === key && editing.country === country;
                        return (
                          <div key={country} className="rounded-md border border-gray-100 p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-gray-500">
                                {COUNTRY_LABELS[country]}
                              </span>
                              {!isEditing && (
                                <Button variant="secondary" onClick={() => startEdit(key, country)}>
                                  Editar
                                </Button>
                              )}
                            </div>
                            {!isEditing && template && (
                              <p className="mt-1 truncate text-xs text-gray-500">{template.subject}</p>
                            )}
                            {/* Um template em falta é sinal de migração por aplicar — dizê-lo
                                aqui evita descobri-lo só no momento do envio, com um erro. */}
                            {!isEditing && !template && (
                              <p className="mt-1 text-xs text-amber-700">
                                Template ainda não existe na base de dados (migração 0017 por aplicar?) — o envio desta
                                etapa vai falhar até ser criado.
                              </p>
                            )}
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
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
