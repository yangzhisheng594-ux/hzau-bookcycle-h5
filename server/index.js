// 华农书循环 H5 后端：Express + JWT + JSON 文件库
// 职责：认证/身份审核/书籍/购物车/订单状态机/求购/运营位/管理后台/图片上传/静态托管
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const security = require('./security');
const mailer = require('./mailer');
const emailCode = require('./emailCode');
const { sign, optionalAuth, authRequired, adminRequired, approvedRequired } = auth;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(optionalAuth);

const now = db.now;
const ok = (res, data = {}) => res.json({ success: true, ...data });
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/* ================= 工具 ================= */

function publicUser(user) {
  if (!user) return null;
  return {
    user_id: user.id,
    nick_name: user.nickName,
    avatar_url: user.avatarUrl,
    verifyStatus: user.verifyStatus,
    rejectReason: user.rejectReason || '',
    email: user.email || '',
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
    // 交易资料：邮箱只用于登录，交易往来靠下面这些字段
    contactQq: user.contactQq || '',
    contactWechat: user.contactWechat || '',
    contactPhone: user.contactPhone || '',
    defaultMeetPoint: user.defaultMeetPoint || '',
    bio: user.bio || '',
    contactVisible: user.contactVisible || 'order_only'
  };
}

/* ================= 交易资料：联系方式与隐私 =================
 * 邮箱是登录凭据，不适合当交易联系方式全站曝光。因此单独维护 QQ / 微信 / 手机，
 * 并由用户自己决定可见范围。默认 order_only —— 校园场景下最不容易出事的默认值：
 * 只有真正和你有订单关系的人，才看得到你的联系方式。
 */
const CONTACT_VISIBILITY = ['public', 'order_only', 'private'];

function hasOrderBetween(a, b) {
  const x = String(a), y = String(b);
  return db.get('orders').some(o =>
    (String(o.buyerId) === x && String(o.sellerId) === y) ||
    (String(o.buyerId) === y && String(o.sellerId) === x));
}

function contactVisibleTo(owner, viewer) {
  if (!owner) return false;
  if (viewer && String(viewer.id) === String(owner.id)) return true;
  const mode = owner.contactVisible || 'order_only';
  if (mode === 'private') return false;
  if (mode === 'public') return Boolean(viewer);
  return Boolean(viewer) && hasOrderBetween(viewer.id, owner.id);
}

// 对外的联系方式块。无权查看时只回 { visible:false }，
// 绝不回一串空字符串冒充「已授权但没填」——那种接口会诱导前端展示空白卡片。
function contactBlock(owner, viewer) {
  const mode = (owner && owner.contactVisible) || 'order_only';
  if (!contactVisibleTo(owner, viewer)) {
    return { visible: false, mode, reason: mode === 'private' ? '对方未公开联系方式' : '确认交易后可见' };
  }
  return {
    visible: true,
    mode,
    isSelf: Boolean(viewer && String(viewer.id) === String(owner.id)),
    qq: (owner && owner.contactQq) || '',
    wechat: (owner && owner.contactWechat) || '',
    phone: (owner && owner.contactPhone) || '',
    meetPoint: (owner && owner.defaultMeetPoint) || ''
  };
}

// 联系方式格式校验：一律宽松优先 —— 目的只是挡住明显不是联系方式的内容，
// 不能因为「微信号不以字母开头」这类细节把真实用户挡在门外。
const CONTACT_FIELD_RULES = {
  contactQq: { label: 'QQ 号', re: /^\d{5,12}$/, hint: 'QQ 号应为 5-12 位数字' },
  contactPhone: { label: '手机号', re: /^1[3-9]\d{9}$/, hint: '手机号格式不正确' },
  contactWechat: { label: '微信号', re: /^[A-Za-z0-9_-]{2,20}$/, hint: '微信号应为 2-20 位字母、数字、下划线或减号' }
};

// 资料完整度：只统计「交易能不能顺畅发生」相关的项，纯装饰性字段不计入
function profileCompleteness(user) {
  const items = [
    { key: 'avatar', label: '上传头像', done: Boolean(user.avatarUrl) && !String(user.avatarUrl).includes('demo-avatar') },
    { key: 'nickName', label: '设置昵称', done: Boolean(user.nickName) },
    { key: 'contact', label: '填写联系方式（QQ / 微信 / 手机任一项）', done: Boolean(user.contactQq || user.contactWechat || user.contactPhone) },
    { key: 'meetPoint', label: '填写常用交易地址 / 校区', done: Boolean(user.defaultMeetPoint) },
    { key: 'bio', label: '填写个人简介', done: Boolean(user.bio) }
  ];
  const done = items.filter(i => i.done).length;
  return {
    done,
    total: items.length,
    percent: Math.round((done / items.length) * 100),
    items,
    missing: items.filter(i => !i.done).map(i => i.label)
  };
}

const DEFAULT_SELLER = { nickName: '校园书友', avatarUrl: '/images/demo-avatar.png' };

function sellerInfoOf(book) {
  const seller = db.findById('users', book.sellerId);
  return seller
    ? { nickName: seller.nickName, avatarUrl: seller.avatarUrl }
    : DEFAULT_SELLER;
}

// 列表接口复用：一次构建 sellerId→卖家信息 映射，避免 bookSummary 逐条 findById 的 N+1 查询
function buildSellerMap() {
  const map = new Map();
  for (const seller of db.get('users')) {
    map.set(seller.id, { nickName: seller.nickName, avatarUrl: seller.avatarUrl });
  }
  return map;
}

// 商品状态对外映射：历史数据 selling→available、delisted→removed
function normalizeBookStatus(status) {
  if (status === 'selling') return 'available';
  if (status === 'delisted') return 'removed';
  return status;
}

function bookSummary(book, { withSeller = true, sellerMap = null } = {}) {
  const summary = {
    id: book.id,
    userId: book.sellerId,
    title: book.title,
    author: book.author || '',
    isbn: book.isbn || '',
    publisher: book.publisher || '',
    edition: book.edition || '',
    condition: book.condition || '',
    price: Number(book.price) || 0,
    originalPrice: book.originalPrice === null || book.originalPrice === undefined ? null : Number(book.originalPrice),
    courseCode: book.courseCode || '',
    major: book.major || '',
    grade: book.grade || '',
    description: book.description || '',
    status: normalizeBookStatus(book.status),
    views: Number(book.views || 0),
    categoryId: book.categoryId || null,
    coverUrl: book.coverUrl || '',
    imageUrls: book.imageUrls || [],
    createdAt: book.createdAt,
    updatedAt: book.updatedAt || book.createdAt
  };
  if (withSeller) summary.sellerInfo = sellerMap ? (sellerMap.get(book.sellerId) || DEFAULT_SELLER) : sellerInfoOf(book);
  return summary;
}

const ORDER_STATUS_TEXT = {
  locked: '已锁定·待卖家确认',
  trading: '交易中·待完成交付',
  completed: '交易完成',
  cancelled: '已取消',
  timeout: '已超时关闭'
};

function orderSummary(order) {
  const book = db.findById('books', order.bookId);
  const buyer = db.findById('users', order.buyerId);
  const seller = db.findById('users', order.sellerId);
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    bookId: order.bookId,
    title: book ? book.title : '(商品已删除)',
    coverUrl: book ? book.coverUrl : '',
    courseCode: book ? book.courseCode : '',
    price: Number(order.price),
    displayPrice: Number(order.price).toFixed(2),
    status: order.status,
    statusText: ORDER_STATUS_TEXT[order.status] || order.status,
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    buyerName: buyer ? buyer.nickName : '未知用户',
    sellerName: seller ? seller.nickName : '未知用户',
    createdAt: order.createdAt,
    lockedAt: order.lockedAt,
    tradingAt: order.tradingAt || null,
    completedAt: order.completedAt || null,
    cancelledAt: order.cancelledAt || null,
    cancelReason: order.cancelReason || ''
  };
}

function paginate(items, page, pageSize) {
  const currentPage = Math.max(Number(page) || 1, 1);
  const size = Math.min(Math.max(Number(pageSize) || 10, 1), 50);
  const totalItems = items.length;
  return {
    data: items.slice((currentPage - 1) * size, currentPage * size),
    pagination: {
      currentPage, page: currentPage, pageSize: size,
      totalItems, total: totalItems,
      totalPages: Math.ceil(totalItems / size),
      hasMore: currentPage * size < totalItems
    }
  };
}

function adminLog(action, targetType, targetId, detail, adminId) {
  db.insert('adminLogs', {
    id: db.nextId('adminLogs'), adminId: adminId || 'admin', action, targetType,
    targetId: String(targetId), detail: String(detail || ''), createdAt: now()
  });
}

/* ================= 认证 ================= */

// ⚠️ 安全：原 `/api/debug/auth` 诊断端点已移除。
//    它会公开回显鉴权通道、收到的 token 片段，以及 **JWT 密钥指纹**
//    （secretFingerprint = jwtSecret 前 8 位 + 后 4 位）。该端点在线上可匿名访问，
//    等于把签名密钥的绝大部分泄露出去；配合源码里写死的 jwtSecret，攻击者可伪造管理员令牌。
//    如需再排查托管网关行为，请仅在本地临时启用，且绝不可回显任何密钥片段。

// 演示/兼容登录：客户端持久 clientId 作为 openid（老用户免密续用），不签发刷新令牌
app.post('/api/auth/login', (req, res) => {
  const { clientId, nickName, avatarUrl, email, password } = req.body || {};
  // 新账号系统：邮箱/昵称 + 密码登录（走限流与锁定）
  if (email || password) return handlePasswordLogin(req, res, { email, password });
  const openid = String(clientId || '').trim();
  if (!openid || openid.length < 8) return fail(res, 400, '登录参数异常，请刷新重试');
  let user = db.get('users').find(item => item.openid === openid);
  if (!user) {
    user = {
      id: db.nextId('user'), openid,
      nickName: String(nickName || '华农书友').trim().slice(0, 16) || '华农书友',
      avatarUrl: String(avatarUrl || '/images/demo-avatar.png'),
      verifyStatus: 'none', rejectReason: '', proofImage: '',
      createdAt: now(), updatedAt: now()
    };
    db.insert('users', user);
  } else {
    // 仅首次（昵称为空/默认）时采纳客户端昵称，之后以服务端为准
    if (nickName && (!user.nickName || user.nickName === '华农书友')) {
      user.nickName = String(nickName).trim().slice(0, 16);
      user.updatedAt = now();
      db.persist();
    }
  }
  ok(res, {
    token: auth.signAccessToken(user),
    openid: user.openid,
    userData: publicUser(user)
  });
});

app.post('/api/auth/admin/login', (req, res) => {
  const { password } = req.body || {};
  // 防御：口令未配置时一律拒绝。登录判定是「输入 !== 配置」，配置若是空串，
  // 任何人提交空密码（`'' !== ''` 为 false）就能登进后台。
  if (!config.adminPassword) {
    return fail(res, 503, '后台未配置管理员口令，请设置 ADMIN_PASSWORD 环境变量或 server/site-config.json');
  }
  if (String(password || '') !== config.adminPassword) return fail(res, 403, '管理员密码错误');
  ok(res, { token: auth.signAdminToken('admin') });
});

/* ================= 账号系统 =================
 * 注册 / 邮箱验证 / 登录 / 刷新令牌轮换 / 登出 / 找回密码 / 修改密码
 * 参考：Supabase GoTrue（双令牌 + 邮箱流程）、Auth.js（会话可吊销）、OWASP ASVS V2/V3
 */
function clientIp(req) {
  return String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '');
}

function securityLog(action, userId, detail, req) {
  db.insert('securityLogs', {
    id: db.nextId('securityLog'),
    action,
    userId: userId || null,
    detail: String(detail).slice(0, 300),
    ip: clientIp(req).slice(0, 64),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    createdAt: now()
  });
}

// 登录审计：每一次登录尝试（成功 / 失败 / 被拦截）都落库。
// 这是后台回答「谁登录上去了、谁没登上来、为什么没上来」的唯一数据源。
// reason 取值：success | user_not_found | wrong_password | no_password
//             | account_locked | account_frozen | ip_rate_limited | challenge_required
function recordLoginAttempt(req, { userId = null, account = '', accountExists = false, success = false, reason = 'wrong_password', detail = '' } = {}) {
  db.insert('loginAttempts', {
    id: db.nextId('loginAttempt'),
    userId,
    account: String(account || '').slice(0, 120),
    accountExists: Boolean(accountExists),
    success: Boolean(success),
    reason,
    detail: String(detail || '').slice(0, 200),
    ip: clientIp(req).slice(0, 64),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    createdAt: now()
  });
}

// 统一签发「访问令牌 + 刷新令牌」，前端存 access 用于请求，refresh 用于静默续期
function issueSessionPair(user, req) {
  const { raw } = auth.issueRefreshToken(user, { userAgent: req.headers['user-agent'], ip: clientIp(req) });
  return { token: auth.signAccessToken(user), refreshToken: raw, userData: publicUser(user) };
}

function findUserByAccount(account) {
  const value = String(account || '').trim();
  const email = security.normalizeEmail(value);
  return db.get('users').find(u => (u.email && u.email.toLowerCase() === email) || u.nickName === value) || null;
}

