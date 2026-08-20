import { useState } from 'react';
import {
  APPROVAL_TRACKS,
  APPROVAL_TRACK_COLORS,
  APPROVAL_TRACK_LABELS,
  templateKeyFor,
} from '../../lib/approvalTrack';
import { useAuthStore, useTemplateStore, useUiStore } from '../../stores';
import type { ApprovalTrack, Country, EmailTemplateKey, EmailTemplateStep } from '../../types';
import { Card, FormModal, SegmentedGroup, SegmentedOption } from '../ui';

// As três etapas com email, iguais em todas as vias. A chave concreta do template sai de
// templateKeyFor(via, etapa) — a via de braquiterapia tem os seus (`brachy_*`, migração
// 0017), para que editar o texto de uma não mexa no da outra.
//
// Cada etapa leva o destinatário à parte do nome: quem está a rever os textos quer saber,
// antes de abrir, se aquele email vai para dentro (engenheiro) ou para o cliente.
const STEP_LABELS: Record<EmailTemplateStep, { title: string; audience: string }> = {
  engineer_approval: { title: 'Aprovação', audience: 'Engenheiro' },
  client_proposal: { title: 'Proposta', audience: 'Cliente' },
  signature_letter: { title: 'Carta de assinatura', audience: 'Cliente' },
};

const STEPS = Object.keys(STEP_LABELS) as EmailTemplateStep[];

const COUNTRIES: Country[] = ['PT', 'ES'];
const COUNTRY_LABELS: Record<Country, string> = { PT: 'Portugal', ES: 'Espanha' };

const PLACEHOLDERS = ['{{ano}}', '{{hospital}}', '{{engenheiro}}', '{{tabela}}'];

interface EditingState {
  key: EmailTemplateKey;
  country: Country;
  track: ApprovalTrack;
  step: EmailTemplateStep;
}

/** Os placeholders em chips de largura fixa, e não corridos no meio de uma frase: são
 *  literais para copiar tal e qual, e no meio do texto passavam por prosa. */
function PlaceholderChips() {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PLACEHOLDERS.map((placeholder) => (
        <code
          key={placeholder}
          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600"
        >
          {placeholder}
        </code>
      ))}
    </div>
  );
}

