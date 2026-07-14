// server.js — PDF Tool Box 支付后端
// 运行：npm init -y && npm i express cors && node server.js
// 免费部署：直接拖到 Vercel 即可
//
// 真实支付：将下方 XORPAY_SECRET / XORPAY_APPID 换成你的密钥
// 注册 xorpay：https://xorpay.com （个人可注册）

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cors());
app.use(express.json());

// ====== 配置（换成你的密钥即上线） ======
const CONFIG = {
  mode: process.env.PAY_MODE || 'demo', // 'demo' | 'live'
  // xorpay 配置（申请地址 https://xorpay.com）
  xorpay: {
    appid: process.env.XORPAY_APPID || '',
    secret: process.env.XORPAY_SECRET || '',
    api: 'https://xorpay.com/api',
  },
  price: 0.50, // 单次使用价格（元）
  title: 'PDF Tool Box 单次使用',
};

// ====== 内存订单存储（生产环境改用数据库） ======
const orders = new Map();

function genOrderId() {
  return 'TB' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

// ====== 创建订单 ======
app.post('/api/create-order', async (req, res) => {
  const orderId = genOrderId();
  const amount = CONFIG.price;

  orders.set(orderId, {
    id: orderId,
    amount,
    status: 'pending', // pending | paid | expired
    createdAt: Date.now(),
  });

  if (CONFIG.mode === 'demo') {
    // 演示模式：返回模拟数据
    return res.json({
      success: true,
      mode: 'demo',
      orderId,
      amount,
      qr_url: null, // 演示模式无真实二维码
      demo: true,
    });
  }

  // 真实模式：调用 xorpay 创建收款
  try {
    const params = {
      appid: CONFIG.xorpay.appid,
      amount,
      order_id: orderId,
      title: CONFIG.title,
    };
    const sign = crypto.createHash('md5')
      .update(Object.values(params).join('') + CONFIG.xorpay.secret)
      .digest('hex');
    params.sign = sign;

    const resp = await fetch(`${CONFIG.xorpay.api}/order/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await resp.json();

    if (data.status === 'ok') {
      orders.get(orderId).xorpayId = data.data.order_id;
      res.json({
        success: true,
        mode: 'live',
        orderId,
        amount,
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

// ====== 查询订单状态 ======
app.get('/api/order-status/:id', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' });
  }

  if (CONFIG.mode === 'demo') {
    // 演示模式：3 秒后自动确认
    if (order.status === 'pending' && Date.now() - order.createdAt > 3000) {
      order.status = 'paid';
    }
    return res.json({ success: true, status: order.status });
  }

  // 真实模式：查询 xorpay
  if (order.status === 'pending' && order.xorpayId) {
    try {
      const resp = await fetch(`${CONFIG.xorpay.api}/order/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appid: CONFIG.xorpay.appid,
          order_id: order.xorpayId,
          sign: crypto.createHash('md5').update(order.xorpayId + CONFIG.xorpay.secret).digest('hex'),
        }),
      });
      const data = await resp.json();
      if (data.status === 'ok' && data.data.status === 'paid') {
        order.status = 'paid';
      }
    } catch (err) {
      console.error('查询失败:', err.message);
    }
  }

  res.json({ success: true, status: order.status });
});

// ====== 反馈建议 ======
const feedbacks = [];
app.post('/api/feedback', (req, res) => {
  const fb = {
    id: 'FB' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: (req.body.text || '').slice(0, 2000),
    contact: (req.body.contact || '').slice(0, 200),
    page: req.body.page || '',
    time: req.body.time || new Date().toISOString(),
  };
  feedbacks.push(fb);
  console.log('📩 反馈:', JSON.stringify(fb));
  console.log(`   共 ${feedbacks.length} 条反馈`);
  res.json({ success: true, id: fb.id });
});
app.get('/api/feedback', (req, res) => {
  res.json({ success: true, count: feedbacks.length, items: feedbacks });
});

// ====== 启动 ======
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`\n🧰 Tool Box 支付后端已启动：http://localhost:${PORT}`);
  console.log(`   模式：${CONFIG.mode.toUpperCase()}`);
  console.log(`   价格：¥${CONFIG.price}/次`);
  if (CONFIG.mode === 'demo') {
    console.log(`   演示模式：下单后 3 秒自动支付成功\n`);
  }
});