// 注册：邮箱 + 密码 + 昵称，注册后需完成邮箱验证（未验证不能发布/购买）
app.post('/api/auth/register', (req, res) => {
  const { email, password, nickName, confirmPassword } = req.body || {};
  const limit = security.rateLimit('register:' + clientIp(req), 10, 10 * 60 * 1000);
  if (!limit.ok) return fail(res, 429, `注册过于频繁，请 ${Math.ceil(limit.retryAfter / 60)} 分钟后再试`);

  const normalized = security.normalizeEmail(email);
  if (!security.validateEmail(normalized)) return fail(res, 400, '请填写有效的邮箱地址');
  const passwordCheck = security.validatePassword(password);
  if (!passwordCheck.ok) return fail(res, 400, passwordCheck.message);
  if (confirmPassword !== undefined && String(confirmPassword) !== String(password)) return fail(res, 400, '两次输入的密码不一致');
  const nickCheck = security.validateNickname(nickName);
  if (!nickCheck.ok) return fail(res, 400, nickCheck.message);
  // 黑名单拦截必须早于「邮箱已注册」判断：黑名单账号的邮箱必然已存在，
  // 否则永远只会命中 409「已注册」，拉黑形同虚设
  const blacklistedEmail = db.get('users').find(u => u.blacklisted && u.email && u.email.toLowerCase() === normalized);
  if (blacklistedEmail) {
    securityLog('register.blocked', blacklistedEmail.id, '黑名单邮箱尝试注册', req);
    return fail(res, 403, '该邮箱已被列入黑名单，无法注册');
  }
  if (db.get('users').some(u => u.email && u.email.toLowerCase() === normalized)) {
    return fail(res, 409, '该邮箱已注册，请直接登录');
  }

  const user = {
    id: db.nextId('user'),
    openid: 'email-' + normalized,
    email: normalized,
    emailVerified: false,
    passwordHash: security.hashPassword(password),
    nickName: nickCheck.value,
    avatarUrl: '/images/demo-avatar.png',
    verifyStatus: 'none',
    rejectReason: '',
    proofImage: '',
    failedLogins: 0,
    lockedUntil: null,
    // --- 风控与审计字段（新增，全部可为空/默认值，兼容存量用户）---
    frozen: false,
    frozenReason: '',
    frozenAt: null,
    restrictPublishUntil: null,
    restrictBuyUntil: null,
    blacklisted: false,
    blacklistReason: '',
    creditScore: 100,
    violationCount: 0,
    registerIp: clientIp(req),
    lastLoginIp: '',
    loginCount: 0,
    lastFailedLoginAt: null,
    createdAt: now(),
    updatedAt: now(),
    lastLoginAt: null
  };
  db.insert('users', user);

  const raw = security.randomToken(32);
  db.insert('emailTokens', {
    id: db.nextId('emailToken'),
    userId: user.id,
    tokenHash: security.sha256(raw),
    email: normalized,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    createdAt: now(),
    usedAt: null
  });

  securityLog('register', user.id, '注册成功，待验证邮箱', req);

  // 签发 6 位验证码（新的主路径）。旧的链接令牌仍然写入 emailTokens，
  // 保证历史邮件里的验证链接不会突然失效。
  let issued = null;
  try {
    issued = emailCode.issue({ email: normalized, scene: emailCode.SCENE.VERIFY, ip: clientIp(req) });
  } catch (e) {
    console.error('[register] 生成邮箱验证码失败：', e.message);
  }

  const sendTask = issued
    ? mailer.sendEmailCode({
        to: normalized, nickName: user.nickName, code: issued.code,
        scene: 'verify', ttlSeconds: issued.ttlSeconds
      })
    : mailer.sendVerificationEmail(normalized, raw, user.nickName);

  sendTask.then(mailRes => {
    const session = issueSessionPair(user, req);
    const isSmtp = mailRes.mode === 'smtp';
    const minutes = Math.round((issued ? issued.ttlSeconds : 300) / 60);
    ok(res, {
      ...session,
      mailMode: mailRes.mode,
      message: isSmtp
        ? `注册成功，验证码已发送至 ${normalized}，${minutes} 分钟内有效`
        : '注册成功。邮件服务当前不可用，请直接使用下方验证码完成验证',
      // 只在邮件没真正发出去时回传，供注册者本人自证（账号就是他刚建的，不构成越权）
      devEmailCode: (!isSmtp && issued) ? issued.code : '',
      devVerifyLink: (!isSmtp && !issued) ? mailRes.link : '',
      emailCodeTtlSeconds: issued ? issued.ttlSeconds : 0
    });
  }).catch(() => {
    const session = issueSessionPair(user, req);
    ok(res, {
      ...session,
      mailMode: 'dev',
      message: '注册成功（邮件发送失败，可在验证页重新获取验证码）',
      devEmailCode: issued ? issued.code : '',
      emailCodeTtlSeconds: issued ? issued.ttlSeconds : 0
    });
  });
});

// 邮箱验证：邮件链接通常为 GET，同时支持 POST
function handleVerifyEmail(req, res) {
  const body = req.body || {};
  const code = String((req.query && req.query.code) || body.code || '').trim();

  // —— 路径 A：6 位验证码（当前主路径）——
  // 需要登录态来确定「验证谁的邮箱」；注册接口会直接返回会话，所以注册后立刻能用。
  if (code) {
    if (!req.user) return fail(res, 401, '请先登录，再输入验证码');
    if (req.user.emailVerified) return fail(res, 400, '邮箱已完成验证');
    const limit = security.rateLimit('code-verify:' + req.user.id, 10, 5 * 60 * 1000);
    if (!limit.ok) return fail(res, 429, `尝试过于频繁，请 ${limit.retryAfter} 秒后再试`);
    const result = emailCode.verify({ email: req.user.email, scene: emailCode.SCENE.VERIFY, code });
    if (!result.ok) {
      securityLog('email.verify_fail', req.user.id, `验证码校验失败：${result.code}`, req);
      return fail(res, 400, result.message, { code: result.code });
    }
    const user = db.findById('users', req.user.id);
    if (!user) return fail(res, 400, '用户不存在');
    user.emailVerified = true;
    user.updatedAt = now();
    emailCode.invalidateAll(user.email, emailCode.SCENE.VERIFY);
    db.persist();
    securityLog('email.verify', user.id, '邮箱验证通过（验证码）', req);
    return ok(res, { data: publicUser(user), message: '邮箱验证成功' });
  }

  // —— 路径 B：历史邮件里的验证链接（兼容，不要删，否则老链接会失效）——
  // 注意别名为 emailToken：请求层的用户令牌也占着 ?token= 这个参数名，
  // 已登录时两者会同时出现、被拼成 "邮箱令牌,用户令牌"，直接用 token 会失效。
  const linkToken = String(
    (req.query && (req.query.emailToken || req.query.token)) ||
    body.emailToken || body.token || ''
  );
  const raw = linkToken;
  if (!raw) return fail(res, 400, '缺少验证令牌或验证码');
  const hash = security.sha256(raw);
  const token = db.get('emailTokens').find(t => t.tokenHash === hash && !t.usedAt);
  if (!token) return fail(res, 400, '验证链接无效或已被使用');
  if (new Date(token.expiresAt).getTime() < Date.now()) return fail(res, 400, '验证链接已过期，请重新发送验证邮件');
  const user = db.findById('users', token.userId);
  if (!user) return fail(res, 400, '用户不存在');
  user.emailVerified = true;
  user.email = token.email || user.email;
  user.updatedAt = now();
  token.usedAt = now();
  db.persist();
  securityLog('email.verify', user.id, '邮箱验证通过', req);
  ok(res, { data: publicUser(user), message: '邮箱验证成功' });
}
app.get('/api/auth/verify-email', handleVerifyEmail);
app.post('/api/auth/verify-email', handleVerifyEmail);

// 重新获取邮箱验证码（需登录，防滥用：同一账号至少间隔 60 秒）
app.post('/api/auth/resend-verification', authRequired, (req, res) => {
  if (req.user.emailVerified) return fail(res, 400, '邮箱已完成验证');
  const wait = emailCode.secondsUntilResend(req.user.email, emailCode.SCENE.VERIFY);
  if (wait > 0) return fail(res, 429, `发送过于频繁，请 ${wait} 秒后再试`);
  const limit = security.rateLimit('resend:' + req.user.id, 5, 10 * 60 * 1000);
  if (!limit.ok) return fail(res, 429, `发送过于频繁，请 ${limit.retryAfter} 秒后再试`);

  let issued;
  try {
    issued = emailCode.issue({ email: req.user.email, scene: emailCode.SCENE.VERIFY, ip: clientIp(req) });
  } catch (e) {
    console.error('[resend-verification] 生成验证码失败：', e.message);
    return fail(res, 500, '验证码生成失败，请稍后重试');
  }
  mailer.sendEmailCode({
    to: req.user.email, nickName: req.user.nickName,
    code: issued.code, scene: 'verify', ttlSeconds: issued.ttlSeconds
  }).then(mailRes => {
    const isSmtp = mailRes.mode === 'smtp';
    ok(res, {
      mailMode: mailRes.mode,
      message: isSmtp
        ? `验证码已发送至 ${req.user.email}，${Math.round(issued.ttlSeconds / 60)} 分钟内有效`
        : '邮件服务不可用，请直接使用下方验证码完成验证',
      // 仅在邮件没真发出去时回传（本人已登录，自证无越权）
      devEmailCode: isSmtp ? '' : issued.code,
      ttlSeconds: issued.ttlSeconds,
      resendAfterSeconds: emailCode.RESEND_INTERVAL_MS / 1000
    });
  }).catch(() => fail(res, 500, '验证码发送失败，请稍后重试'));
});

// 密码登录：三层防护 + 统一失败文案（防账号枚举）+ 全量登录审计
//   第 1 层 账号维度：连续失败达上限 → 锁定 15 分钟，返回 429
//   第 2 层 IP 维度：同一 IP 每分钟登录请求超限 → 429 + 退避提示
//   第 3 层 行为维度：同一 IP 短时间内命中多个不同账号 → 强制人机校验
function handlePasswordLogin(req, res, { email, password }) {
  const account = String(email || '').trim();
  const ip = clientIp(req);
  const normalizedAccount = account.toLowerCase();

  // 第 2 层：IP 维度滑动窗口限流
  const ipLimit = security.rateLimit('login-ip:' + ip, security.LOGIN_IP_LIMIT, 60 * 1000);
  if (!ipLimit.ok) {
    recordLoginAttempt(req, { account, reason: 'ip_rate_limited', detail: 'IP 维度限流触发' });
    return fail(res, 429, `登录尝试过于频繁，请 ${ipLimit.retryAfter} 秒后再试`,
      { code: 'RATE_LIMITED', retryAfter: ipLimit.retryAfter });
  }

  // 第 3 层：同 IP 撞多个账号 → 人机校验（服务端出题，单次有效）
  const diversity = security.trackAccountDiversity(ip, normalizedAccount);
  if (diversity.requireCaptcha) {
    const body = req.body || {};
    const passed = security.consumeLoginChallenge(body.challengeId, body.challengeAnswer);
    if (!passed) {
      recordLoginAttempt(req, { account, reason: 'challenge_required', detail: `同 IP 已尝试 ${diversity.distinctAccounts} 个账号` });
      return fail(res, 403, '检测到异常登录行为，请完成人机校验后重试', {
        code: 'CHALLENGE_REQUIRED',
        challenge: security.createLoginChallenge()
      });
    }
  }

  // 账号维度频率限制（防单账号高频试探）
  const accountLimit = security.rateLimit('login:' + ip + ':' + normalizedAccount, security.LOGIN_ACCOUNT_LIMIT, 60 * 1000);
  if (!accountLimit.ok) {
    recordLoginAttempt(req, { account, reason: 'ip_rate_limited', detail: 'IP+账号维度限流触发' });
    return fail(res, 429, `尝试过于频繁，请 ${accountLimit.retryAfter} 秒后再试`,
      { code: 'RATE_LIMITED', retryAfter: accountLimit.retryAfter });
  }

  const user = findUserByAccount(account);

  // 账号不存在：跑一次等成本 bcrypt 抹平时序差，返回与「密码错误」逐字一致的文案
  if (!user) {
    security.dummyVerifyPassword(password);
    recordLoginAttempt(req, { account, accountExists: false, reason: 'user_not_found' });
    return fail(res, 401, security.GENERIC_LOGIN_FAIL_MESSAGE, { code: 'LOGIN_FAILED' });
  }

  // 第 1 层：账号锁定（连续失败达上限）
  if (security.isLocked(user)) {
    const minutes = security.lockRemainingMinutes(user);
    recordLoginAttempt(req, { userId: user.id, account, accountExists: true, reason: 'account_locked', detail: `剩余 ${minutes} 分钟` });
    return fail(res, 429, `账号已临时锁定，请 ${minutes} 分钟后重试`,
      { code: 'ACCOUNT_LOCKED', retryAfterMinutes: minutes });
  }

  // 被冻结账号：禁止登录（也要跑 dummy 校验，避免通过耗时区分出冻结账号）
  if (auth.isFrozen(user)) {
    security.dummyVerifyPassword(password);
    recordLoginAttempt(req, { userId: user.id, account, accountExists: true, reason: 'account_frozen', detail: user.frozenReason || '' });
    return fail(res, 403, `账号已被冻结${user.frozenReason ? '：' + user.frozenReason : ''}，如有疑问请联系管理员`,
      { code: 'ACCOUNT_FROZEN', frozenReason: user.frozenReason || '' });
  }

  // 无密码的历史演示账号：文案同样统一，不暴露账号类型
  if (!user.passwordHash) {
    security.dummyVerifyPassword(password);
    recordLoginAttempt(req, { userId: user.id, account, accountExists: true, reason: 'no_password' });
    return fail(res, 401, security.GENERIC_LOGIN_FAIL_MESSAGE, { code: 'LOGIN_FAILED' });
  }

  if (!security.verifyPassword(password, user.passwordHash)) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    user.lastFailedLoginAt = now();
    if (user.failedLogins >= security.MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + security.LOCK_MINUTES * 60 * 1000).toISOString();
      user.failedLogins = 0;
      db.persist();
      securityLog('login.lock', user.id, `连续失败达上限，锁定 ${security.LOCK_MINUTES} 分钟`, req);
      recordLoginAttempt(req, { userId: user.id, account, accountExists: true, reason: 'account_locked', detail: `密码错误次数过多，锁定 ${security.LOCK_MINUTES} 分钟` });
      return fail(res, 429, `密码错误次数过多，账号已锁定 ${security.LOCK_MINUTES} 分钟`,
        { code: 'ACCOUNT_LOCKED', retryAfterMinutes: security.LOCK_MINUTES });
    }
    db.persist();
    securityLog('login.fail', user.id, '密码错误', req);
    recordLoginAttempt(req, { userId: user.id, account, accountExists: true, reason: 'wrong_password', detail: `第 ${user.failedLogins} 次失败` });
    return fail(res, 401, security.GENERIC_LOGIN_FAIL_MESSAGE, { code: 'LOGIN_FAILED' });
  }

  // 登录成功：清零失败计数与相关限流，刷新登录画像
  user.failedLogins = 0;
  user.lockedUntil = null;
  user.lastLoginAt = now();
  user.lastLoginIp = ip;
  user.loginCount = Number(user.loginCount || 0) + 1;
  user.updatedAt = now();
  db.persist();
  security.clearRateLimit('login:' + ip + ':' + normalizedAccount);
  security.resetAccountDiversity(ip);
  securityLog('login.success', user.id, '登录成功', req);
  recordLoginAttempt(req, { userId: user.id, account, accountExists: true, success: true, reason: 'success' });
  ok(res, issueSessionPair(user, req));
}

