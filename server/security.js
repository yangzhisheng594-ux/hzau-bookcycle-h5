// 安全基础设施：密码哈希 / 令牌 / 输入校验 / 限流与锁定
// 参考：OWASP ASVS V2(认证)、V3(会话管理) 与 Supabase GoTrue、Auth.js 的通用实践
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ---------- 密码哈希 ----------
// 取舍：bcryptjs 为纯 JS 实现（无需 node-gyp 编译），cost=10 在托管沙箱 CPU 上约 60~90ms/次，
// 兼顾安全与响应；若换成原生 bcrypt/argon2 可把 BCRYPT_COST 提到 12。
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10;

function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), BCRYPT_COST);
}

function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return bcrypt.compareSync(String(plain), String(hash));
  } catch (e) {
    return false;
  }
}

// 密码强度：长度 8-64，且至少包含字母与数字（可选特殊字符）
function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return { ok: false, message: '密码至少 8 位' };
  if (value.length > 64) return { ok: false, message: '密码最长 64 位' };
  const hasLetter = /[A-Za-z]/.test(value);
  const hasDigit = /\d/.test(value);
  if (!hasLetter || !hasDigit) return { ok: false, message: '密码需同时包含字母和数字' };
  // 弱口令黑名单（生产可接入 HaveIBeenPwned k-匿名接口，此处本地兜底）
  const weak = ['12345678', '123456789', 'password', 'passw0rd', 'abc12345', 'qwerty123', '11111111', 'a1234567', 'iloveyou'];
  if (weak.includes(value.toLowerCase())) return { ok: false, message: '密码过于简单，请更换' };
  return { ok: true };
}

// ---------- 令牌 ----------
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// ---------- 输入校验 ----------
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validateEmail(email) {
  const value = normalizeEmail(email);
  // 实用级邮箱格式校验：本地部分 + @ + 含点域名，长度上限 254
  const re = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{2,255}\.[A-Za-z]{2,}$/;
  return re.test(value) && value.length <= 254;
}

function validateNickname(nick) {
  const value = String(nick || '').trim();
  if (!value) return { ok: false, message: '昵称不能为空' };
  if (value.length > 16) return { ok: false, message: '昵称最长 16 个字符' };
  // 仅剔除控制字符，允许中文/英文/数字/常见符号
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, message: '昵称含非法字符' };
  return { ok: true, value };
}

// 登录失败统一文案：无论「账号不存在」还是「密码错误」都返回同一句，消除账号枚举
const GENERIC_LOGIN_FAIL_MESSAGE = '账号或密码错误';

// 时序防护：账号不存在时也跑一次同等成本的 bcrypt 比对，抹平两条分支的响应耗时差。
// 惰性生成一次并缓存（避免进程启动即付出哈希成本）。
let dummyHashCache = '';
function dummyVerifyPassword(plain) {
  if (!dummyHashCache) dummyHashCache = hashPassword('timing-equalization-placeholder');
  try { bcrypt.compareSync(String(plain || ''), dummyHashCache); } catch (e) { /* 仅用于耗时，忽略结果 */ }
  return false;
}

// 登录限流参数（可用环境变量覆盖；测试环境会调高以避免功能用例被限流误伤）
const LOGIN_IP_LIMIT = Number(process.env.LOGIN_IP_LIMIT) || 10;          // 同一 IP 每分钟登录请求上限
const LOGIN_ACCOUNT_LIMIT = Number(process.env.LOGIN_ACCOUNT_LIMIT) || 10; // 同一 IP+账号 每分钟上限
const LOGIN_DIVERSITY_ACCOUNTS = Number(process.env.LOGIN_DIVERSITY_ACCOUNTS) || 3; // 同 IP 命中不同账号数阈值
const LOGIN_DIVERSITY_WINDOW_MS = Number(process.env.LOGIN_DIVERSITY_WINDOW_MS) || 10 * 60 * 1000;

// 第三层防护：同一 IP 短时间内尝试多个不同账号 → 判定为「撞库/枚举」，强制人机校验
const accountDiversity = new Map();
function trackAccountDiversity(ip, account) {
  const key = 'diversity:' + ip;
  const nowTs = Date.now();
  const entry = accountDiversity.get(key) || { accounts: [], windowStart: nowTs };
  if (nowTs - entry.windowStart > LOGIN_DIVERSITY_WINDOW_MS) {
    entry.accounts = [];
    entry.windowStart = nowTs;
  }
  const normalized = String(account || '').toLowerCase();
  if (normalized && !entry.accounts.includes(normalized)) entry.accounts.push(normalized);
  accountDiversity.set(key, entry);
  return { distinctAccounts: entry.accounts.length, requireCaptcha: entry.accounts.length > LOGIN_DIVERSITY_ACCOUNTS };
}

