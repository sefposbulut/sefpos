/**
 * GET/POST https://www.sefpos.com.tr/api/getir-webhook?type=new|updated
 * → Supabase …/functions/v1/getir-webhook?…
 */
import { proxyToSupabaseEdge } from '../_shared/proxyToSupabaseEdge';

export async function onRequest(context: {
  request: Request;
  env: { SEFPOS_SUPABASE_URL?: string };
}): Promise<Response> {
  const { request, env } = context;

  if (request.method === 'GET' || request.method === 'HEAD') {
    return new Response(
      JSON.stringify({
        ok: true,
        service: 'sefpos-getir-webhook-proxy',
        hint: 'Getir bu adrese POST yapar. Header: x-api-key. Tarayıcıda test için POST kullanın.',
        supabase_path: '/functions/v1/getir-webhook',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  return proxyToSupabaseEdge(request, 'getir-webhook', env);
}