// 人机校验题：前端在收到 CHALLENGE_REQUIRED 后可直接用返回的 challenge 作答
app.get('/api/auth/login-challenge', (_req, res) => {
  ok(res, { challenge: security.createLoginChallenge() });
});

// 刷新令牌轮换：旧令牌立即失效并签发新令牌；检测到「已失效令牌被重用」则整账号下线
app.post('/api/auth/refresh', (req, res) => {
  const raw = String((req.body || {}).refreshToken || '');
  const session = auth.findSessionByRaw(raw);
  if (!session) return fail(res, 401, '登录已失效，请重新登录');
  if (session.revokedAt) {
    auth.revokeAllSessions(session.userId);
    securityLog('token.reuse', session.userId, '检测到刷新令牌重用，已强制下线全部会话', req);
    return fail(res, 401, '登录状态异常，已下线全部设备，请重新登录');
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    auth.revokeSession(session);
    return fail(res, 401, '登录已过期，请重新登录');
  }
  const user = db.findById('users', session.userId);
  if (!user) return fail(res, 401, '用户不存在');
  auth.revokeSession(session);
  ok(res, issueSessionPair(user, req));
});

// 登出：吊销当前刷新令牌（前端需清除本地 access token）
app.post('/api/auth/logout', (req, res) => {
  const raw = String((req.body || {}).refreshToken || '');
  const session = auth.findSessionByRaw(raw);
  if (session) {
    auth.revokeSession(session);
    securityLog('logout', session.userId, '退出登录', req);
  }
  ok(res, { message: '已退出登录' });
});

app.post('/api/auth/logout-all', authRequired, (req, res) => {
  const count = auth.revokeAllSessions(req.user.id);
  securityLog('logout.all', req.user.id, `退出全部设备（${count} 个会话）`, req);
  ok(res, { message: `已退出全部设备（${count} 个会话）` });
});

app.get('/api/auth/sessions', authRequired, (req, res) => {
  const list = db.get('sessions')
    .filter(s => String(s.userId) === String(req.user.id) && !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now())
    .map(s => ({ id: s.id, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, userAgent: s.userAgent, ip: s.ip, current: s.tokenHash === security.sha256(String(req.query.current || '')) }));
  ok(res, { data: list });
});

app.delete('/api/auth/sessions/:id', authRequired, (req, res) => {
  const session = db.findById('sessions', req.params.id);
  if (!session || String(session.userId) !== String(req.user.id)) return fail(res, 404, '会话不存在');
  auth.revokeSession(session);
  ok(res, { message: '已下线该设备' });
});

// 找回密码：**发送 6 位验证码**（而不是链接）。为兼容历史邮件，旧的重置链接仍可在下方接口使用。
// 安全红线：这是**匿名**接口 —— 验证码/令牌一律不得回传给请求方。否则任何人填别人邮箱
//   就能拿到凭证改掉密码（账号接管）。邮件没发出去时只能提示联系管理员。
app.post('/api/auth/forgot-password', (req, res) => {
  const email = security.normalizeEmail((req.body || {}).email);
  const ipLimit = security.rateLimit('forgot-ip:' + clientIp(req), 10, 10 * 60 * 1000);
  if (!ipLimit.ok) return fail(res, 429, `请求过于频繁，请 ${Math.ceil(ipLimit.retryAfter / 60)} 分钟后再试`);
  // 无论邮箱是否存在都返回同一句（防账号枚举），mailMode 用于前端给出准确提示
  const generic = { message: '如果邮箱已注册，重置验证码将发送至该邮箱', mailMode: mailer.getStatus().mode };
  if (!security.validateEmail(email)) return ok(res, generic);

  const user = db.get('users').find(u => u.email && u.email.toLowerCase() === email);
  if (!user) { securityLog('password.forgot', null, '未命中账号（不泄露存在性）', req); return ok(res, generic); }

  const wait = emailCode.secondsUntilResend(email, emailCode.SCENE.RESET);
  if (wait > 0) return ok(res, generic);   // 刚发过：静默成功，避免暴露发送频率
  const mailLimit = security.rateLimit('forgot-mail:' + email, 5, 60 * 60 * 1000);
  if (!mailLimit.ok) {
    securityLog('password.forgot', user.id, '重置验证码触发邮箱级限流', req);
    return ok(res, generic);
  }

  let issued;
  try {
    issued = emailCode.issue({ email, scene: emailCode.SCENE.RESET, ip: clientIp(req) });
  } catch (e) {
    console.error('[forgot-password] 生成验证码失败：', e.message);
    return fail(res, 500, '验证码生成失败，请稍后重试');
  }
  securityLog('password.forgot', user.id, '生成重置验证码', req);
  mailer.sendEmailCode({
    to: email, nickName: user.nickName, code: issued.code,
    scene: 'reset', ttlSeconds: issued.ttlSeconds
  }).then(mailRes => {
    ok(res, { ...generic, mailMode: mailRes.mode, delivered: Boolean(mailRes.delivered) });
  }).catch(() => ok(res, generic));
});

// 重置密码：支持「邮箱+验证码」（当前主路径）与历史「重置链接」两种方式
// 两者都是一次性凭证，用后即焚；成功后全设备会话下线。
app.post('/api/auth/reset-password', (req, res) => {
  const { token, email, code, newPassword, confirmPassword } = req.body || {};
  const limit = security.rateLimit('reset:' + clientIp(req), 10, 10 * 60 * 1000);
  if (!limit.ok) return fail(res, 429, '请求过于频繁，请稍后再试');
  const check = security.validatePassword(newPassword);
  if (!check.ok) return fail(res, 400, check.message);
  if (confirmPassword !== undefined && String(confirmPassword) !== String(newPassword)) return fail(res, 400, '两次输入的密码不一致');

  let user = null;

  if (String(email || '').trim() && String(code || '').trim()) {
    // —— 路径 A：邮箱 + 6 位验证码 ——
    const em = security.normalizeEmail(email);
    const result = emailCode.verify({ email: em, scene: emailCode.SCENE.RESET, code });
    if (!result.ok) {
      const target = db.get('users').find(u => u.email && u.email.toLowerCase() === em);
      if (target) securityLog('password.reset_fail', target.id, `重置验证码校验失败：${result.code}`, req);
      return fail(res, 400, result.message, { code: result.code });
    }
    const target = db.get('users').find(u => u.email && u.email.toLowerCase() === em);
    if (!target) return fail(res, 400, '用户不存在');
    user = target;
    emailCode.invalidateAll(em, emailCode.SCENE.RESET);
  } else if (String(token || '').trim()) {
    // —— 路径 B：历史邮件里的重置链接（兼容，勿删）——
    const record = db.get('resetTokens').find(t => t.tokenHash === security.sha256(String(token)) && !t.usedAt);
    if (!record) return fail(res, 400, '重置链接无效或已被使用');
    if (new Date(record.expiresAt).getTime() < Date.now()) return fail(res, 400, '重置链接已过期，请重新申请');
    const target = db.findById('users', record.userId);
    if (!target) return fail(res, 400, '用户不存在');
    user = target;
    record.usedAt = now();
  } else {
    return fail(res, 400, '请填写邮箱与验证码，或使用邮件中的重置链接');
  }

  user.passwordHash = security.hashPassword(newPassword);
  user.failedLogins = 0;
  user.lockedUntil = null;
  user.updatedAt = now();
  db.persist();
  auth.revokeAllSessions(user.id);
  securityLog('password.reset', user.id, '密码重置成功，已下线全部会话', req);
  ok(res, { message: '密码重置成功，请使用新密码登录' });
});

// 修改密码（已登录）：需验证旧密码
app.put('/api/users/me/password', authRequired, (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body || {};
  if (!oldPassword) return fail(res, 400, '请输入当前密码');
  if (!security.verifyPassword(oldPassword, req.user.passwordHash)) return fail(res, 400, '当前密码不正确');
  const check = security.validatePassword(newPassword);
  if (!check.ok) return fail(res, 400, check.message);
  if (confirmPassword !== undefined && String(confirmPassword) !== String(newPassword)) return fail(res, 400, '两次输入的密码不一致');
  req.user.passwordHash = security.hashPassword(newPassword);
  req.user.updatedAt = now();
  db.persist();
  auth.revokeAllSessions(req.user.id);
  securityLog('password.change', req.user.id, '修改密码，已下线其他会话', req);
  ok(res, issueSessionPair(req.user, req));
});

app.get('/api/auth/me', authRequired, (req, res) => {
  ok(res, { data: publicUser(req.user), profileCompleteness: profileCompleteness(req.user) });
});

// 修改昵称：ID 与昵称分离；防空白/纯空格/超长；全站列表实时 JOIN，天然同步
app.put('/api/users/me/nickname', authRequired, (req, res) => {
  const nickName = String((req.body || {}).nickName || '').trim();
  if (!nickName) return fail(res, 400, '昵称不能为空');
  if (nickName.length > config.nicknameMax) return fail(res, 400, `昵称最长 ${config.nicknameMax} 个字符`);
  req.user.nickName = nickName;
  req.user.updatedAt = now();
  db.persist();
  ok(res, { data: publicUser(req.user), message: '昵称已更新' });
});

// 保存交易资料。逐字段校验、只写入请求里出现过的字段（未传=不改），
// 避免前端漏传某个字段时把已填好的资料清空。
app.put('/api/users/me', authRequired, (req, res) => {
  const body = req.body || {};
  const changed = [];

  if (body.avatarUrl !== undefined) {
    req.user.avatarUrl = String(body.avatarUrl).slice(0, 500);
    changed.push('头像');
  }

  for (const [field, rule] of Object.entries(CONTACT_FIELD_RULES)) {
    if (body[field] === undefined) continue;
    const value = String(body[field]).trim();
    if (value && !rule.re.test(value)) return fail(res, 400, rule.hint);
    req.user[field] = value;
    changed.push(rule.label);
  }

  if (body.defaultMeetPoint !== undefined) {
    const value = String(body.defaultMeetPoint).trim();
    if (value.length > 60) return fail(res, 400, '常用交易地址最长 60 个字符');
    req.user.defaultMeetPoint = value;
    changed.push('交易地点');
  }

  if (body.bio !== undefined) {
    const value = String(body.bio).trim();
    if (value.length > 120) return fail(res, 400, '个人简介最长 120 个字符');
    req.user.bio = value;
    changed.push('个人简介');
  }

  if (body.contactVisible !== undefined) {
    const value = String(body.contactVisible);
    if (!CONTACT_VISIBILITY.includes(value)) return fail(res, 400, '联系方式可见范围不合法');
    req.user.contactVisible = value;
    changed.push('联系方式可见范围');
  }

  if (!changed.length) return fail(res, 400, '没有需要保存的内容');

  req.user.updatedAt = now();
  db.persist();
  // 联系方式可见范围涉及隐私，变更单独留痕，便于事后追溯
  if (body.contactVisible !== undefined) {
    securityLog('contact.visibility.change', req.user.id, `联系方式可见范围改为 ${req.user.contactVisible}`, req);
  }
  ok(res, { data: publicUser(req.user), profileCompleteness: profileCompleteness(req.user), message: '资料已保存' });
});

/* ================= 账号生命周期（注销 / 删除 / 存储治理） =================
 * 设计取舍：订单是「买卖双方」共有的记录，单方面物理删除用户会让对方的订单
 * 变成无主孤儿。因此：
 *   - 有过交易的用户 → 只做「墓碑匿名化」：清空一切可识别信息且永久无法登录，
 *     但用户对象仍在；全站昵称是实时 JOIN，各处会自动统一显示「已注销用户」。
 *   - 从未产生交易的用户 → 物理删除，连人带数据彻底清掉。
 * 与该用户相关、且不涉及交易对方的数据（书籍/购物车/会话/令牌/通知/日志）
 * 一律物理删除 —— 这才是真正省空间的部分。
 */
const TOMBSTONE_NAME = '已注销用户';

// 尚未了结的订单（锁定中/交易中）：这类账号不允许注销
function activeOrderOf(userId) {
  const id = String(userId);
  return db.get('orders').find(order =>
    (String(order.buyerId) === id || String(order.sellerId) === id) &&
    (order.status === 'locked' || order.status === 'trading'));
}

// 墓碑化：抹掉一切能指向真人的信息，并让原凭据永久失效
function anonymizeUser(user, reason) {
  user.deleted = true;
  user.deletedAt = now();
  user.deletedReason = String(reason || '').slice(0, 100);
  user.nickName = TOMBSTONE_NAME;
  user.avatarUrl = '/images/demo-avatar.png';
  user.email = '';
  user.emailVerified = false;
  user.passwordHash = '';      // 清空密码 → 任何密码都登不进来
  user.proofImage = '';        // 企业微信截图属敏感资料，必须删
  user.verifyStatus = 'none';
  user.rejectReason = '';
  user.lastLoginIp = '';
  user.registerIp = '';
  user.failedLogins = 0;
  user.lockedUntil = null;
  user.frozen = false;
  user.frozenReason = '';
  user.restrictPublishUntil = null;
  user.restrictBuyUntil = null;
  user.blacklisted = false;
  // 交易资料同样是可指向真人的信息，匿名化时必须一并抹掉
  user.contactQq = '';
  user.contactWechat = '';
  user.contactPhone = '';
  user.defaultMeetPoint = '';
  user.bio = '';
  user.contactVisible = 'private';
  // openid 换新：否则同一设备的演示登录还能再次进入这个壳
  user.openid = 'deleted-' + user.id + '-' + crypto.randomBytes(4).toString('hex');
  user.updatedAt = now();
}

// 物理清除「只属于该用户」的数据；返回各集合清理条数，供后台展示
function purgeUserOwnedData(userId) {
  const id = String(userId);
  const removed = {};
  for (const name of ['sessions', 'emailTokens', 'resetTokens', 'cartItems',
    'notifications', 'loginAttempts', 'securityLogs', 'requests', 'verifications', 'books']) {
    const list = db.get(name);
    let count = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const owner = name === 'books' ? list[i].sellerId : list[i].userId;
      if (String(owner) === id) { list.splice(i, 1); count++; }
    }
    if (count) removed[name] = count;
  }
  db.persist();
  return removed;
}

// 记下「已被彻底删除」的 uid：用户行没了，但旧 access token 最长还能用 2 小时，
// auth 层要靠这个名单把旧令牌拦掉（只存数字 ID，几字节，且会按保留期清理）
function markUserPurged(userId) {
  const list = db.getSetting('purgedUsers', []) || [];
  if (!list.some(item => String(item.id) === String(userId))) {
    list.push({ id: userId, at: now() });
  }
  db.setSetting('purgedUsers', list.slice(-500));
}

