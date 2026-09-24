// 服务端配置：端口 / 密钥 / 管理员密码 / 订单锁定时长 / 文件路径
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 订单锁定超时时长（小时）：超时自动取消并释放商品
// ⚠️ 不能写成 `Number(env) || 48`——那样合法的 0（立即超时，测试用）会被当成"未设置"而回落成 48 小时。
const lockEnv = process.env.ORDER_LOCK_TIMEOUT_HOURS;
const lockTimeoutHours = (lockEnv !== undefined && String(lockEnv).trim() !== '' && Number.isFinite(Number(lockEnv)) && Number(lockEnv) >= 0)
  ? Number(lockEnv)
  : 48;

// ── 运行期数据放哪（这是"数据不丢失"的根子）──────────────────────────────────
// 托管平台部署的动作是「用本地目录覆盖线上同名文件」，没有任何 ignore 机制。
// 只要 db.json 留在部署包里，每部署一次就会被本地那份冲掉 —— 这正是历史上
// "每次部署数据都重头再来"的直接原因。
// 解法（和所有正规部署一致）：**代码与数据分离**。沙箱把项目解压到 /workspace 且可写，
// 所以线上统一把 db.json / uploads 写到 /workspace/data —— 它在部署包之外，
// 部署、重启、冷启动都碰不到它。本地开发（Windows/macOS，没有 /workspace）自动回退到包内。
const PACKAGE_DATA_DIR = path.join(__dirname, 'data');
const PACKAGE_UPLOAD_DIR = path.join(__dirname, 'uploads');

function outsidePackageDir() {
  // 显式给了 DATA_DIR 就以它为准（任何平台都生效，方便本地演练与自测）
  const explicit = String(process.env.DATA_DIR || '').trim();
  if (!explicit && process.platform === 'win32') return '';
  const base = explicit || (fs.existsSync('/workspace') ? '/workspace/data' : '');
  if (!base) return '';
  try {
    fs.mkdirSync(base, { recursive: true });
    fs.accessSync(base, fs.constants.W_OK); // 能写才算数，写不了就回退到包内
    return base;
  } catch (_) {
    return '';
  }
}

// 显式给了 DATA_FILE（测试用独立库）时不启用包外目录，避免测试互相污染
const usingExplicitFile = Boolean(process.env.DATA_FILE);
const OUTSIDE_DIR = usingExplicitFile ? '' : outsidePackageDir();

const DATA_DIR = usingExplicitFile
  ? path.dirname(path.resolve(process.env.DATA_FILE))
  : (OUTSIDE_DIR || PACKAGE_DATA_DIR);

function dirWritableOrPackage(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch (_) {
    return PACKAGE_DATA_DIR;
  }
}

const UPLOAD_DIR = OUTSIDE_DIR
  ? dirWritableOrPackage(path.join(OUTSIDE_DIR, 'uploads'))
  : PACKAGE_UPLOAD_DIR;

// ── 站点私有配置（随包部署，但**不进 git**）──────────────────────────────────
// 和管理员口令这类"部署时需要、公开源码时绝不能带"的值，统一放这里。
// 模板见 server/site-config.example.json；真实文件 server/site-config.json 已在 .gitignore 里。
// 取值优先级：环境变量 > site-config.json > 首次启动随机生成（仅密钥类）。
function readSiteConfig() {
  const file = String(process.env.SITE_CONFIG || '').trim() || path.join(__dirname, 'site-config.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}
const SITE_CONFIG = readSiteConfig();

// ── JWT 签名密钥 ─────────────────────────────────────────────────────────────
// ⚠️ 绝不写死在源码里：源码一旦公开，任何人都能拿它伪造管理员令牌接管后台。
// 落盘持久化是必需的——托管平台可能多实例/重启，密钥必须跨重启稳定，
// 否则 A 实例签发的 token 到 B 实例就验不过，用户被反复踢下线。
// 密钥文件放 dataDir（线上在部署包之外），部署覆盖不到，也不会进 git。
function resolveJwtSecret() {
  const fromEnv = String(process.env.JWT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  const dir = dirWritableOrPackage(DATA_DIR);
  const file = path.join(dir, 'jwt-secret.key');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (_) { /* 首次启动还没有 */ }
  const generated = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(file, generated + '\n', { mode: 0o600 });
    console.log('[config] 已生成并持久化 JWT 密钥到 ' + file + '（不进 git，请勿外传）');
  } catch (_) {
    console.warn('[config] 无法写入 JWT 密钥文件，本次使用临时密钥（重启后所有登录态失效）');
  }
  return generated;
}

// ── 管理员口令 ───────────────────────────────────────────────────────────────
// 同样不写死在源码里。⚠️ 绝不能是空字符串：登录判定是 `输入的密码 !== config.adminPassword`，
// 空口令会导致"提交空密码即登录成功"。这里保证一定有值，且未知时是随机值而非已知默认值。
function resolveAdminPassword() {
  const fromEnv = String(process.env.ADMIN_PASSWORD || '').trim();
  if (fromEnv) return fromEnv;
  const fromSite = String(SITE_CONFIG.adminPassword || '').trim();
  if (fromSite) return fromSite;
  const dir = dirWritableOrPackage(DATA_DIR);
  const file = path.join(dir, 'admin-password.key');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch (_) { /* 首次启动 */ }
  const generated = crypto.randomBytes(9).toString('base64url');
  try {
    fs.writeFileSync(file, generated + '\n', { mode: 0o600 });
    console.log('[config] 未配置管理员口令，已随机生成并写入 ' + file);
    console.log('[config] 本次管理员口令：' + generated + '（请立即记录，或改用 ADMIN_PASSWORD / site-config.json 指定）');
  } catch (_) {
    console.warn('[config] 管理员口令未配置且无法落盘，后台登录将不可用，请设置 ADMIN_PASSWORD 环境变量');
  }
  return generated;
}

module.exports = {
  port: Number(process.env.PORT) || 8300,
  jwtSecret: resolveJwtSecret(),
  adminPassword: resolveAdminPassword(),
  // 运营方联系方式（管理员微信）：仅用于展示与复制，不含任何敏感信息，
  // 但属于"每个部署各不相同"的值，所以同样走 site-config.json / 环境变量。
  adminWechat: String(process.env.ADMIN_WECHAT || SITE_CONFIG.adminWechat || '').trim(),
  lockTimeoutHours,
  tokenTtl: '7d',
  // 运行期数据目录（线上在部署包外，本地在包内）
  dataDir: dirWritableOrPackage(DATA_DIR),
  dataFile: usingExplicitFile
    ? path.resolve(process.env.DATA_FILE)
    : path.join(dirWritableOrPackage(DATA_DIR), 'db.json'),
  uploadDir: UPLOAD_DIR,
  // 包内旧位置：首次启动做一次性迁移用（只搬不删）
  packageDataFile: path.join(PACKAGE_DATA_DIR, 'db.json'),
  packageUploadDir: PACKAGE_UPLOAD_DIR,
  // 是否启用了"包外数据目录"（线上自检要看这一项）
  outsidePackage: Boolean(OUTSIDE_DIR),
  maxUploadBytes: 2 * 1024 * 1024, // 2MB，前端已压缩到 960px，正常 <300KB
  // 昵称规则
  nicknameMin: 1,
  nicknameMax: 16
};
