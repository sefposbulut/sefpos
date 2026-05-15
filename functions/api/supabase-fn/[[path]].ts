/**
 * Geriye uyumluluk: /api/supabase-fn/getir-webhook → Supabase getir-webhook
 */
import { proxyToSupabaseEdge } from '../../_shared/proxyToSupabaseEdge';

type CfParams = Record<string, string | string[] | undefined>;

function joinPathParam(path: string | string[] | undefined): string {
  if (path == null) return '';
  return Array.isArray(path) ? path.join('/') : String(path);
}

export async function onRequest(context: {
  request: Request;
  env: { SEFPOS_SUPABASE_URL?: string };
  params: CfParams;
}): Promise<Response> {
  const sub = joinPathParam(context.params.path).replace(/^\/+/, '');
  if (!sub) {
    return new Response(
      JSON.stringify({
        error: 'Eksik yol',
        ornek: `${new URL(context.request.url).origin}/api/getir-webhook?type=new`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
  return proxyToSupabaseEdge(context.request, sub, context.env);
}