// 用户自助注销（需密码 + 输入「注销」二次确认）
app.post('/api/users/me/delete', authRequired, (req, res) => {
  const user = req.user;
  if (user.deleted) return fail(res, 400, '该账号已注销');
  const body = req.body || {};
  if (String(body.confirm || '').trim() !== '注销') {
    return fail(res, 400, '请手动输入「注销」两字以确认');
  }
  if (user.passwordHash) {
    if (!body.password) return fail(res, 400, '请输入当前密码');
    if (!security.verifyPassword(String(body.password), user.passwordHash)) {
      securityLog('account.delete.failed', user.id, '注销账号时密码校验失败', req);
      return fail(res, 400, '密码不正确');
    }
  }
  const blocking = activeOrderOf(user.id);
  if (blocking) {
    return fail(res, 409, `你有进行中的订单（单号 ${blocking.orderNumber || blocking.id}），请先完成或取消后再注销`);
  }
  const removed = purgeUserOwnedData(user.id);
  anonymizeUser(user, '用户自助注销');
  db.persist();
  securityLog('account.delete', user.id, `用户自助注销账号，清除书籍 ${removed.books || 0} 本`, req);
  ok(res, { message: '账号已注销，感谢你的使用', data: { removed } });
});

/* ================= 身份审核（企业微信截图） ================= */

app.post('/api/verification', authRequired, (req, res) => {
  const proofImage = String((req.body || {}).proofImage || '').trim();
  if (!proofImage) return fail(res, 400, '请先上传企业微信截图');
  if (req.user.verifyStatus === 'approved') return fail(res, 400, '你已通过身份认证，无需重复提交');
  const record = {
    id: db.nextId('verification'), userId: req.user.id, proofImage,
    status: 'pending', reviewerId: '', reviewReason: '',
    createdAt: now(), reviewedAt: null
  };
  db.insert('verifications', record);
  req.user.verifyStatus = 'pending';
  req.user.proofImage = proofImage;
  req.user.rejectReason = '';
  req.user.updatedAt = now();
  db.persist();
  ok(res, { message: '资料已提交，请等待管理员审核', data: { status: 'pending' } });
});

app.get('/api/verification/mine', authRequired, (req, res) => {
  const latest = db.get('verifications').find(item => item.userId === req.user.id);
  ok(res, {
    data: {
      verifyStatus: req.user.verifyStatus,
      rejectReason: req.user.rejectReason || '',
      submittedAt: latest ? latest.createdAt : null,
      proofImage: latest ? latest.proofImage : ''
    }
  });
});

/* ================= 图片上传 ================= */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片文件'));
  }
});

// type=proof → 私有目录（审核截图，仅本人/管理员可见）；其余 → 公开目录
app.post('/api/upload', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, 400, '未接收到文件');
  const type = String(req.body.type || 'public');
  const scope = type === 'proof' ? 'private' : 'public';
  const dir = path.join(config.uploadDir, scope);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype] || '.jpg';
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, name), req.file.buffer);
  const url = scope === 'private' ? `/api/files/private/${name}` : `/uploads/public/${name}`;
  ok(res, { fileID: url, url });
});

// 私有文件：仅本人上传的审核图或管理员可访问
app.get('/api/files/private/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const record = db.get('verifications').find(item => String(item.proofImage).endsWith('/' + name));
  const isOwner = req.user && record && record.userId === req.user.id;
  const isAdmin = Boolean(req.admin);
  const isCurrentProof = req.user && req.user.proofImage && req.user.proofImage.endsWith('/' + name);
  if (!isOwner && !isAdmin && !isCurrentProof) return fail(res, 403, '无权访问该文件');
  const file = path.join(config.uploadDir, 'private', name);
  if (!fs.existsSync(file)) return fail(res, 404, '文件不存在');
  res.sendFile(file);
});

app.use('/uploads/public', express.static(path.join(config.uploadDir, 'public')));

/* ================= 分类 / 运营位 ================= */

app.get('/api/categories', (_req, res) => ok(res, { data: db.get('categories') }));

app.get('/api/banners', (_req, res) => {
  const list = db.get('banners')
    .filter(item => item.enabled)
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  ok(res, { data: list });
});

/* ================= 书籍 ================= */

function visibleBooks(query, viewer) {
  let books = db.get('books').filter(book => normalizeBookStatus(book.status) !== 'removed');
  const includeAll = query.includeStatus === 'all';
  if (!includeAll) {
    // 默认只看可购买；自己的书任何状态都可见
    books = books.filter(book =>
      normalizeBookStatus(book.status) === 'available' ||
      (viewer && book.sellerId === viewer.id));
  } else {
    books = books.filter(book => {
      const status = normalizeBookStatus(book.status);
      return status === 'available' || status === 'locked' || status === 'trading' || status === 'sold';
    });
  }
  const keyword = String(query.searchKeyword || '').trim().toLowerCase();
  if (keyword) {
    books = books.filter(book => [book.title, book.author, book.isbn, book.courseCode, book.major, book.grade, book.description]
      .some(value => String(value || '').toLowerCase().includes(keyword)));
  }
  if (Number(query.categoryId)) books = books.filter(book => book.categoryId === Number(query.categoryId));
  if (query.courseCode) books = books.filter(book => book.courseCode === query.courseCode);
  // 核心检索维度：专业 + 年级（首页「专业年级荐书」与搜索复用）
  if (query.major) books = books.filter(book => String(book.major || '') === query.major);
  if (query.grade) books = books.filter(book => String(book.grade || '') === query.grade);
  if (query.type === 'byUser' && Number(query.userId)) books = books.filter(book => book.sellerId === Number(query.userId));
  if (query.type === 'bestseller') books = books.slice().sort((a, b) => b.views - a.views);
  if (query.type === 'recent') books = books.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return books;
}

