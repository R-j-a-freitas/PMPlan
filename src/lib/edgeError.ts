// supabase-js encapsula respostas não-2xx de Edge Functions num FunctionsHttpError cujo
// .message é genérico ("Edge Function returned a non-2xx status code") — o motivo real vem
// no corpo da resposta (error.context: Response). Esta função extrai a mensagem { error }
// devolvida pela função para se poder mostrar ao utilizador, com fallback ao texto cru.
export async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error) return body.error;
      if (body.error) return JSON.stringify(body.error);
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text.slice(0, 300);
      } catch {
        // corpo ilegível — cai no fallback abaixo
      }
    }
  }
  return error instanceof Error ? error.message : fallback;
}
