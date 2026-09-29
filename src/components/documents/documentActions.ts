import { useState } from 'react';
import { useSignedDocumentStore, useUiStore } from '../../stores';
import type { SignedDocument } from '../../types';
import { useT } from '../../i18n';

// Fora de SignedDocuments.tsx para o fast refresh: esse ficheiro só exporta componentes.
// Partilhado com a página de Aprovações (tabela das cartas assinadas e botão da linha).

export function formatDocumentDateTime(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === 'es' ? 'es-ES' : 'pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Abrir/descarregar passa sempre por um signed URL pedido no momento: o bucket é privado
 *  e o link só é válido durante alguns minutos. */
export function useDocumentActions() {
  const t = useT();
  const getDocumentUrl = useSignedDocumentStore((state) => state.getDocumentUrl);
  const pushToast = useUiStore((state) => state.pushToast);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function open(document: SignedDocument, download: boolean) {
    setBusyId(document.id);
    try {
      const url = await getDocumentUrl(document, { download });
      // _blank + noopener: o link é temporário mas ainda assim não se dá à página aberta
      // acesso ao window.opener.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      pushToast({ variant: 'error', message: err instanceof Error ? err.message : t('documents.openFailed') });
    } finally {
      setBusyId(null);
    }
  }

  return { open, busyId };
}