app.get('/api/books/homepage', (req, res) => {
  const books = db.get('books').filter(book => normalizeBookStatus(book.status) === 'available');
  const bestsellers = books.slice().sort((a, b) => b.views - a.views).slice(0, 3);
  const bestsellerIds = new Set(bestsellers.map(book => book.id));
  const recentReleases = books
    .filter(book => !bestsellerIds.has(book.id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 8);
  const sellerMap = buildSellerMap();
  ok(res, { data: { bestsellers: bestsellers.map(b => bookSummary(b, { sellerMap })), recentReleases: recentReleases.map(b => bookSummary(b, { sellerMap })) } });
});

app.get('/api/books', (req, res) => {
  const sellerMap = buildSellerMap();
  const list = visibleBooks(req.query, req.user).map(book => bookSummary(book, { sellerMap }));
  const page = paginate(list, req.query.page, req.query.pageSize);
  ok(res, { data: page.data, pagination: page.pagination });
});

app.get('/api/books/mine', authRequired, (req, res) => {
  const sellerMap = buildSellerMap();
  const books = db.get('books')
    .filter(book => book.sellerId === req.user.id && normalizeBookStatus(book.status) !== 'removed')
    .map(book => bookSummary(book, { sellerMap }));
  const page = paginate(books, req.query.page, req.query.pageSize);
  ok(res, { data: page.data, total: page.pagination.totalItems, page: page.pagination.currentPage, pageSize: page.pagination.pageSize, hasMore: page.pagination.hasMore });
});

app.get('/api/books/:id', (req, res) => {
  const book = db.findById('books', req.params.id);
  if (!book || normalizeBookStatus(book.status) === 'removed') return fail(res, 404, '书籍不存在或已下架');
  book.views = Number(book.views || 0) + 1;
  db.persist();
  // 卖家联系方式按卖家自己设定的可见范围下发（默认「仅交易对方可见」）
  const seller = db.findById('users', book.sellerId);
  ok(res, {
    data: {
      ...bookSummary(book),
      sellerInfo: sellerInfoOf(book),
      sellerContact: contactBlock(seller, req.user),
      sellerProfile: seller ? { bio: seller.bio || '', meetPoint: seller.defaultMeetPoint || '' } : null
    }
  });
});

const CONDITIONS = ['全新', '九成新', '八五成新', '八成新', '七成新', '六成新及以下'];

// 限制发布 / 限制购买：服务端兜底校验（前端提示只是体验优化）
function guardRestriction(req, res, kind) {
  const field = kind === 'publish' ? 'restrictPublishUntil' : 'restrictBuyUntil';
  const rest = auth.activeRestriction(req.user && req.user[field]);
  if (!rest) return false;
  fail(res, 403,
    kind === 'publish'
      ? `你的账号已被限制发布，约 ${rest.remainingHours} 小时后解除`
      : `你的账号已被限制购买，约 ${rest.remainingHours} 小时后解除`,
    { code: kind === 'publish' ? 'PUBLISH_RESTRICTED' : 'BUY_RESTRICTED', until: rest.until });
  return true;
}

// 发布/编辑：图片必填（极简流），书名必填，其余选填；发布即上架 available
app.post('/api/books', approvedRequired, (req, res) => {
  if (guardRestriction(req, res, 'publish')) return;
  const form = req.body || {};
  const imageUrls = Array.isArray(form.imageUrls) ? form.imageUrls.filter(Boolean) : [];
  if (!imageUrls.length) return fail(res, 400, '请至少上传一张教材实拍图');
  const title = String(form.title || '').trim();
  if (!title) return fail(res, 400, '请填写书名');
  const price = Number(form.price);
  if (!(price >= 0) || price > 100000) return fail(res, 400, '请填写合理售价');
  const bookIdToEdit = Number(form.bookIdToEdit);
  const existing = bookIdToEdit ? db.get('books').find(item => item.id === bookIdToEdit && item.sellerId === req.user.id) : null;
  if (existing && !['available'].includes(normalizeBookStatus(existing.status))) {
    return fail(res, 400, '该书籍正在交易或已售出，不能编辑');
  }
  const condition = CONDITIONS.includes(form.condition) ? form.condition : (form.condition ? String(form.condition).slice(0, 10) : '');
  const fields = {
    title: title.slice(0, 60),
    author: String(form.author || '').trim().slice(0, 40),
    isbn: String(form.isbn || '').trim().slice(0, 20),
    publisher: String(form.publisher || '').trim().slice(0, 40),
    edition: String(form.edition || '').trim().slice(0, 20),
    condition,
    price,
    originalPrice: form.originalPrice === null || form.originalPrice === undefined || form.originalPrice === '' ? null : Number(form.originalPrice),
    courseCode: String(form.courseCode || '').trim().slice(0, 20),
    major: String(form.major || '').trim().slice(0, 30),
    grade: String(form.grade || '').trim().slice(0, 10),
    description: String(form.description || '').trim().slice(0, 500),
    categoryId: Number(form.categoryId) || null,
    coverUrl: imageUrls[0],
    imageUrls: imageUrls.slice(0, 9),
    updatedAt: now()
  };
  if (existing) {
    Object.assign(existing, fields);
    db.persist();
    return ok(res, { message: '修改成功', data: { bookId: existing.id } });
  }
  const book = {
    id: db.nextId('book'), sellerId: req.user.id, ...fields,
    status: 'available', views: 0, createdAt: now()
  };
  db.insert('books', book);
  ok(res, { message: '发布成功', data: { bookId: book.id } });
});

// 下架（卖家本人，未在交易中）
app.post('/api/books/:id/remove', authRequired, (req, res) => {
  const book = db.findById('books', req.params.id);
  if (!book || book.sellerId !== req.user.id) return fail(res, 404, '书籍不存在或无权操作');
  if (['locked', 'trading'].includes(normalizeBookStatus(book.status))) return fail(res, 400, '书籍正在交易中，请先处理订单');
  book.status = 'removed';
  book.updatedAt = now();
  db.persist();
  ok(res, { message: '已下架' });
});

/* ================= 购物车 ================= */

app.get('/api/cart', authRequired, (req, res) => {
  const items = db.get('cartItems')
    .filter(item => item.userId === req.user.id)
    .map(item => {
      const book = db.findById('books', item.bookId);
      if (!book || normalizeBookStatus(book.status) !== 'available') return null;
      return {
        cartItemId: item.id, id: book.id, bookId: book.id,
        title: book.title, spec: book.courseCode, courseCode: book.courseCode,
        price: Number(book.price), currentPrice: Number(book.price), priceAtAdd: Number(book.price),
        quantity: 1, coverUrl: book.coverUrl
      };
    })
    .filter(Boolean);
  ok(res, { data: items });
});

app.post('/api/cart', authRequired, (req, res) => {
  const book = db.findById('books', (req.body || {}).bookId);
  if (!book || normalizeBookStatus(book.status) !== 'available') return fail(res, 400, '该书籍暂不可购买');
  if (book.sellerId === req.user.id) return fail(res, 400, '不能购买自己发布的书籍');
  const exists = db.get('cartItems').some(item => item.userId === req.user.id && item.bookId === book.id);
  if (!exists) db.insert('cartItems', { id: db.nextId('cartItem'), userId: req.user.id, bookId: book.id, addedAt: now() });
  const totalCartItems = db.get('cartItems').filter(item => item.userId === req.user.id).length;
  ok(res, { message: '已加入购物车', totalCartItems });
});

app.post('/api/cart/delete', authRequired, (req, res) => {
  const ids = ((req.body || {}).cartItemIds || []).map(String);
  db.get('cartItems')
    .filter(item => item.userId === req.user.id && ids.includes(String(item.id)))
    .forEach(item => db.remove('cartItems', item.id));
  ok(res, { message: '已移出购物车' });
});

/* ================= 订单（核心：确认购买 = 锁单，非支付） ================= */

// 原子锁单：同步函数内完成「状态检查 + 修改 + 落盘」，无 await，单线程天然互斥。
// 用户 A/B 同时点击，只有第一个进入的请求成功，第二个必然看到 locked 状态。
function lockBookForOrder(book, buyer) {
  if (!book) return { ok: false, message: '商品不存在' };
  const status = normalizeBookStatus(book.status);
  if (status !== 'available') {
    return {
      ok: false,
      message: status === 'sold' ? '这本书已售出，请选择其他书籍'
        : '这本书刚刚已被其他用户锁定，请选择其他书籍'
    };
  }
  if (book.sellerId === buyer.id) return { ok: false, message: '不能购买自己发布的书籍' };
  book.status = 'locked';
  book.lockedBy = buyer.id;
  book.lockedAt = now();
  book.updatedAt = now();
  const order = {
    id: db.nextId('order'),
    orderNumber: `SB${Date.now()}${book.id}`,
    bookId: book.id, buyerId: buyer.id, sellerId: book.sellerId,
    price: Number(book.price), status: 'locked',
    createdAt: now(), lockedAt: now()
  };
  db.get('orders').unshift(order);
  db.persist();
  return { ok: true, order };
}

// 确认购买（支持购物车多本）：逐本原子锁，部分失败返回明细
app.post('/api/orders', approvedRequired, (req, res) => {
  if (guardRestriction(req, res, 'buy')) return;
  const items = Array.isArray((req.body || {}).items) ? req.body.items : [];
  if (!items.length) return fail(res, 400, '订单商品为空');
  const orders = [];
  const failed = [];
  for (const item of items) {
    const book = db.findById('books', item.bookId);
    const result = lockBookForOrder(book, req.user);
    if (result.ok) {
      orders.push(result.order);
      if (item.cartItemId) {
        const cartItem = db.get('cartItems').find(ci => String(ci.id) === String(item.cartItemId) && ci.userId === req.user.id);
        if (cartItem) db.remove('cartItems', cartItem.id);
      }
    } else {
      failed.push({ bookId: item.bookId, title: book ? book.title : '(未知)', message: result.message });
    }
  }
  if (!orders.length) return fail(res, 409, failed[0] ? failed[0].message : '商品已被锁定', { failed });
  ok(res, {
    message: failed.length
      ? `已锁定 ${orders.length} 本，${failed.length} 本被他人抢先锁定`
      : '已确认购买并锁定商品，请与卖家联系完成线下交付',
    data: {
      orders: orders.map(orderSummary),
      orderIds: orders.map(order => order.id),
      failed
    }
  });
});

function findOrderForUser(req, res) {
  const order = db.findById('orders', req.params.id);
  if (!order) { fail(res, 404, '订单不存在'); return null; }
  if (order.buyerId !== req.user.id && order.sellerId !== req.user.id) {
    fail(res, 403, '无权操作该订单');
    return null;
  }
  return order;
}

function releaseBook(book, order) {
  if (book && normalizeBookStatus(book.status) !== 'sold') {
    book.status = 'available';
    book.lockedBy = null;
    book.lockedAt = null;
    book.updatedAt = now();
  }
}

// 卖家确认交易：locked → trading
app.post('/api/orders/:id/trading', authRequired, (req, res) => {
  const order = findOrderForUser(req, res);
  if (!order) return;
  if (order.sellerId !== req.user.id) return fail(res, 403, '仅卖家可确认交易');
  if (order.status !== 'locked') return fail(res, 400, '当前订单状态不能确认交易');
  const book = db.findById('books', order.bookId);
  order.status = 'trading';
  order.tradingAt = now();
  if (book) { book.status = 'trading'; book.updatedAt = now(); }
  db.persist();
  ok(res, { message: '已确认交易，等待双方完成线下交付', data: orderSummary(order) });
});

// 任一方确认完成：locked/trading → completed，商品 → sold
app.post('/api/orders/:id/complete', authRequired, (req, res) => {
  const order = findOrderForUser(req, res);
  if (!order) return;
  if (!['locked', 'trading'].includes(order.status)) return fail(res, 400, '当前订单状态不能完成');
  const book = db.findById('books', order.bookId);
  order.status = 'completed';
  order.completedAt = now();
  if (book) { book.status = 'sold'; book.updatedAt = now(); }
  db.persist();
  ok(res, { message: '交易完成，感谢使用华农书循环', data: orderSummary(order) });
});

// 取消：买家/卖家均可，释放商品
app.post('/api/orders/:id/cancel', authRequired, (req, res) => {
  const order = findOrderForUser(req, res);
  if (!order) return;
  if (!['locked', 'trading'].includes(order.status)) return fail(res, 400, '当前订单状态不能取消');
  const book = db.findById('books', order.bookId);
  order.status = 'cancelled';
  order.cancelledAt = now();
  order.cancelReason = String((req.body || {}).reason || (order.buyerId === req.user.id ? '买家取消' : '卖家取消')).slice(0, 100);
  releaseBook(book, order);
  db.persist();
  ok(res, { message: '订单已取消，商品已恢复可购买', data: orderSummary(order) });
});

app.get('/api/orders/mine', authRequired, (req, res) => {
  const role = req.query.role === 'seller' ? 'seller' : 'buyer';
  let orders = db.get('orders').filter(order => role === 'seller' ? order.sellerId === req.user.id : order.buyerId === req.user.id);
  const status = String(req.query.status || 'all');
  if (status !== 'all') orders = orders.filter(order => order.status === status);
  const page = paginate(orders.map(orderSummary), req.query.page, req.query.pageSize || 20);
  ok(res, { data: page.data, pagination: page.pagination });
});

app.get('/api/orders/counts', authRequired, (req, res) => {
  const mine = db.get('orders').filter(order => order.buyerId === req.user.id);
  const count = status => mine.filter(order => order.status === status).length;
  ok(res, { data: { locked: count('locked'), trading: count('trading'), completed: count('completed') } });
});

// 超时清扫：locked 超时的订单自动关闭并释放商品
function sweepTimeoutOrders() {
  const deadline = Date.now() - config.lockTimeoutHours * 3600 * 1000;
  let changed = false;
  for (const order of db.get('orders')) {
    if (order.status === 'locked' && Date.parse(order.lockedAt) < deadline) {
      order.status = 'timeout';
      order.cancelledAt = now();
      order.cancelReason = '订单超时自动关闭';
      releaseBook(db.findById('books', order.bookId), order);
      changed = true;
    }
  }
  if (changed) db.persist();
}
setInterval(sweepTimeoutOrders, Number(process.env.SWEEP_INTERVAL_MS) || 60 * 1000);

// 数据生命周期：进程启动跑一次，之后每 6 小时一次（CLEANUP_INTERVAL_MS 可覆盖）
function runAutoCleanup() {
  try {
    const result = cleanupData({ purgeOrphans: true });
    if (result.totalRemoved || result.orphanRemoved) {
      console.log(`[cleanup] 清理过期记录 ${result.totalRemoved} 条、孤儿图片 ${result.orphanRemoved} 张`);
    }
  } catch (e) {
    console.error('[cleanup] 自动清理失败：', e.message);
  }
}
// 逃生阀：万一清理逻辑有误，可用 SKIP_AUTO_CLEANUP=1 先停掉启动清理再排查
if (process.env.SKIP_AUTO_CLEANUP !== '1') runAutoCleanup();
setInterval(runAutoCleanup, Number(process.env.CLEANUP_INTERVAL_MS) || 6 * 60 * 60 * 1000).unref();
sweepTimeoutOrders();

/* ================= 求购 ================= */

app.get('/api/requests', (req, res) => {
  const ownOnly = req.query.mine === '1';
  const courseCode = String(req.query.courseCode || '').trim();
  const major = String(req.query.major || '').trim();
  const grade = String(req.query.grade || '').trim();
  let list = db.get('requests');
  if (ownOnly) {
    if (!req.user) return fail(res, 401, '请先登录');
    list = list.filter(item => item.postUserId === req.user.id);
  }
  if (courseCode) list = list.filter(item => item.courseCode === courseCode);
  if (major) list = list.filter(item => String(item.major || '') === major);
  if (grade) list = list.filter(item => String(item.grade || '') === grade);
  list = list.map(item => {
    const poster = db.findById('users', item.postUserId);
    return {
      ...item,
      seekingPrice: item.expectedPrice,
      posterName: poster ? poster.nickName : '校园书友',
      posterContact: contactBlock(poster, req.user)
    };
  });
  const page = paginate(list, req.query.page, req.query.pageSize);
  ok(res, { data: page.data, total: page.pagination.totalItems, page: page.pagination.currentPage, pageSize: page.pagination.pageSize, hasMore: page.pagination.hasMore });
});

app.get('/api/requests/:id', authRequired, (req, res) => {
  const item = db.get('requests').find(r => String(r.id) === String(req.params.id) && r.postUserId === req.user.id);
  if (!item) return fail(res, 404, '求购信息不存在或无权查看');
  ok(res, { data: item });
});

app.post('/api/requests', approvedRequired, (req, res) => {
  const data = (req.body || {}).requestData || req.body || {};
  const requestId = (req.body || {}).requestId;
  const title = String(data.title || '').trim();
  const price = Number(data.expectedPrice || 0);
  if (!title) return fail(res, 400, '请填写求购书名');
  if (!(price > 0)) return fail(res, 400, '请填写期望价格');
  const existing = requestId ? db.get('requests').find(r => String(r.id) === String(requestId) && r.postUserId === req.user.id) : null;
  const fields = {
    title: title.slice(0, 60),
    author: String(data.author || '').trim().slice(0, 40),
    courseCode: String(data.courseCode || '').trim().slice(0, 20),
    major: String(data.major || '').trim().slice(0, 30),
    grade: String(data.grade || '').trim().slice(0, 10),
    expectedPrice: price,
    description: String(data.description || '').trim().slice(0, 500),
    coverUrl: String(data.coverImageUrl || '').trim() || '/images/demo-request-cover.png'
  };
  if (existing) {
    Object.assign(existing, fields);
    db.persist();
    return ok(res, { message: '修改成功', data: { requestId: existing.id } });
  }
  const item = { id: db.nextId('request'), postUserId: req.user.id, ...fields, createdAt: now() };
  db.insert('requests', item);
  ok(res, { message: '发布成功', data: { requestId: item.id } });
});

app.delete('/api/requests/:id', authRequired, (req, res) => {
  const item = db.get('requests').find(r => String(r.id) === String(req.params.id) && r.postUserId === req.user.id);
  if (!item) return fail(res, 404, '求购信息不存在或无权操作');
  db.remove('requests', item.id);
  ok(res, { message: '删除成功' });
});

/* ================= 管理后台 ================= */

app.get('/api/admin/verifications', adminRequired, (req, res) => {
  const status = String(req.query.status || 'pending');
  let list = db.get('verifications');
  if (status !== 'all') list = list.filter(item => item.status === status);
  ok(res, {
    data: list.map(item => {
      const user = db.findById('users', item.userId);
      return {
        ...item,
        nickName: user ? user.nickName : '未知用户',
        avatarUrl: user ? user.avatarUrl : '',
        userCreatedAt: user ? user.createdAt : null
      };
    })
  });
});

app.post('/api/admin/verifications/:id/review', adminRequired, (req, res) => {
  const record = db.findById('verifications', req.params.id);
  if (!record) return fail(res, 404, '审核记录不存在');
  if (record.status !== 'pending') return fail(res, 400, '该记录已审核');
  const { approve, reason } = req.body || {};
  const user = db.findById('users', record.userId);
  if (!approve && !String(reason || '').trim()) return fail(res, 400, '拒绝时必须填写拒绝原因');
  record.status = approve ? 'approved' : 'rejected';
  record.reviewerId = req.admin.id;
  record.reviewReason = approve ? '' : String(reason).trim().slice(0, 100);
  record.reviewedAt = now();
  if (user) {
    user.verifyStatus = record.status;
    user.rejectReason = record.reviewReason;
    user.updatedAt = now();
  }
  db.persist();
  adminLog(approve ? 'verification.approve' : 'verification.reject', 'verification', record.id, record.reviewReason || '通过', req.admin.id);
  ok(res, { message: approve ? '已通过' : '已拒绝' });
});

// 平台数据概览：一次请求给出后台首页全部关键指标，避免前端并发拉多个列表
app.get('/api/admin/stats', adminRequired, (_req, res) => {
  const users = db.get('users');
  const books = db.get('books');
  const orders = db.get('orders');
  const requests = db.get('requests');
  const statusOf = book => normalizeBookStatus(book.status);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const isToday = iso => Boolean(iso) && new Date(iso).getTime() >= dayStart.getTime();
  const attempts = db.get('loginAttempts');
  const attemptToday = attempts.filter(a => isToday(a.createdAt));
  const activeSessions = db.get('sessions').filter(s => !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now());
  // 已注销账号只留墓碑（用于维系历史订单），不该再计入「用户总数」，否则概览虚高
  const aliveUsers = users.filter(u => !u.deleted);
  ok(res, {
    data: {
      users: {
        total: aliveUsers.length,
        deleted: users.filter(u => u.deleted).length,
        verified: aliveUsers.filter(u => u.verifyStatus === 'approved').length,
        pending: aliveUsers.filter(u => u.verifyStatus === 'pending').length,
        todayNew: aliveUsers.filter(u => isToday(u.createdAt)).length,
        frozen: aliveUsers.filter(u => u.frozen).length,
        blacklisted: aliveUsers.filter(u => u.blacklisted).length,
        neverLoggedIn: aliveUsers.filter(u => !u.lastLoginAt).length,
        onlineNow: new Set(activeSessions.map(s => String(s.userId))).size
      },
      login: {
        successTotal: attempts.filter(a => a.success).length,
        failTotal: attempts.filter(a => !a.success).length,
        successToday: attemptToday.filter(a => a.success).length,
        failToday: attemptToday.filter(a => !a.success).length,
        lockedToday: attemptToday.filter(a => a.reason === 'account_locked').length,
        blockedToday: attemptToday.filter(a => ['ip_rate_limited', 'challenge_required'].includes(a.reason)).length,
        activeSessions: activeSessions.length
      },
      books: {
        total: books.length,
        available: books.filter(b => statusOf(b) === 'available').length,
        trading: books.filter(b => ['locked', 'trading'].includes(statusOf(b))).length,
        sold: books.filter(b => statusOf(b) === 'sold').length,
        removed: books.filter(b => statusOf(b) === 'removed').length,
        todayNew: books.filter(b => isToday(b.createdAt)).length
      },
      orders: {
        total: orders.length,
        active: orders.filter(o => ['locked', 'trading'].includes(o.status)).length,
        completed: orders.filter(o => o.status === 'completed').length,
        cancelled: orders.filter(o => ['cancelled', 'timeout'].includes(o.status)).length
      },
      requests: { total: requests.length },
      verifications: { pending: db.get('verifications').filter(v => v.status === 'pending').length },
      banners: { total: db.get('banners').length, enabled: db.get('banners').filter(b => b.enabled).length },
      // 邮件服务状态：让管理员在概览上一眼看到「邮件到底通不通」
      mail: (() => {
        const s = mailer.getStatus();
        return { ready: s.ready, enabled: s.enabled, configured: s.configured, mode: s.mode, lastError: s.meta.lastError };
      })(),
      // 存储占用：把「服务器到底存了多少」直接摆到概览上
      storage: (() => {
        let dataBytes = 0;
        try { dataBytes = fs.statSync(config.dataFile).size; } catch (e) { /* 尚未落盘 */ }
        const pub = dirStat(path.join(config.uploadDir, 'public'));
        const priv = dirStat(path.join(config.uploadDir, 'private'));
        return {
          dataBytes,
          uploadBytes: pub.bytes + priv.bytes,
          uploadFiles: pub.files + priv.files,
          orphanCount: orphanUploads().length,
          retentionDays: logRetentionDays()
        };
      })()
    }
  });
});

// 用户列表：支持关键词搜索 + 认证状态筛选；书/单计数一次遍历建映射，避免逐用户全表扫描(N+1)
app.get('/api/admin/users', adminRequired, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || 'all');
  const bookCountMap = new Map();
  for (const book of db.get('books')) {
    bookCountMap.set(book.sellerId, (bookCountMap.get(book.sellerId) || 0) + 1);
  }
  const orderCountMap = new Map();
  for (const order of db.get('orders')) {
    orderCountMap.set(order.buyerId, (orderCountMap.get(order.buyerId) || 0) + 1);
    if (order.sellerId !== order.buyerId) {
      orderCountMap.set(order.sellerId, (orderCountMap.get(order.sellerId) || 0) + 1);
    }
  }
  let list = db.get('users').slice();
  // status=deleted 查看已注销墓碑；其余状态只看正常账号，避免墓碑混进审核列表
  if (status === 'deleted') list = list.filter(user => Boolean(user.deleted));
  else {
    list = list.filter(user => !user.deleted);
    if (status !== 'all') list = list.filter(user => (user.verifyStatus || 'none') === status);
  }
  if (String(req.query.frozen || '') === '1') list = list.filter(user => Boolean(user.frozen));
  if (String(req.query.blacklisted || '') === '1') list = list.filter(user => Boolean(user.blacklisted));
  if (q) {
    list = list.filter(user => [user.id, user.nickName, user.email, user.openid]
      .some(value => String(value || '').toLowerCase().includes(q)));
  }
  // 按「最近登录时间」倒序：谁最近登上来了一目了然；从未登录的排在最后
  list.sort((a, b) => new Date(b.lastLoginAt || b.createdAt || 0) - new Date(a.lastLoginAt || a.createdAt || 0));
  ok(res, {
    data: list.map(user => ({
      ...publicUser(user),
      proofImage: user.proofImage || '',
      bookCount: bookCountMap.get(user.id) || 0,
      orderCount: orderCountMap.get(user.id) || 0,
      lastLoginAt: user.lastLoginAt || null,
      lastLoginIp: user.lastLoginIp || '',
      loginCount: Number(user.loginCount || 0),
      failedLogins: Number(user.failedLogins || 0),
      locked: security.isLocked(user),
      frozen: Boolean(user.frozen),
      frozenReason: user.frozenReason || '',
      restrictPublishUntil: user.restrictPublishUntil || null,
      restrictBuyUntil: user.restrictBuyUntil || null,
      blacklisted: Boolean(user.blacklisted),
      deleted: Boolean(user.deleted),
      deletedAt: user.deletedAt || null,
      deletedReason: user.deletedReason || ''
    })),
    total: db.get('users').length
  });
});

