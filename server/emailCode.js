// 邮箱验证码服务：6 位随机数字，服务端只存哈希
//
// 安全要点：
//  1. 随机源用 crypto.randomInt（密码学安全），不用 Math.random —— 后者可预测，能被撞出来。
//  2. 库里**永不存明文**：存 HMAC-SHA256(email|scene|code)，密钥取自服务端 jwtSecret。
//     → 数据库泄露也拿不到验证码；且哈希绑定邮箱与场景，跨账号/跨用途不可复用。
//  3. 有效期 5 分钟 + 最多错 5 次 + 一次性使用 —— 6 位数字只有 10^6 种组合，
//     没有这三条就等于把账号验证交给穷举。（接口层另有 IP/账号维度的限流）
//  4. 重新获取会立即作废该邮箱该场景下所有旧码 —— 防止"攒一堆有效码"和重复提交。
const crypto = require('crypto');
const db = require('./db');

// 有效期默认 5 分钟；测试可用 EMAIL_CODE_TTL_MS 调短（显式判空，别用 `Number(env) || x`，
// 那个写法会把合法的 0 当成未设置而回落成默认值 —— 本项目踩过一次）
const ttlEnv = process.env.EMAIL_CODE_TTL_MS;
const TTL_MS = (ttlEnv !== undefined && String(ttlEnv).trim() !== '' && Number.isFinite(Number(ttlEnv)) && Number(ttlEnv) >= 0)
  ? Number(ttlEnv)
  : 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;                  // 同一批次最多输错次数，超出即作废
const RESEND_INTERVAL_MS = 60 * 1000;    // 重新获取的最小间隔：60 秒
const PURGE_AFTER_MS = 60 * 60 * 1000;   // 过期 1 小时以上的记录物理清理

const SCENE = { VERIFY: 'verify', RESET: 'reset' };

const normalizeEmail = e => String(e || '').trim().toLowerCase();

function secret() {
  try {
    return require('./config').jwtSecret || 'hzau-bookcycle-local-secret';
  } catch (_) {
    return 'hzau-bookcycle-local-secret';
  }
}

// 6 位随机数字（不足 6 位左侧补零，保证「000123」这类也能正常生成与比对）
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashCode(email, scene, code) {
  return crypto.createHmac('sha256', String(secret()))
    .update(`${normalizeEmail(email)}|${scene}|${String(code)}`)
    .digest('hex');
}

function isExpired(rec) {
  return new Date(rec.expiresAt).getTime() < Date.now();
}

// 物理清理过期记录，避免 emailCodes 无限膨胀
function purgeExpired() {
  const list = db.get('emailCodes');
  if (!list) return 0;
  const cutoff = Date.now() - PURGE_AFTER_MS;
  const before = list.length;
  const kept = list.filter(r => {
    if (!r.expiresAt) return false;
    const t = new Date(r.expiresAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  if (kept.length !== before) {
    db.get('emailCodes').length = 0;
    db.get('emailCodes').push(...kept);
    db.persist();
  }
  return before - kept.length;
}

// 作废该邮箱该场景下所有仍未使用的验证码（重新获取 / 用成功后调用）
function invalidateAll(email, scene) {
  const em = normalizeEmail(email);
  let n = 0;
  for (const rec of db.get('emailCodes') || []) {
    if (rec.email === em && rec.scene === scene && !rec.usedAt) {
      rec.usedAt = db.now();
      n++;
    }
  }
  if (n) db.persist();
  return n;
}

/**
 * 签发验证码
 * @returns {{code,expiresAt,ttlSeconds,id}} 明文 code **只在返回值里出现一次**，
 *          调用方负责把它送进邮件；服务端不留明文。
 */
function issue({ email, scene, ip = '' }) {
  if (![SCENE.VERIFY, SCENE.RESET].includes(scene)) {
    throw new Error(`未知验证码场景: ${scene}`);
  }
  purgeExpired();
  invalidateAll(normalizeEmail(email), scene);   // 旧码立即失效，杜绝"重复提交"

  const code = generateCode();
  const rec = {
    id: db.nextId('emailCode'),
    email: normalizeEmail(email),
    scene,
    codeHash: hashCode(email, scene, code),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    createdAt: db.now(),
    usedAt: null,
    ip: String(ip || '')
  };
  db.insert('emailCodes', rec);
  return { code, id: rec.id, expiresAt: rec.expiresAt, ttlSeconds: TTL_MS / 1000 };
}

/**
 * 校验验证码（一次性）
 * @returns {{ok:boolean, message?:string, code?:string, record?:object}}
 */
function verify({ email, scene, code }) {
  const em = normalizeEmail(email);
  const input = String(code || '').trim();

  if (!/^\d{6}$/.test(input)) {
    return { ok: false, code: 'CODE_FORMAT', message: '验证码为 6 位数字' };
  }

  const candidates = (db.get('emailCodes') || [])
    .filter(r => r.email === em && r.scene === scene && !r.usedAt && !isExpired(r));

  if (!candidates.length) {
    return { ok: false, code: 'NO_CODE', message: '验证码已过期或不存在，请重新获取' };
  }

  const target = hashCode(em, scene, input);
  const hit = candidates.find(r => r.codeHash === target);

  if (hit) {
    hit.usedAt = db.now();
    db.persist();
    return { ok: true, record: hit };
  }

  // 输错：整个批次的候选记录共享尝试名额（防止"对着多个码轮流试"）
  let left = 0;
  for (const rec of candidates) {
    rec.attempts = Number(rec.attempts || 0) + 1;
    const max = Number(rec.maxAttempts || MAX_ATTEMPTS);
    if (rec.attempts >= max) rec.usedAt = db.now();
    left = Math.max(left, max - rec.attempts);
  }
  db.persist();

  if (left <= 0) {
    return { ok: false, code: 'TOO_MANY_ATTEMPTS', message: '验证码错误次数过多，请重新获取' };
  }
  return { ok: false, code: 'CODE_WRONG', message: `验证码不正确，还可尝试 ${left} 次` };
}

// 距离下次可重新获取还剩多少秒（0 = 可以立即重发）
function secondsUntilResend(email, scene) {
  const em = normalizeEmail(email);
  const latest = (db.get('emailCodes') || [])
    .filter(r => r.email === em && r.scene === scene)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  if (!latest) return 0;
  const passed = Date.now() - new Date(latest.createdAt).getTime();
  if (passed >= RESEND_INTERVAL_MS) return 0;
  return Math.ceil((RESEND_INTERVAL_MS - passed) / 1000);
}

// 后台排障用：只回状态（是否过期/已用/剩余次数），绝不回明文验证码
function peek(email, scene) {
  const em = normalizeEmail(email);
  const rec = (db.get('emailCodes') || [])
    .filter(r => r.email === em && r.scene === scene)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  if (!rec) return null;
  return {
    id: rec.id,
    scene: rec.scene,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    expired: isExpired(rec),
    used: Boolean(rec.usedAt),
    attempts: Number(rec.attempts || 0),
    maxAttempts: Number(rec.maxAttempts || MAX_ATTEMPTS)
  };
}

module.exports = {
  SCENE,
  issue,
  verify,
  invalidateAll,
  secondsUntilResend,
  purgeExpired,
  peek,
  generateCode,
  hashCode,
  TTL_MS,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_MS
};