// Editor de templates de email (assunto/corpo com placeholders {{ano}}, {{hospital}},
// {{engenheiro}}, {{tabela}}) — usado pela página Aprovações antes do envio. Cada template
// tem uma versão PT e uma ES (email_templates.country) — o envio escolhe sempre a versão do
// país do hospital (ver Approvals.tsx), nunca uma única versão fixa. E cada via de
// aprovação tem o seu conjunto de templates, porque são processos independentes.
//
// Apresentação: as vias são um selector, e não duas secções empilhadas. Com 3 etapas × 2
// países × 2 vias, uma lista corrida dá doze blocos iguais de página inteira, onde nada
// diz de relance o que distingue um do outro e o botão de editar fica a meio metro do
// nome. Escolhida a via, as três etapas ficam lado a lado pela ordem em que acontecem —
// que é a forma como quem revê os textos pensa neles: a sequência de um envio.
export function TemplateEditor() {
  const templates = useTemplateStore((state) => state.templates);
  const updateTemplate = useTemplateStore((state) => state.updateTemplate);
  const profile = useAuthStore((state) => state.profile);
  const pushToast = useUiStore((state) => state.pushToast);

  const [track, setTrack] = useState<ApprovalTrack>('standard');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  function findTemplate(key: EmailTemplateKey, country: Country) {
    return templates.find((item) => item.key === key && item.country === country);
  }

  /** Templates em falta numa via — sinal de migração por aplicar. Contado por via para o
   *  aviso aparecer no selector, e não só depois de se lá entrar. */
  function missingCount(candidate: ApprovalTrack) {
    return STEPS.reduce(
      (total, step) =>
        total + COUNTRIES.filter((country) => !findTemplate(templateKeyFor(candidate, step), country)).length,
      0,
    );
  }

  function startEdit(state: EditingState) {
    const template = findTemplate(state.key, state.country);
    setEditing(state);
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
    <Card
      title="Templates de email"
      subtitle="Cada etapa tem uma versão PT e uma ES — o envio usa a do país do hospital. Cada via tem o seu conjunto próprio: editar a braquiterapia não mexe na via geral."
      actions={
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">Placeholders</span>
          <PlaceholderChips />
        </div>
      }
    >
      {/* Selector de via, e não tabs: são duas alternativas do mesmo nível. O ponto
          colorido é o mesmo que identifica a via na tabela de aprovações. */}
      <div className="mb-4 flex">
        <SegmentedGroup>
          {APPROVAL_TRACKS.map((candidate) => {
            const active = candidate === track;
            const missing = missingCount(candidate);
            return (
              <SegmentedOption key={candidate} active={active} onClick={() => setTrack(candidate)}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: APPROVAL_TRACK_COLORS[candidate], opacity: active ? 1 : 0.4 }}
                  />
                  Via {APPROVAL_TRACK_LABELS[candidate]}
                  {missing > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700">
                      {missing}
                    </span>
                  )}
                </span>
              </SegmentedOption>
            );
          })}
        </SegmentedGroup>
      </div>

      {/* As três etapas pela ordem do envio. Em ecrã estreito empilham, e aí o número da
          etapa é o que mantém a sequência legível. */}
      <div className="grid gap-3 lg:grid-cols-3">
        {STEPS.map((step, index) => {
          const key = templateKeyFor(track, step);
          return (
            <section key={key} className="flex flex-col rounded-lg border border-gray-200 bg-white">
              <header className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: APPROVAL_TRACK_COLORS[track] }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{STEP_LABELS[step].title}</p>
                  <p className="text-xs text-gray-500">para o {STEP_LABELS[step].audience.toLowerCase()}</p>
                </div>
              </header>

              <div className="flex flex-col divide-y divide-gray-100">
                {COUNTRIES.map((country) => {
                  const template = findTemplate(key, country);
                  return (
                    <button
                      key={country}
                      onClick={() => startEdit({ key, country, track, step })}
                      className="group flex flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors hover:bg-brand-50/50"
                    >
                      <div className="flex w-full items-center gap-2">
                        {/* O código do país em chip, e o nome por extenso ao lado: o chip é
                            o que se procura ao varrer a coluna, o nome é o que desfaz a
                            dúvida de quem não conhece a abreviatura. */}
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-gray-600">
                          {country}
                        </span>
                        <span className="text-xs text-gray-500">{COUNTRY_LABELS[country]}</span>
                        <span className="ml-auto text-xs font-medium text-gray-300 transition-colors group-hover:text-brand-600">
                          Editar
                        </span>
                      </div>
                      {template ? (
                        <p className="line-clamp-2 text-sm text-gray-700">{template.subject}</p>
                      ) : (
                        /* Um template em falta é sinal de migração por aplicar — dizê-lo
                           aqui evita descobri-lo só no momento do envio, com um erro. */
                        <p className="text-xs text-amber-700">
                          Ainda não existe na base de dados (migração 0017 por aplicar?) — o envio desta etapa falha até
                          ser criado.
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* A edição vai a modal, e não expande dentro do cartão: o corpo do email é o campo
          onde se passa o tempo todo, e numa coluna de um terço da página não se lê. */}
      {editing && (
        <FormModal
          title={`${STEP_LABELS[editing.step].title} · ${COUNTRY_LABELS[editing.country]} · Via ${
            APPROVAL_TRACK_LABELS[editing.track]
          }`}
          submitLabel="Guardar"
          size="lg"
          saving={saving}
          canSubmit={subject.trim().length > 0 && body.trim().length > 0}
          onSubmit={handleSave}
          onCancel={() => setEditing(null)}
        >
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Assunto</span>
            <input
              className="pm-field text-sm"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Assunto do email"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Corpo</span>
            <textarea
              className="pm-field font-mono text-sm leading-relaxed"
              rows={14}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Corpo do email"
            />
          </label>
          {/* Os placeholders repetidos aqui: é a editar que fazem falta, e ir buscá-los
              atrás do modal não dá. */}
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Placeholders:</span>
            <PlaceholderChips />
          </div>
        </FormModal>
      )}
    </Card>
  );
}