// 某个用户发布过的全部书籍（含已下架/已售出），供后台从用户列表下钻查看
app.get('/api/admin/users/:id/books', adminRequired, (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user) return fail(res, 404, '用户不存在');
  const sellerMap = buildSellerMap();
  const list = db.get('books')
    .filter(book => String(book.sellerId) === String(user.id))
    .map(book => bookSummary(book, { sellerMap }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  ok(res, { data: list, user: publicUser(user) });
});

// ---------- 后台：联系方式脱敏与查看审计 ----------
// 手机号保留前 3 后 4；微信号保留前 1 后 2；其余一律用 * 覆盖
function maskPhone(value) {
  const v = String(value || '');
  if (v.length <= 4) return v ? '*'.repeat(v.length) : '';
  if (v.length <= 7) return v.slice(0, 2) + '*'.repeat(v.length - 4) + v.slice(-2);
  return v.slice(0, 3) + '*'.repeat(Math.max(4, v.length - 7)) + v.slice(-4);
}
function maskWechat(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 2) return '*'.repeat(v.length);
  return v.slice(0, 1) + '*'.repeat(Math.max(3, v.length - 3)) + v.slice(-2);
}

// 用户完整画像：基础 / 认证 / 联系方式 / 交易 / 行为 / 风控 / 登录记录
// 联系方式默认脱敏，只有显式传 revealContacts=1 才明文返回，且每次明文查看都写审计日志
app.get('/api/admin/users/:userId', adminRequired, (req, res) => {
  const user = db.findById('users', req.params.userId);
  if (!user) return fail(res, 404, '用户不存在');
  const uid = String(user.id);
  const reveal = String(req.query.revealContacts || '') === '1';
  const sellerMap = buildSellerMap();

  const books = db.get('books').filter(b => String(b.sellerId) === uid);
  const asBuyer = db.get('orders').filter(o => String(o.buyerId) === uid);
  const asSeller = db.get('orders').filter(o => String(o.sellerId) === uid);
  const orders = [...asBuyer, ...asSeller].filter((o, i, arr) => arr.findIndex(x => x.id === o.id) === i);
  const requests = db.get('requests').filter(r => String(r.postUserId || r.userId) === uid);
  const verifications = db.get('verifications').filter(v => String(v.userId) === uid);
  const latestVerification = verifications.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  const loginAttempts = db.get('loginAttempts').filter(a => String(a.userId) === uid).slice(0, 20);
  const activeSessions = db.get('sessions').filter(s => String(s.userId) === uid && !s.revokedAt && new Date(s.expiresAt).getTime() > Date.now());

  const wechat = user.contactWechat || user.contact_wechat || '';
  const phone = user.contactPhone || user.contact_phone || '';
  if (reveal && (wechat || phone)) {
    adminLog('user.contacts.view', 'user', user.id, `明文查看联系方式（${wechat ? '微信' : ''}${phone ? ' 手机' : ''}）`, req.admin.id);
  }

  ok(res, {
    data: {
      basic: {
        user_id: user.id, nick_name: user.nickName, avatar_url: user.avatarUrl,
        email: user.email || '', emailVerified: Boolean(user.emailVerified),
        createdAt: user.createdAt, registerIp: user.registerIp || '',
        lastLoginAt: user.lastLoginAt || null, lastLoginIp: user.lastLoginIp || '',
        loginCount: Number(user.loginCount || 0), deviceCount: activeSessions.length,
        // 供详情页决定是否展示「删除用户」：已注销的不再重复提供；
        // hasTrade 决定删除时是匿名化（保订单）还是彻底物理删除
        deleted: Boolean(user.deleted),
        hasTrade: orders.length > 0
      },
      verify: {
        verifyStatus: user.verifyStatus || 'none',
        proofImage: user.proofImage || '',
        rejectReason: user.rejectReason || '',
        reviewerId: latestVerification ? latestVerification.reviewerId : null,
        reviewedAt: latestVerification ? latestVerification.reviewedAt : null,
        submittedAt: latestVerification ? latestVerification.createdAt : null
      },
      contact: {
        wechat: reveal ? wechat : maskWechat(wechat),
        phone: reveal ? phone : maskPhone(phone),
        meetPoint: user.defaultMeetPoint || '',
        region: user.defaultRegion || '',
        visible: user.contactVisible || 'order_only',
        revealed: reveal
      },
      trade: {
        bookCount: books.length,
        onSaleCount: books.filter(b => normalizeBookStatus(b.status) === 'available').length,
        soldCount: books.filter(b => normalizeBookStatus(b.status) === 'sold').length,
        removedCount: books.filter(b => normalizeBookStatus(b.status) === 'removed').length,
        orderCount: orders.length,
        buyOrderCount: asBuyer.length,
        sellOrderCount: asSeller.length,
        cancelledCount: orders.filter(o => ['cancelled', 'timeout'].includes(o.status)).length,
        completedCount: orders.filter(o => o.status === 'completed').length,
        totalAmount: Number(orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + Number(o.price || 0), 0).toFixed(2)),
        requestCount: requests.length
      },
      risk: {
        creditScore: Number(user.creditScore === undefined ? 100 : user.creditScore),
        violationCount: Number(user.violationCount || 0),
        failedLogins: Number(user.failedLogins || 0),
        lockedUntil: user.lockedUntil || null,
        locked: security.isLocked(user),
        lastFailedLoginAt: user.lastFailedLoginAt || null,
        frozen: Boolean(user.frozen),
        frozenReason: user.frozenReason || '',
        frozenAt: user.frozenAt || null,
        restrictPublishUntil: user.restrictPublishUntil || null,
        restrictBuyUntil: user.restrictBuyUntil || null,
        blacklisted: Boolean(user.blacklisted),
        blacklistReason: user.blacklistReason || '',
        dispositionCount: db.get('adminLogs').filter(l => l.targetType === 'user' && String(l.targetId) === uid).length
      },
      orders: orders.slice(0, 50).map(orderSummary),
      books: books.slice(0, 50).map(book => bookSummary(book, { sellerMap })),
      requests: requests.slice(0, 50),
      loginAttempts
    }
  });
});

// 账号处置：冻结/解冻、限制发布、限制购买。原因必填，写处置日志并通知用户
app.post('/api/admin/users/:userId/status', adminRequired, (req, res) => {
  const user = db.findById('users', req.params.userId);
  if (!user) return fail(res, 404, '用户不存在');
  const body = req.body || {};
  const action = String(body.action || '');
  const reason = String(body.reason || '').trim();
  if (!reason) return fail(res, 400, '请填写处置原因');

  let message = '';
  if (action === 'freeze') {
    user.frozen = true;
    user.frozenReason = reason.slice(0, 100);
    user.frozenAt = now();
    // 冻结即时生效：吊销该用户全部会话
    const revoked = auth.revokeAllSessions(user.id);
    message = `已冻结账号并下线 ${revoked} 个会话`;
    adminLog('user.freeze', 'user', user.id, reason, req.admin.id);
  } else if (action === 'unfreeze') {
    user.frozen = false;
    user.frozenReason = '';
    user.frozenAt = null;
    user.lockedUntil = null;
    user.failedLogins = 0;
    message = '已解冻账号';
    adminLog('user.unfreeze', 'user', user.id, reason, req.admin.id);
  } else if (action === 'restrict_publish') {
    const days = Number(body.days) || 0;
    if (days <= 0) return fail(res, 400, '请提供限制天数');
    user.restrictPublishUntil = new Date(Date.now() + days * 86400 * 1000).toISOString();
    message = `已限制发布 ${days} 天`;
    adminLog('user.restrict.publish', 'user', user.id, `${days} 天 · ${reason}`, req.admin.id);
  } else if (action === 'restrict_buy') {
    const days = Number(body.days) || 0;
    if (days <= 0) return fail(res, 400, '请提供限制天数');
    user.restrictBuyUntil = new Date(Date.now() + days * 86400 * 1000).toISOString();
    message = `已限制购买 ${days} 天`;
    adminLog('user.restrict.buy', 'user', user.id, `${days} 天 · ${reason}`, req.admin.id);
  } else if (action === 'clear_restriction') {
    user.restrictPublishUntil = null;
    user.restrictBuyUntil = null;
    message = '已解除全部限制';
    adminLog('user.restrict.clear', 'user', user.id, reason, req.admin.id);
  } else {
    return fail(res, 400, '不支持的处置动作');
  }

  user.updatedAt = now();
  db.persist();
  // 通知被处置用户（应用内通知，登录后可见）
  db.insert('notifications', {
    id: db.nextId('notification'),
    userId: user.id,
    type: 'disposition',
    title: '账号处置通知',
    content: message + (reason ? `（原因：${reason}）` : ''),
    read: false,
    createdAt: now()
  }).id;
  ok(res, { message });
});

// 加入 / 移出黑名单：禁止同邮箱、同认证信息再次注册
app.post('/api/admin/users/:userId/blacklist', adminRequired, (req, res) => {
  const user = db.findById('users', req.params.userId);
  if (!user) return fail(res, 404, '用户不存在');
  const body = req.body || {};
  const reason = String(body.reason || '').trim();
  if (!reason) return fail(res, 400, '请填写拉黑原因');
  const remove = body.remove === true || body.action === 'remove';

  if (remove) {
    user.blacklisted = false;
    user.blacklistReason = '';
    adminLog('user.blacklist.remove', 'user', user.id, reason, req.admin.id);
    db.persist();
    return ok(res, { message: '已移出黑名单' });
  }

  // 拉黑同时冻结，避免黑名单账号继续登录
  user.blacklisted = true;
  user.blacklistReason = reason.slice(0, 100);
  user.blacklistedAt = now();
  user.frozen = true;
  user.frozenReason = `已列入黑名单：${reason.slice(0, 80)}`;
  user.frozenAt = now();
  const revoked = auth.revokeAllSessions(user.id);
  db.persist();
  adminLog('user.blacklist.add', 'user', user.id, reason, req.admin.id);
  ok(res, {
    message: `已列入黑名单并冻结（下线 ${revoked} 个会话）`,
    blacklist: { email: user.email || '', openid: user.openid || '', nickName: user.nickName }
  });
});

// 一键下架某用户全部在架商品
app.post('/api/admin/books/batch-offline', adminRequired, (req, res) => {
  const body = req.body || {};
  const sellerId = body.userId !== undefined ? String(body.userId) : '';
  const reason = String(body.reason || '').trim();
  if (!sellerId) return fail(res, 400, '请指定用户');
  if (!reason) return fail(res, 400, '请填写下架原因');
  const user = db.findById('users', sellerId);
  if (!user) return fail(res, 404, '用户不存在');

  const targets = db.get('books').filter(book =>
    String(book.sellerId) === sellerId && normalizeBookStatus(book.status) === 'available');
  targets.forEach(book => {
    book.status = 'removed';
    book.updatedAt = now();
  });
  db.persist();
  adminLog('book.batch_offline', 'user', sellerId, `下架 ${targets.length} 本 · ${reason}`, req.admin.id);
  ok(res, { message: `已下架该用户 ${targets.length} 本在架商品`, count: targets.length });
});

/* ================= 存储治理（容量统计 / 生命周期清理） =================
 * db.json 里唯一会无限膨胀的是「只写不删」的表：登录审计、安全日志、后台日志、
 * 会话与令牌。它们跟账号数量无关，跟「跑了多久 + 被攻击多少次」有关，
 * 所以必须按保留期清理，而不是靠删账号。
 */