function resetAccountDiversity(ip) { accountDiversity.delete('diversity:' + ip); }

// 人机校验：不依赖第三方服务，服务端出一道算术题，单次有效、2 分钟过期。
// 说明：生产环境建议替换为图形/滑块验证码（待确认使用哪家），此处为自包含兜底实现。
const challenges = new Map();
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

function createLoginChallenge() {
  const id = randomToken(16);
  const a = 2 + Math.floor(Math.random() * 8);
  const b = 2 + Math.floor(Math.random() * 8);
  challenges.set(id, { answer: a + b, expiresAt: Date.now() + CHALLENGE_TTL_MS, used: false });
  return { challengeId: id, question: `${a} + ${b} = ?` };
}

function consumeLoginChallenge(id, answer) {
  const item = challenges.get(String(id || ''));
  if (!item) return false;
  challenges.delete(String(id)); // 单次有效
  if (item.used || item.expiresAt < Date.now()) return false;
  return Number(answer) === item.answer;
}

setInterval(() => {
  const nowTs = Date.now();
  for (const [id, item] of challenges) {
    if (item.expiresAt < nowTs) challenges.delete(id);
  }
  for (const [key, entry] of accountDiversity) {
    if (nowTs - entry.windowStart > LOGIN_DIVERSITY_WINDOW_MS) accountDiversity.delete(key);
  }
}, 5 * 60 * 1000).unref();

// ---------- 限流与账号锁定 ----------
// 进程内滑动窗口限流：单实例足够；多实例部署时替换为 Redis 计数器（接口保持一致）
const buckets = new Map();

function rateLimit(key, limit = 10, windowMs = 60 * 1000) {
  const nowTs = Date.now();
  const bucket = buckets.get(key) || { hits: [], blockedUntil: 0 };
  if (bucket.blockedUntil > nowTs) {
    const retryAfter = Math.ceil((bucket.blockedUntil - nowTs) / 1000);
    return { ok: false, retryAfter };
  }
  bucket.hits = bucket.hits.filter(ts => nowTs - ts < windowMs);
  bucket.hits.push(nowTs);
  if (bucket.hits.length > limit) {
    bucket.blockedUntil = nowTs + windowMs;
    buckets.set(key, bucket);
    return { ok: false, retryAfter: Math.ceil(windowMs / 1000) };
  }
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length };
}

function clearRateLimit(key) { buckets.delete(key); }

// 定期清理过期桶，避免内存无限增长（长驻进程可达上限约万级 key，量级可控）
setInterval(() => {
  const nowTs = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil && bucket.blockedUntil < nowTs && (!bucket.hits.length || nowTs - bucket.hits[0] > 3600 * 1000)) {
      buckets.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

// 登录失败计数与锁定时长（可在 config 调；默认 5 次锁 15 分钟）
const MAX_FAILED_LOGINS = Number(process.env.MAX_FAILED_LOGINS) || 5;
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES) || 15;

function isLocked(user) {
  if (!user || !user.lockedUntil) return false;
  if (new Date(user.lockedUntil).getTime() <= Date.now()) return false;
  return true;
}

function lockRemainingMinutes(user) {
  if (!isLocked(user)) return 0;
  return Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
}

module.exports = {
  BCRYPT_COST,
  hashPassword,
  verifyPassword,
  generateDummyHash: () => hashPassword('timing-equalization-placeholder'),
  dummyVerifyPassword,
  GENERIC_LOGIN_FAIL_MESSAGE,
  LOGIN_IP_LIMIT,
  LOGIN_ACCOUNT_LIMIT,
  LOGIN_DIVERSITY_ACCOUNTS,
  trackAccountDiversity,
  resetAccountDiversity,
  createLoginChallenge,
  consumeLoginChallenge,
  validatePassword,
  randomToken,
  sha256,
  normalizeEmail,
  validateEmail,
  validateNickname,
  rateLimit,
  clearRateLimit,
  MAX_FAILED_LOGINS,
  LOCK_MINUTES,
  isLocked,
  lockRemainingMinutes
};
