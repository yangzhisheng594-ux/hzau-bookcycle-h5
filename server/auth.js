// 认证与权限中间件：Access Token(JWT, 短期) + Refresh Token(存库, 轮换, 可吊销)
// 参考：Auth.js / Supabase GoTrue 的双令牌 + 刷新轮换模型，并兼容托管网关剥离 Authorization 头的场景
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');
const security = require('./security');
const mailer = require('./mailer');

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '2h';
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;

function signAccessToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      openid: user.openid || '',
      nickName: user.nickName,
      avatarUrl: user.avatarUrl || '/images/demo-avatar.png',
      verifyStatus: user.verifyStatus || 'none',
      emailVerified: Boolean(user.emailVerified),
      type: 'access'
    },
    config.jwtSecret,
    { expiresIn: ACCESS_TTL }
  );
}

function signAdminToken(adminId = 'admin') {
  return jwt.sign({ role: 'admin', adminId, type: 'admin' }, config.jwtSecret, { expiresIn: '12h' });
}

// 签发刷新令牌：明文仅返回一次，库里只存 sha256（库泄露也无法冒用）
function issueRefreshToken(user, { userAgent = '', ip = '' } = {}) {
  const raw = security.randomToken(32);
  const record = {
    id: db.nextId('session'),
    userId: user.id,
    tokenHash: security.sha256(raw),
    userAgent: String(userAgent).slice(0, 200),
    ip: String(ip).slice(0, 64),
    createdAt: db.now(),
    lastUsedAt: db.now(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400 * 1000).toISOString(),
    revokedAt: null
  };
  db.insert('sessions', record);
  return { raw, record };
}

function findSessionByRaw(raw) {
  if (!raw) return null;
  const hash = security.sha256(raw);
  return db.get('sessions').find(s => s.tokenHash === hash) || null;
}

function revokeSession(session) {
  if (!session || session.revokedAt) return;
  session.revokedAt = db.now();
  db.persist();
}

function revokeAllSessions(userId) {
  const list = db.get('sessions').filter(s => String(s.userId) === String(userId) && !s.revokedAt);
  list.forEach(s => { s.revokedAt = db.now(); });
  if (list.length) db.persist();
  return list.length;
}

// 解析 token：query > X-Access-Token > Authorization（托管网关会剥离/覆盖 Authorization）
function extractToken(req) {
  const header = String(req.headers.authorization || '');
  const altHeader = String(req.headers['x-access-token'] || '');
  const queryToken = String((req.query && req.query.token) || '');
  if (queryToken) return queryToken;
  if (altHeader) return altHeader.startsWith('Bearer ') ? altHeader.slice(7) : altHeader;
  if (header.startsWith('Bearer ')) return header.slice(7);
  return '';
}

// 已被「彻底删除」的账号 ID：这类 uid 在库里已查不到，但旧令牌仍在有效期内，
// 必须显式拦截，否则会走 token 载荷兜底凭空造出用户对象（等于令牌永生）。
function isPurgedUser(userId) {
  const list = db.getSetting('purgedUsers', []) || [];
  return list.some(item => String(item.id) === String(userId));
}

function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.type === 'admin' || payload.role === 'admin') {
        req.admin = { id: payload.adminId || 'admin' };
      } else if (payload.uid) {
        // 优先本地库（状态最新）；多实例/文件不共享场景用 token 载荷兜底
        const found = db.findById('users', payload.uid);
        if (found) {
          // 已注销账号：JWT 无法即时吊销，只能在这里让旧令牌彻底失效，
          // 否则注销后最长 2 小时内旧令牌仍能冒充本人操作。
          if (!found.deleted) req.user = found;
        } else if (!isPurgedUser(payload.uid)) {
          // 本地库查不到才兜底。但用户被「彻底删除」后 uid 同样查不到，
          // 若不拦住就会凭空造出一个用户对象 —— 等于一张旧令牌永久有效。
          req.user = {
            id: payload.uid,
            openid: payload.openid || '',
            nickName: payload.nickName || '华农书友',
            avatarUrl: payload.avatarUrl || '/images/demo-avatar.png',
            verifyStatus: payload.verifyStatus || 'none',
            emailVerified: Boolean(payload.emailVerified),
            rejectReason: '',
            _fromToken: true
          };
        }
      }
    } catch (e) {
      // 区分「过期」与「无效」：过期可被 refresh token 静默续期
      if (e && e.name === 'TokenExpiredError') req.tokenExpired = true;
    }
  }
  next();
}

// ---------- 账号处置（冻结 / 限制）----------
// 冻结：禁止登录，且已有令牌一律失效（保留数据，可解冻）
function isFrozen(user) {
  return Boolean(user && user.frozen);
}

function frozenPayload(user) {
  return {
    success: false,
    code: 'ACCOUNT_FROZEN',
    message: `账号已被冻结${user && user.frozenReason ? '：' + user.frozenReason : ''}，如有疑问请联系管理员`,
    frozenReason: (user && user.frozenReason) || ''
  };
}

// 限制发布 / 限制购买：到期时间在未来的才算生效
function activeRestriction(until) {
  if (!until) return null;
  const ts = new Date(until).getTime();
  if (!Number.isFinite(ts) || ts <= Date.now()) return null;
  return { until, remainingHours: Math.ceil((ts - Date.now()) / 3600000) };
}

function authRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: req.tokenExpired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
      message: req.tokenExpired ? '登录已过期' : '请先登录'
    });
  }
  if (isFrozen(req.user)) {
    return res.status(403).json(frozenPayload(req.user));
  }
  next();
}

function adminRequired(req, res, next) {
  if (!req.admin) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: '仅管理员可操作' });
  next();
}

// 核心操作门槛：已登录 + （密码账号需邮箱已验证）+ 企业微信身份认证通过
// 说明 1：无密码的旧演示账号（clientId 登录）没有邮箱，豁免邮箱验证，避免历史用户被卡死
// 说明 2：**只有邮件服务真的可用时才要求邮箱验证**。SMTP 未配置/发送失败时若仍硬卡，
//         用户既收不到信、也无法自证，等于全员锁死——这属于"死逻辑"，必须去掉。
function approvedRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: req.tokenExpired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
      message: req.tokenExpired ? '登录已过期' : '请先登录'
    });
  }
  if (isFrozen(req.user)) {
    return res.status(403).json(frozenPayload(req.user));
  }
  const needsEmail = Boolean(req.user.passwordHash) && !req.user.emailVerified && mailer.isReady();
  if (needsEmail) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_NOT_VERIFIED',
      message: '请先完成邮箱验证（注册时已发送验证邮件，可在个人中心重新发送）'
    });
  }
  if (req.user.verifyStatus !== 'approved') {
    return res.status(403).json({
      success: false,
      code: 'NOT_VERIFIED',
      verifyStatus: req.user.verifyStatus,
      message: req.user.verifyStatus === 'pending'
        ? '身份审核中，审核通过后即可操作'
        : '请先完成企业微信身份认证'
    });
  }
  next();
}

module.exports = {
  ACCESS_TTL,
  REFRESH_TTL_DAYS,
  sign: signAccessToken, // 兼容旧引用
  signAccessToken,
  signAdminToken,
  issueRefreshToken,
  findSessionByRaw,
  revokeSession,
  revokeAllSessions,
  extractToken,
  optionalAuth,
  authRequired,
  adminRequired,
  approvedRequired,
  isFrozen,
  frozenPayload,
  activeRestriction
};