function dirStat(dir) {
  let bytes = 0; let files = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const stat = fs.statSync(path.join(dir, name));
      if (stat.isFile()) { bytes += stat.size; files++; }
    }
  } catch (e) { /* 目录不存在 */ }
  return { bytes, files };
}

// 当前仍被业务引用的公开图片文件名
function referencedUploads() {
  const used = new Set();
  const take = value => {
    const text = String(value || '');
    if (text.indexOf('/uploads/public/') === 0) used.add(path.basename(text));
  };
  for (const book of db.get('books')) (book.imageUrls || []).forEach(take);
  for (const item of db.get('requests')) take(item.coverUrl);
  for (const banner of db.get('banners')) take(banner.imageUrl);
  for (const user of db.get('users')) take(user.avatarUrl);
  return used;
}

// 磁盘上有、但已无任何数据引用的图片（删书/删帖后的残留文件）
function orphanUploads() {
  const used = referencedUploads();
  try {
    return fs.readdirSync(path.join(config.uploadDir, 'public')).filter(name => !used.has(name));
  } catch (e) { return []; }
}

// 日志类数据的保留天数（后台可改，默认 90 天）
function logRetentionDays() {
  return Number(db.getSetting('logRetentionDays', Number(process.env.LOG_RETENTION_DAYS) || 90)) || 90;
}

function olderThanDays(iso, days) {
  const time = new Date(iso || 0).getTime();
  return Number.isFinite(time) && time > 0 && (Date.now() - time) > days * 86400 * 1000;
}

function isExpired(iso) {
  const time = new Date(iso || 0).getTime();
  return Number.isFinite(time) && time > 0 && time < Date.now();
}

// 生命周期清理（dryRun 只看不删，用于后台预演）
function cleanupData({ dryRun = false, purgeOrphans = false } = {}) {
  const days = logRetentionDays();
  const removed = {};
  const sweep = (name, predicate) => {
    const list = db.get(name);
    let count = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (predicate(list[i])) { count++; if (!dryRun) list.splice(i, 1); }
    }
    if (count) removed[name] = count;
  };
  sweep('loginAttempts', item => olderThanDays(item.createdAt, days));
  sweep('securityLogs', item => olderThanDays(item.createdAt, days));
  sweep('adminLogs', item => olderThanDays(item.createdAt, days));
  sweep('notifications', item => Boolean(item.read) && olderThanDays(item.createdAt, days));
  // 会话：撤销/过期后再多留一个保留期，既省空间又保住「令牌重放检测」窗口
  sweep('sessions', item => {
    const anchor = item.revokedAt || item.expiresAt;
    return (Boolean(item.revokedAt) || isExpired(item.expiresAt)) && olderThanDays(anchor || item.createdAt, days);
  });
  sweep('emailTokens', item =>
    (Boolean(item.usedAt) || isExpired(item.expiresAt)) && olderThanDays(item.usedAt || item.expiresAt || item.createdAt, days));
  sweep('resetTokens', item =>
    (Boolean(item.usedAt) || isExpired(item.expiresAt)) && olderThanDays(item.usedAt || item.expiresAt || item.createdAt, days));

  const orphans = orphanUploads();
  let orphanRemoved = 0;
  if (purgeOrphans && !dryRun) {
    const dir = path.join(config.uploadDir, 'public');
    for (const name of orphans) {
      try { fs.unlinkSync(path.join(dir, name)); orphanRemoved++; } catch (e) { /* ignore */ }
    }
  }
  if (!dryRun) {
    // 已删除用户的令牌拦截名单：旧令牌最长 refresh 30 天失效，留 31 天足够
    const all = db.getSetting('purgedUsers', []) || [];
    const kept = all.filter(item => !olderThanDays(item.at, 31));
    if (kept.length !== all.length) {
      removed.purgedUsers = all.length - kept.length;
      db.setSetting('purgedUsers', kept);
    }
    db.persist();
  }
  let totalRemoved = 0;
  for (const key of Object.keys(removed)) totalRemoved += removed[key];
  return { removed, totalRemoved, orphans: orphans.length, orphanRemoved, retentionDays: days, dryRun };
}

// 存储占用：直接回答「服务器上到底存了多少、大头在哪」
app.get('/api/admin/storage', adminRequired, (_req, res) => {
  let dataBytes = 0;
  try { dataBytes = fs.statSync(config.dataFile).size; } catch (e) { /* 尚未落盘 */ }
  const collections = db.collections.map(name => {
    const list = db.get(name);
    return { name, count: list.length, bytes: Buffer.byteLength(JSON.stringify(list)) };
  }).sort((a, b) => b.bytes - a.bytes);
  const pub = dirStat(path.join(config.uploadDir, 'public'));
  const priv = dirStat(path.join(config.uploadDir, 'private'));
  const orphans = orphanUploads();
  let orphanBytes = 0;
  for (const name of orphans) {
    try { orphanBytes += fs.statSync(path.join(config.uploadDir, 'public', name)).size; } catch (e) { /* ignore */ }
  }
  ok(res, {
    data: {
      // 真实路径（线上在部署包外），别再写死 'server/data/db.json' —— 会误导排障
      dataFile: config.dataFile,
      outsidePackage: Boolean(config.outsidePackage),
      backupDir: db.backupDir,
      dataBytes,
      collections,
      uploads: { public: pub, private: priv, bytes: pub.bytes + priv.bytes, files: pub.files + priv.files },
      orphans: { count: orphans.length, bytes: orphanBytes, sample: orphans.slice(0, 10) },
      retentionDays: logRetentionDays()
    }
  });
});

// 全量数据备份（一键导出整个库）
// 为什么需要：线上库就是一个 JSON 文件，此前没有任何备份手段——既没法留底，也没法回滚。
// 返回的 db 字段是完整快照（含 seq/settings/meta），可直接写回 server/data/db.json 完成还原。
app.get('/api/admin/backup', adminRequired, (req, res) => {
  const payload = db.dump();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const counts = {};
  for (const name of db.collections) counts[name] = Array.isArray(payload[name]) ? payload[name].length : 0;
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  adminLog('data.backup', 'system', 'backup', `导出全量数据备份（${bytes} 字节）`, req.admin.id);
  ok(res, {
    data: {
      fileName: `hzau-bookcycle-backup-${stamp}.json`,
      generatedAt: new Date().toISOString(),
      bytes,
      counts,
      // 还原说明一并返回，避免日后拿到文件不知道怎么用
      restoreHint: '把 db 字段的内容覆盖到线上 server/data/db.json 后重启服务即可还原',
      db: payload
    }
  });
});

// 手动触发清理（dryRun=1 只看不删；purgeOrphans=1 才真的删磁盘孤儿图片）
app.post('/api/admin/cleanup', adminRequired, (req, res) => {
  const body = req.body || {};
  const dryRun = body.dryRun === true || String(body.dryRun || '') === '1';
  const purgeOrphans = body.purgeOrphans === true || String(body.purgeOrphans || '') === '1';
  const result = cleanupData({ dryRun, purgeOrphans });
  if (!dryRun) {
    adminLog('storage.cleanup', 'system', 'cleanup',
      `清理 ${result.totalRemoved} 条记录、${result.orphanRemoved} 张孤儿图片`, req.admin.id);
  }
  ok(res, {
    data: result,
    message: dryRun ? '预演完成，未删除任何数据' : `清理完成：${result.totalRemoved} 条记录、${result.orphanRemoved} 张孤儿图片`
  });
});

// 管理员删除用户：无交易记录 → 物理删除；有交易记录 → 墓碑化（保住对方的订单视图）
app.delete('/api/admin/users/:userId', adminRequired, (req, res) => {
  const user = db.findById('users', req.params.userId);
  if (!user) return fail(res, 404, '用户不存在');
  const blocking = activeOrderOf(user.id);
  if (blocking) {
    return fail(res, 409, `该用户有进行中的订单（单号 ${blocking.orderNumber || blocking.id}），请先处理订单`);
  }
  const reason = String((req.body || {}).reason || '').trim();
  const hasTrade = db.get('orders').some(order =>
    String(order.buyerId) === String(user.id) || String(order.sellerId) === String(user.id));
  const removed = purgeUserOwnedData(user.id);

  if (hasTrade) {
    anonymizeUser(user, reason || '管理员删除');
    db.persist();
    adminLog('user.delete.anonymize', 'user', user.id, `存在历史订单，账号已匿名化保留（${reason || '未填原因'}）`, req.admin.id);
    return ok(res, {
      message: '用户已删除。因其存在历史交易，账号已匿名化保留，以免买家查不到订单',
      data: { mode: 'anonymized', removed }
    });
  }
  markUserPurged(user.id);
  db.remove('users', user.id);
  adminLog('user.delete', 'user', user.id, `彻底删除用户及其 ${removed.books || 0} 本书（${reason || '未填原因'}）`, req.admin.id);
  ok(res, {
    message: `用户已彻底删除，同时清除其 ${removed.books || 0} 本书及相关数据`,
    data: { mode: 'purged', removed }
  });
});

// 登录记录：后台回答「谁登录上去了、谁没登上来」的数据源
app.get('/api/admin/login-records', adminRequired, (req, res) => {
  const result = String(req.query.result || 'all');
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const users = db.get('users');
  const nickMap = new Map(users.map(u => [String(u.id), u.nickName]));
  let list = db.get('loginAttempts').slice();
  if (result === 'success') list = list.filter(a => a.success);
  if (result === 'fail') list = list.filter(a => !a.success);
  if (q) {
    list = list.filter(a =>
      String(a.account || '').toLowerCase().includes(q) ||
      String(a.ip || '').includes(q) ||
      String(nickMap.get(String(a.userId)) || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const all = db.get('loginAttempts');
  ok(res, {
    data: list.slice(0, limit).map(a => ({
      ...a,
      nickName: nickMap.get(String(a.userId)) || '',
      reasonText: LOGIN_REASON_TEXT[a.reason] || a.reason
    })),
    total: all.length,
    summary: {
      success: all.filter(a => a.success).length,
      fail: all.filter(a => !a.success).length,
      userNotFound: all.filter(a => a.reason === 'user_not_found').length,
      wrongPassword: all.filter(a => a.reason === 'wrong_password').length,
      locked: all.filter(a => a.reason === 'account_locked').length,
      rateLimited: all.filter(a => a.reason === 'ip_rate_limited').length,
      challenge: all.filter(a => a.reason === 'challenge_required').length,
      frozen: all.filter(a => a.reason === 'account_frozen').length
    }
  });
});

// 登录记录：删除单条（误报、测试噪声等）
app.delete('/api/admin/login-records/:id', adminRequired, (req, res) => {
  if (!db.remove('loginAttempts', req.params.id)) return fail(res, 404, '记录不存在');
  adminLog('loginRecord.delete', 'loginAttempt', req.params.id, '删除单条登录记录', req.admin.id);
  ok(res, { message: '该条登录记录已删除' });
});

// 登录记录：批量清空。支持「按当前筛选清空」和「只保留最近 N 天」两种语义，
// 也可组合（例如：清掉 30 天前的全部失败记录）。
app.post('/api/admin/login-records/clear', adminRequired, (req, res) => {
  const body = req.body || {};
  const result = String(body.result || 'all');
  const q = String(body.q || '').trim().toLowerCase();
  const keepDays = Number(body.keepDays) || 0;
  const nickMap = new Map(db.get('users').map(u => [String(u.id), u.nickName]));
  const list = db.get('loginAttempts');
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (keepDays > 0 && !olderThanDays(a.createdAt, keepDays)) continue;
    if (result === 'success' && !a.success) continue;
    if (result === 'fail' && a.success) continue;
    if (q) {
      const hit = String(a.account || '').toLowerCase().includes(q) ||
        String(a.ip || '').includes(q) ||
        String(nickMap.get(String(a.userId)) || '').toLowerCase().includes(q);
      if (!hit) continue;
    }
    list.splice(i, 1);
    removed++;
  }
  db.persist();
  const scope = [result === 'all' ? '全部' : result === 'success' ? '成功' : '失败',
    keepDays > 0 ? `仅 ${keepDays} 天前` : '', q ? `匹配「${q}」` : ''].filter(Boolean).join(' · ');
  adminLog('loginRecord.clear', 'loginAttempt', result, `清空登录记录 ${removed} 条（${scope}）`, req.admin.id);
  ok(res, { message: `已清空 ${removed} 条登录记录`, count: removed });
});

/* ================= 邮件设置（管理员） =================
 * 托管沙箱无法注入环境变量，因此 SMTP 配置以「后台库配置 > 环境变量」的顺序生效，
 * 管理员在后台改完即刻生效，不需要重新部署。
 */
app.get('/api/admin/mail-settings', adminRequired, (req, res) => {
  ok(res, { data: mailer.getStatus() });
});

// 导出完整配置（含授权码）：把返回内容写进部署包 server/mail-config.json，
// 重新部署后任何实例/任何重启都自带这份配置（解决"重部署后配置丢失"）。
app.get('/api/admin/mail-settings/export', adminRequired, (req, res) => {
  adminLog('mail.export', 'system', 'mail', '导出邮件配置（含授权码）用于固化进部署包', req.admin.id);
  ok(res, { data: mailer.exportConfig() });
});

app.post('/api/admin/mail-settings', adminRequired, (req, res) => {
  const result = mailer.saveSettings(req.body || {});
  if (!result.ok) return fail(res, 400, result.message);
  adminLog('mail.settings', 'system', 'mail',
    `更新邮件配置：enabled=${result.status.enabled} host=${result.status.host || '(空)'} port=${result.status.port}`,
    req.admin.id);
  ok(res, { data: result.status, message: '邮件配置已保存并立即生效' });
});

app.post('/api/admin/mail-settings/test', adminRequired, async (req, res) => {
  const to = security.normalizeEmail((req.body || {}).to);
  if (!security.validateEmail(to)) return fail(res, 400, '请填写有效的收件邮箱');
  const limit = security.rateLimit('mailtest:' + req.admin.id, 5, 60 * 1000);
  if (!limit.ok) return fail(res, 429, `测试过于频繁，请 ${limit.retryAfter} 秒后再试`);
  const result = await mailer.sendTestMail(to);
  adminLog('mail.test', 'system', 'mail', `测试发信至 ${to}：${result.ok ? '成功' : '失败 ' + result.message}`, req.admin.id);
  if (!result.ok) return fail(res, 400, result.message);
  ok(res, { message: result.message, messageId: result.messageId || '' });
});

// 邮件服务不可用时（未配 SMTP / 发送失败）的兜底：管理员代取链接，人工通过微信发给本人
// 安全说明：这些链接含一次性令牌，只有管理员可见；配置好 SMTP 后应清空。
app.get('/api/admin/mail-outbox', adminRequired, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const all = mailer.getDevOutbox();
  ok(res, {
    data: all.slice(0, limit).map(item => {
      // 邮件正文里的 6 位数字就是验证码 —— 单独抽出来，管理员代发时直接复制这一列即可
      const m = String(item.text || '').match(/^\s{2,}(\d{6})\s*$/m) || String(item.text || '').match(/验证码：(\d{6})/);
      return {
        at: item.at, to: item.to, subject: item.subject,
        text: item.text, link: item.link, code: m ? m[1] : ''
      };
    }),
    total: all.length
  });
});

app.post('/api/admin/mail-outbox/clear', adminRequired, (req, res) => {
  mailer.clearDevOutbox();
  adminLog('mail.outbox_clear', 'system', 'mail', '清空待人工代发的邮件队列', req.admin.id);
  ok(res, { message: '已清空待发邮件队列' });
});

const LOGIN_REASON_TEXT = {
  success: '登录成功',
  user_not_found: '账号不存在',
  wrong_password: '密码错误',
  no_password: '账号未设置密码',
  account_locked: '账号已锁定',
  account_frozen: '账号已冻结',
  ip_rate_limited: '触发频率限制',
  challenge_required: '需要人机校验'
};

// 站内通知：账号被处置后会写入 notifications，用户登录后在这里读取（前端提示条待接入）
app.get('/api/notifications/mine', authRequired, (req, res) => {
  const list = db.get('notifications')
    .filter(n => String(n.userId) === String(req.user.id))
    .slice(0, 50);
  ok(res, { data: list, unread: list.filter(n => !n.read).length });
});

app.post('/api/notifications/read', authRequired, (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? (req.body || {}).ids.map(String) : null;
  let changed = 0;
  db.get('notifications')
    .filter(n => String(n.userId) === String(req.user.id) && (!ids || ids.includes(String(n.id))))
    .forEach(n => { if (!n.read) { n.read = true; changed++; } });
  if (changed) db.persist();
  ok(res, { message: `已标记 ${changed} 条为已读` });
});

// 商品列表：支持状态筛选 + 关键词搜索 + 按卖家过滤
app.get('/api/admin/books', adminRequired, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const status = String(req.query.status || 'all');
  const sellerId = req.query.sellerId ? String(req.query.sellerId) : '';
  const sellerMap = buildSellerMap();
  let list = db.get('books').slice();
  if (sellerId) list = list.filter(book => String(book.sellerId) === sellerId);
  if (status !== 'all') {
    list = status === 'trading'
      ? list.filter(book => ['locked', 'trading'].includes(normalizeBookStatus(book.status)))
      : list.filter(book => normalizeBookStatus(book.status) === status);
  }
  if (q) {
    list = list.filter(book => [book.title, book.author, book.isbn, book.sellerId]
      .some(value => String(value || '').toLowerCase().includes(q)));
  }
  list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  ok(res, { data: list.map(book => bookSummary(book, { sellerMap })), total: db.get('books').length });
});

