import { proxyToSupabaseEdge } from '../../../_shared/proxyToSupabaseEdge';

type CfParams = Record<string, string | string[] | undefined>;

function joinPathParam(path: string | string[] | undefined): string {
  if (path == null) return '';
  const p = Array.isArray(path) ? path.join('/') : String(path);
  return p ? `/${p.replace(/^\/+/, '')}` : '';
}

export async function onRequest(context: {
  request: Request;
  env: { SEFPOS_SUPABASE_URL?: string };
  params: CfParams;
}): Promise<Response> {
  const sub = joinPathParam(context.params.path);
  return proxyToSupabaseEdge(context.request, 'partner-orders-api', context.env, sub);
}
