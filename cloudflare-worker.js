// functions/api/server.js — Cloudflare Workers 支付后端
// 部署：npm i -g wrangler && wrangler deploy
// 真实支付：搜索 XORPAY 替换密钥

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const MODE = env.PAY_MODE || 'demo';
    const PRICE = 0.50;

    // 内存订单（生产环境改用 KV）
    const orders = new Map(); // 注意：每次请求可能重置，生产用 KV

    // 创建订单
    if (url.pathname === '/api/create-order' && request.method === 'POST') {
      const orderId = 'TB' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

      if (MODE === 'demo') {
        return new Response(JSON.stringify({
          success: true, mode: 'demo', orderId, amount: PRICE, demo: true,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 真实模式：调用 xorpay
      // TODO: 替换为你的 xorpay 密钥
      return new Response(JSON.stringify({
        success: true, mode: 'live', orderId, amount: PRICE, qr_url: 'TODO',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 查询订单
    if (url.pathname.startsWith('/api/order-status/') && request.method === 'GET') {
      if (MODE === 'demo') {
        return new Response(JSON.stringify({
          success: true, status: 'paid', // 演示模式即刻返回成功
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // 真实模式：查询 xorpay
      return new Response(JSON.stringify({
        success: true, status: 'pending',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 反馈建议
    if (url.pathname === '/api/feedback' && request.method === 'POST') {
      const body = await request.json();
      const fb = {
        id: 'FB' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: (body.text || '').slice(0, 2000),
        contact: (body.contact || '').slice(0, 200),
        page: body.page || '',
        time: body.time || new Date().toISOString(),
        ip: request.headers.get('cf-connecting-ip') || '',
      };
      // Store in KV if available, otherwise just log
      if (env.FEEDBACK_KV) {
        const key = 'feedback:' + fb.id;
        await env.FEEDBACK_KV.put(key, JSON.stringify(fb));
        // Also update the list index
        const list = JSON.parse(await env.FEEDBACK_KV.get('feedback:list') || '[]');
        list.push(key);
        await env.FEEDBACK_KV.put('feedback:list', JSON.stringify(list));
      }
      console.log('📩 Feedback:', JSON.stringify(fb));
      return new Response(JSON.stringify({ success: true, id: fb.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
