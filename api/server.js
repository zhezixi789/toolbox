// server.js — Tool Box 支付后端（面包多版）
// 本地：npm i express cors && node api/server.js
// 线上：部署到 Vercel / Cloudflare Workers 均可
//
// 先注册面包多 mianbaoduo.com → 创建商品（¥0.50）
// → 拿到 API_KEY 和 PRODUCT_ID 填入下方

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ====== 👇 填你的面包多配置 ======
const CONFIG = {
  mode: process.env.PAY_MODE || 'demo',   // 'demo' | 'live'
  mianbaoduo: {
    apiKey: process.env.MBD_API_KEY || '',
    productId: process.env.MBD_PRODUCT_ID || '',
    api: 'https://api.mianbaoduo.com/v1',
  },
  price: 0.50,
};

// ====== 内存订单（生产换数据库） ======
const orders = new Map();
function genId() { return 'TB' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

// ====== 创建订单 ======
app.post('/api/create-order', async (req, res) => {
  const orderId = genId();

  orders.set(orderId, {
    id: orderId,
    status: 'pending',
    createdAt: Date.now(),
  });

  // 演示模式：3 秒自动成功
  if (CONFIG.mode === 'demo') {
    return res.json({
      success: true, mode: 'demo',
      orderId, amount: CONFIG.price,
      pay_url: null, demo: true,
    });
  }

  // 真实模式：调用面包多
  try {
    const resp = await fetch(`${CONFIG.mianbaoduo.api}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.mianbaoduo.apiKey}`,
      },
      body: JSON.stringify({
        product_id: CONFIG.mianbaoduo.productId,
        out_trade_no: orderId,
        total_amount: Math.round(CONFIG.price * 100), // 面包多用「分」
      }),
    });
    const data = await resp.json();
    if (data.code === 0) {
      orders.get(orderId).mdbId = data.data.order_id;
      res.json({
        success: true, mode: 'live',
        orderId, amount: CONFIG.price,
        pay_url: data.data.pay_url,
        qr_url: data.data.qr_url || data.data.pay_url,
        demo: false,
      });
    } else {
      res.status(500).json({ success: false, error: data.msg || '创建订单失败' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ====== 查询订单 ======
app.get('/api/order-status/:id', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: '订单不存在' });

  // 演示模式
  if (CONFIG.mode === 'demo') {
    if (order.status === 'pending' && Date.now() - order.createdAt > 3000) {
      order.status = 'paid';
    }
    return res.json({ success: true, status: order.status });
  }

  // 真实模式：查面包多
  if (order.status === 'pending' && order.mdbId) {
    try {
      const resp = await fetch(`${CONFIG.mianbaoduo.api}/orders/${order.mdbId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.mianbaoduo.apiKey}` },
      });
      const data = await resp.json();
      if (data.code === 0 && data.data.status === 'paid') {
        order.status = 'paid';
      }
    } catch (err) {
      console.error('查询失败:', err.message);
    }
  }

  res.json({ success: true, status: order.status });
});

// ====== 启动 ======
const PORT = process.env.PORT || 3456;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🧰 Tool Box 后端已启动 → http://localhost:${PORT}`);
    console.log(`   模式：${CONFIG.mode.toUpperCase()}  价格：¥${CONFIG.price}`);
  });
}

module.exports = app;