app.post('/api/admin/books/:id/status', adminRequired, (req, res) => {
  const book = db.findById('books', req.params.id);
  if (!book) return fail(res, 404, '商品不存在');
  const status = String((req.body || {}).status || '');
  if (!['available', 'removed'].includes(status)) return fail(res, 400, '仅支持上架(available)/下架(removed)');
  if (['locked', 'trading'].includes(normalizeBookStatus(book.status)) && status === 'removed') {
    return fail(res, 400, '商品正在交易中，请先处理订单');
  }
  book.status = status;
  book.updatedAt = now();
  db.persist();
  adminLog('book.status', 'book', book.id, `→ ${status}`, req.admin.id);
  ok(res, { message: status === 'removed' ? '已下架' : '已恢复上架' });
});

// 删除违规/不需要的商品（硬删除）。交易中或已售出的商品禁止删除，请先处理订单或改为下架
app.delete('/api/admin/books/:id', adminRequired, (req, res) => {
  const book = db.findById('books', req.params.id);
  if (!book) return fail(res, 404, '商品不存在');
  const status = normalizeBookStatus(book.status);
  if (['locked', 'trading'].includes(status)) return fail(res, 400, '商品正在交易中，请先关闭订单再删除');
  if (status === 'sold') return fail(res, 400, '已售出的商品不可删除，建议改为下架');
  // 清理购物车等对该书的引用，避免残留脏数据
  db.get('cartItems')
    .filter(item => String(item.bookId) === String(book.id))
    .forEach(item => db.remove('cartItems', item.id));
  db.remove('books', book.id);
  adminLog('book.delete', 'book', book.id, `删除《${book.title || '未命名'}》`, req.admin.id);
  ok(res, { message: '已删除' });
});

app.get('/api/admin/orders', adminRequired, (_req, res) => {
  ok(res, { data: db.get('orders').map(orderSummary) });
});

app.post('/api/admin/orders/:id/cancel', adminRequired, (req, res) => {
  const order = db.findById('orders', req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  if (!['locked', 'trading'].includes(order.status)) return fail(res, 400, '当前订单状态不能取消');
  order.status = 'cancelled';
  order.cancelledAt = now();
  order.cancelReason = '管理员关闭异常订单';
  releaseBook(db.findById('books', order.bookId), order);
  db.persist();
  adminLog('order.cancel', 'order', order.id, '管理员关闭异常订单', req.admin.id);
  ok(res, { message: '订单已关闭，商品已释放' });
});

// 后台：删除订单。仅终态可删；进行中的订单必须先关闭，
// 否则会给买卖双方留下「交易凭空消失」的错觉。
app.delete('/api/admin/orders/:id', adminRequired, (req, res) => {
  const order = db.findById('orders', req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  if (['locked', 'trading'].includes(order.status)) {
    return fail(res, 400, '该订单正在进行中，请先关闭订单再删除');
  }
  db.remove('orders', order.id);
  adminLog('order.delete', 'order', order.id, `删除订单 ${order.orderNumber}（${order.status}）`, req.admin.id);
  ok(res, { message: '订单已删除' });
});

/* ================= 求购帖管理（管理员） =================
 * 用户发布的「买书」信息此前只能在用户端删除，后台管不到 —— 补齐后台的可见与可删。
 */
app.get('/api/admin/requests', adminRequired, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const nickMap = new Map(db.get('users').map(u => [String(u.id), u.nickName]));
  let list = db.get('requests').slice();
  if (q) {
    list = list.filter(item => [item.title, item.author, item.courseCode, item.major, item.grade,
      nickMap.get(String(item.postUserId))]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }
  list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const page = paginate(list, req.query.page, req.query.pageSize || 50);
  ok(res, {
    data: page.data.map(item => ({
      ...item,
      posterName: nickMap.get(String(item.postUserId)) || '已注销用户'
    })),
    total: page.pagination.totalItems
  });
});

app.delete('/api/admin/requests/:id', adminRequired, (req, res) => {
  const item = db.findById('requests', req.params.id);
  if (!item) return fail(res, 404, '求购帖不存在');
  const brief = String(item.title || '').slice(0, 30);
  db.remove('requests', item.id);
  adminLog('request.delete', 'request', item.id, `删除求购帖「${brief}」`, req.admin.id);
  ok(res, { message: `已删除求购帖「${brief}」` });
});

// 运营位 CRUD
app.get('/api/admin/banners', adminRequired, (_req, res) => {
  ok(res, { data: db.get('banners').slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)) });
});

app.post('/api/admin/banners', adminRequired, (req, res) => {
  const { title, subtitle, imageUrl, linkUrl, sort, enabled } = req.body || {};
  if (!String(title || '').trim()) return fail(res, 400, '请填写标题');
  const banner = {
    id: db.nextId('banner'),
    title: String(title).trim().slice(0, 40),
    subtitle: String(subtitle || '').trim().slice(0, 60),
    imageUrl: String(imageUrl || '').trim(),
    linkUrl: String(linkUrl || '').trim(),
    sort: Number(sort) || 0,
    enabled: enabled !== false,
    createdAt: now(), updatedAt: now()
  };
  db.insert('banners', banner);
  adminLog('banner.create', 'banner', banner.id, banner.title, req.admin.id);
  ok(res, { message: '已新增', data: banner });
});

app.put('/api/admin/banners/:id', adminRequired, (req, res) => {
  const banner = db.findById('banners', req.params.id);
  if (!banner) return fail(res, 404, '运营位不存在');
  const { title, subtitle, imageUrl, linkUrl, sort, enabled } = req.body || {};
  if (title !== undefined) banner.title = String(title).trim().slice(0, 40);
  if (subtitle !== undefined) banner.subtitle = String(subtitle).trim().slice(0, 60);
  if (imageUrl !== undefined) banner.imageUrl = String(imageUrl).trim();
  if (linkUrl !== undefined) banner.linkUrl = String(linkUrl).trim();
  if (sort !== undefined) banner.sort = Number(sort) || 0;
  if (enabled !== undefined) banner.enabled = Boolean(enabled);
  banner.updatedAt = now();
  db.persist();
  adminLog('banner.update', 'banner', banner.id, banner.title, req.admin.id);
  ok(res, { message: '已保存', data: banner });
});

app.delete('/api/admin/banners/:id', adminRequired, (req, res) => {
  if (!db.remove('banners', req.params.id)) return fail(res, 404, '运营位不存在');
  adminLog('banner.delete', 'banner', req.params.id, '', req.admin.id);
  ok(res, { message: '已删除' });
});

app.get('/api/admin/logs', adminRequired, (_req, res) => {
  ok(res, { data: db.get('adminLogs').slice(0, 100) });
});

// 操作日志清空：支持只保留最近 N 天。
// 注意顺序 —— 先清空再写本次清空的记录，否则连自己这条也被清掉，事后无从追溯。
app.post('/api/admin/logs/clear', adminRequired, (req, res) => {
  const keepDays = Number((req.body || {}).keepDays) || 0;
  const list = db.get('adminLogs');
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (keepDays > 0 && !olderThanDays(list[i].createdAt, keepDays)) continue;
    list.splice(i, 1);
    removed++;
  }
  db.persist();
  adminLog('log.clear', 'adminLog', 'all',
    keepDays > 0 ? `清空 ${keepDays} 天前的操作日志 ${removed} 条` : `清空全部操作日志 ${removed} 条`, req.admin.id);
  ok(res, { message: `已清空 ${removed} 条操作日志`, count: removed });
});

/* ================= 静态托管 ================= */

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  // vite 产物带内容 hash：/assets/* 内容不变即可长期强缓存；index.html 必须每次校验，避免发版后仍命中旧壳
  // index:false —— 首页不交给 static 直接下发，改由下方注入运行期配置后再发
  app.use(express.static(distDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  // 下发首页时注入运行期站点配置（管理员联系方式等）。
  // 这些值每个部署都不同，**不能写进前端源码** —— 否则公开仓库时会连联系方式一起泄露；
  // 走服务端注入，源码里只留读取逻辑（见 src/services/contact.js）。
  const indexPath = path.join(distDir, 'index.html');
  function sendAppHtml(_req, res) {
    res.setHeader('Cache-Control', 'no-cache');
    let html = '';
    try {
      html = fs.readFileSync(indexPath, 'utf8');
    } catch (_) {
      return res.status(500).type('html').send('应用入口缺失，请先执行构建');
    }
    const runtime = JSON.stringify({ adminWechat: config.adminWechat || '' }).replace(/</g, '\\u003c');
    const tag = `<script>window.__SITE__=${runtime};</script>`;
    res.type('html').send(html.includes('</head>') ? html.replace('</head>', tag + '</head>') : tag + html);
  }

  app.get('/', sendAppHtml);
  app.get(/^\/(?!api|uploads).*/, sendAppHtml);
}

// 统一错误处理（multer 超限等）
app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return fail(res, 400, '图片不能超过 2MB，请压缩后重试');
  console.error('[server] error:', err);
  fail(res, 500, '服务器开小差了，请稍后重试');
});

// 一次性迁移上传目录：图片也是数据，跟 db.json 一起搬到部署包外，
// 否则每次部署旧图全变 404。只复制不删除，已存在的文件跳过。
function migrateUploadsFromPackage() {
  if (!config.outsidePackage) return;
  const from = config.packageUploadDir;
  const to = config.uploadDir;
  if (!from || !to || from === to) return;
  let moved = 0;
  try {
    for (const scope of ['public', 'private']) {
      const src = path.join(from, scope);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(to, scope);
      fs.mkdirSync(dst, { recursive: true });
      for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const d = path.join(dst, name);
        if (!fs.statSync(s).isFile()) continue;
        if (fs.existsSync(d)) continue;
        fs.copyFileSync(s, d);
        moved++;
      }
    }
    if (moved) console.log(`[华农书循环] 已迁移 ${moved} 个历史上传文件到：${to}`);
  } catch (e) {
    console.error('[华农书循环] 上传文件迁移失败（不影响启动）：', e.message);
  }
}

app.listen(config.port, () => {
  console.log(`[华农书循环] server listening on :${config.port}`);
  console.log(`[华农书循环] 数据文件：${config.dataFile}（备份区：${db.backupDir}）`);
  console.log(`[华农书循环] 数据目录在部署包外：${config.outsidePackage ? '是（部署不会覆盖）' : '否（本地开发模式）'}`);
  console.log(`[华农书循环] 上传目录：${config.uploadDir}`);
  const st = mailer.getStatus();
  console.log(`[华农书循环] 邮件：enabled=${st.enabled} source=${st.configSource} ready=${st.ready} mode=${st.mode}${st.readyReason ? ' 原因=' + st.readyReason : ''}`);

  // 启动自检：真连一次 SMTP 做握手+AUTH，结论写进 mailMeta（后台可见）。
  // 失败不阻塞启动 —— 服务照样跑，只是降级为「待人工代发」，并由后台状态卡报警。
  if (String(process.env.SKIP_MAIL_VERIFY) !== '1') {
    mailer.verifyConnection().then(r => {
      if (r.skipped) console.log('[华农书循环] SMTP 自检跳过：' + r.message);
      else if (!r.ok) console.warn('[华农书循环] ⚠ SMTP 自检失败：' + r.message);
    }).catch(() => { /* 自检异常绝不能拖垮服务 */ });
  }

  migrateUploadsFromPackage();

  // 顺手清理过期验证码，避免长期运行的实例里堆积无用记录
  try { emailCode.purgeExpired(); } catch (_) { /* ignore */ }
});
