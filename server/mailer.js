// 邮件适配器
//
// 配置来源优先级：后台库配置(settings.mail) > 部署包内配置文件(mail-config.json) > 环境变量 SMTP_* > 默认值
//   —— 之所以把「后台库配置」放在最前：WorkBuddy 托管沙箱没有注入环境变量的入口，
//      只认环境变量的话，线上永远配不上 SMTP，只能一直降级不发信。
//   —— 之所以再加一层「部署包内文件」：数据库文件 data/db.json 只活在运行实例里，
//      重新部署会用本地那份覆盖线上的库 → 后台配置每次重部署都会丢（历史故障）。
//      把配置同时落到随包发布的 mail-config.json，重部署/冷启动/多实例都能读回同一份配置。
//
// 真发信依赖 nodemailer（已在 dependencies 中，必须装，否则永远降级）。
// 未配置 / 未安装 / 发送失败时，一律降级为「开发模式」：写 data/mail-outbox.log，
// 并把状态暴露给后台，便于管理员一眼看出「到底发没发出去、为什么没发出去」。
const fs = require('fs');
const path = require('path');
const db = require('./db');

const OUTBOX = path.join(__dirname, 'data', 'mail-outbox.log');
const DEV_OUTBOX_KEEP = 50; // 开发模式下保留最近多少封，供后台代取链接
// 随部署包发布的配置文件：重部署不丢配置（部署时不会带上运行期新写的 data/db.json）
// 允许用 MAIL_CONFIG_FILE 覆盖路径：测试必须用临时文件，避免污染线上要用的这份配置
const FILE_CONFIG = process.env.MAIL_CONFIG_FILE || path.join(__dirname, 'mail-config.json');

const DEFAULTS = {
  enabled: false,
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  from: '',
  appBaseUrl: 'https://hzau-bookcycle.app.workbuddy.host'
};

// ---- 部署包配置文件读取（按 mtime 缓存，改完文件立即生效）----
let fileCache = { mtime: 0, data: {} };
function fileSettings() {
  try {
    const stat = fs.statSync(FILE_CONFIG);
    if (stat.mtimeMs !== fileCache.mtime) {
      const parsed = JSON.parse(fs.readFileSync(FILE_CONFIG, 'utf8'));
      fileCache = { mtime: stat.mtimeMs, data: (parsed && typeof parsed === 'object') ? parsed : {} };
    }
  } catch (_) {
    // 文件不存在 / 解析失败：视为没有文件层，不影响其余优先级
  }
  return fileCache.data || {};
}

// 把生效配置回写到部署包文件（失败不致命：库内配置仍然在）
function writeFileSettings(cfg) {
  try {
    fs.writeFileSync(FILE_CONFIG, JSON.stringify(cfg, null, 2));
    fileCache = { mtime: 0, data: {} };
    return true;
  } catch (e) {
    console.error('[mailer] 写入 mail-config.json 失败（不影响库内配置）：', e.message);
    return false;
  }
}

function pick(savedValue, fileValue, envValue, fallback) {
  for (const value of [savedValue, fileValue, envValue]) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function envSettings() {
  return {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || '',
    secure: process.env.SMTP_SECURE || '',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '',
    appBaseUrl: process.env.APP_BASE_URL || ''
  };
}

// 合并后的生效配置
function current() {
  const saved = db.getSetting('mail', {}) || {};
  const file = fileSettings();
  const env = envSettings();
  const enabled = typeof saved.enabled === 'boolean'
    ? saved.enabled
    : (typeof file.enabled === 'boolean' ? file.enabled : Boolean(pick(saved.host, file.host, env.host, '')));

  const host = String(pick(saved.host, file.host, env.host, DEFAULTS.host)).trim();
  const port = Number(pick(saved.port, file.port, env.port, DEFAULTS.port)) || DEFAULTS.port;
  const secureRaw = pick(saved.secure, file.secure, env.secure, DEFAULTS.secure);
  const secure = secureRaw === true || String(secureRaw) === 'true' || String(secureRaw) === '1';
  const user = String(pick(saved.user, file.user, env.user, DEFAULTS.user)).trim();
  const pass = String(pick(saved.pass, file.pass, env.pass, DEFAULTS.pass));
  const from = String(pick(saved.from, file.from, env.from, '') || user || 'no-reply@hzau-bookcycle.local').trim();
  const appBaseUrl = String(pick(saved.appBaseUrl, file.appBaseUrl, env.appBaseUrl, DEFAULTS.appBaseUrl)).replace(/\/$/, '');

  return { enabled, host, port, secure, user, pass, from, appBaseUrl };
}

// ---- nodemailer 可用性（只探测一次，结果缓存）----
let nodemailer = null;
let nodemailerError = '';
let probed = false;
function loadNodemailer() {
  if (probed) return nodemailer;
  probed = true;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    nodemailer = null;
    nodemailerError = 'nodemailer 未安装（请执行 npm install）';
  }
  return nodemailer;
}

let transporter = null;
let transporterKey = '';
function getTransporter() {
  const cfg = current();
  // 缺账号/授权码时不建连：这种「半配置」在真实 SMTP 上必然认证失败，
  // 硬连的结果只有一个 —— 每个注册/找回请求白等 10~20 秒超时。直接走开发模式兜底。
  if (!cfg.enabled || !cfg.host || !cfg.user || !cfg.pass) return null;
  const nm = loadNodemailer();
  if (!nm) return null;
  const key = [cfg.host, cfg.port, cfg.secure, cfg.user, cfg.pass].join('|');
  if (transporter && transporterKey === key) return transporter;
  try {
    transporter = nm.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
    transporterKey = key;
    return transporter;
  } catch (e) {
    transporter = null;
    transporterKey = '';
    nodemailerError = '创建传输器失败：' + e.message;
    return null;
  }
}

// 配置变更后必须丢掉缓存的 transporter，否则改了参数也不生效
function resetTransporter() {
  try { if (transporter && transporter.close) transporter.close(); } catch (_) { /* ignore */ }
  transporter = null;
  transporterKey = '';
}

function meta() {
  return db.getSetting('mailMeta', {}) || {};
}
function updateMeta(patch) {
  db.setSetting('mailMeta', { ...meta(), ...patch });
}

// 是否具备「真发信」的完整条件。返回空字符串 = 就绪；否则给出人话原因。
// 注意：QQ/163/企业邮都必须带账号+授权码认证，缺一个都会在握手阶段被
// 服务端以「503 need EHLO and AUTH first」拒掉，因此必须计入就绪判定，
// 否则后台会显示「已配置」而实际一封也发不出去（历史故障）。
function readyReason() {
  const cfg = current();
  if (!loadNodemailer()) return nodemailerError || '当前环境未安装 nodemailer 依赖';
  if (!cfg.host) return '未填写 SMTP 服务器地址';
  if (!cfg.enabled) return '邮件服务处于关闭状态（打开「启用」开关后才会真实发信）';
  if (!cfg.user) return '未填写 SMTP 账号（发信邮箱，如 xxx@qq.com）';
  if (!cfg.pass) return '未填写 SMTP 授权码（QQ/163 邮箱需用授权码，不是邮箱登录密码）';
  return '';
}

function isReady() {
  return readyReason() === '';
}

function maskUser(user) {
  const s = String(user || '');
  if (s.length <= 2) return s ? s[0] + '*' : '';
  return s.slice(0, 2) + '***' + s.slice(-1);
}

function getStatus() {
  const cfg = current();
  const nm = loadNodemailer();
  const m = meta();
  const saved = db.getSetting('mail', {}) || {};
  const file = fileSettings();
  const reason = readyReason();
  return {
    enabled: cfg.enabled,
    configured: Boolean(cfg.host),
    ready: reason === '',
    readyReason: reason,
    authComplete: Boolean(cfg.user && cfg.pass),
    mode: reason === '' ? 'smtp' : 'dev',
    nodemailerInstalled: Boolean(nm),
    nodemailerVersion: nm ? require('nodemailer/package.json').version : '',
    nodemailerError: nm ? '' : (nodemailerError || '工作区未安装 nodemailer'),
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    userMasked: maskUser(cfg.user),
    hasPassword: Boolean(cfg.pass),
    from: cfg.from,
    appBaseUrl: cfg.appBaseUrl,
    // 配置到底存在哪：backend=后台库(实例内) / file=部署包配置文件(重部署不丢) / env=环境变量 / none
    configSource: Object.keys(saved).length ? 'backend' : (Object.keys(file).length ? 'file' : (cfg.host ? 'env' : 'none')),
    fileConfigPresent: Object.keys(file).length > 0,
    configFilePath: FILE_CONFIG,
    meta: {
      lastError: m.lastError || '',
      lastErrorAt: m.lastErrorAt || null,
      lastSuccessAt: m.lastSuccessAt || null,
      lastTestAt: m.lastTestAt || null,
      lastTestResult: m.lastTestResult || '',
      sentCount: Number(m.sentCount || 0),
      devCount: Number(m.devCount || 0),
      // 启动自检结果：ok=连得上 / fail=连不上（附原因） / skipped=压根没启用
      lastVerifyAt: m.lastVerifyAt || null,
      lastVerifyResult: m.lastVerifyResult || '',
      lastVerifyMessage: m.lastVerifyMessage || ''
    },
    outbox: OUTBOX
  };
}

// 保存配置（patch 中未出现的字段保持原值；pass 传空字符串表示「不修改」）
function saveSettings(patch = {}) {
  const saved = db.getSetting('mail', {}) || {};
  const next = { ...saved };

  if (patch.enabled !== undefined) next.enabled = Boolean(patch.enabled);
  if (patch.host !== undefined) next.host = String(patch.host || '').trim();
  if (patch.port !== undefined) {
    const port = Number(patch.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, message: '端口必须是 1-65535 之间的整数' };
    }
    next.port = port;
  }
  if (patch.secure !== undefined) next.secure = Boolean(patch.secure);
  if (patch.user !== undefined) next.user = String(patch.user || '').trim();
  if (patch.pass !== undefined && String(patch.pass) !== '') next.pass = String(patch.pass);
  if (patch.clearPassword === true) next.pass = '';
  if (patch.from !== undefined) next.from = String(patch.from || '').trim();
  if (patch.appBaseUrl !== undefined) next.appBaseUrl = String(patch.appBaseUrl || '').trim();

  // 完整性校验：开启发信必须「服务器 + 账号 + 授权码」齐全。
  // 少了账号或授权码，SMTP 会在握手阶段直接拒绝（503 need EHLO and AUTH first），
  // 界面却显示"已配置/已开启"，管理员会以为配好了 —— 这种假成功必须挡掉。
  if (next.enabled) {
    if (!String(next.host || '').trim()) {
      return { ok: false, message: '开启邮件服务前必须填写 SMTP 服务器地址' };
    }
    if (!String(next.user || '').trim()) {
      return { ok: false, message: '开启邮件服务前必须填写 SMTP 账号（发信邮箱，如 xxx@qq.com）' };
    }
    if (!String(next.pass || '').trim()) {
      return { ok: false, message: '开启邮件服务前必须填写 SMTP 授权码（QQ/163 邮箱用授权码，不是登录密码）' };
    }
  }

  db.setSetting('mail', next);
  // 同时固化为部署包内配置文件：重部署会用本地目录覆盖线上库，
  // 只有写进随包文件，配置才能跨「刷新 / 重启 / 重新部署」存活。
  const merged = current();
  const fileOk = writeFileSettings({
    enabled: merged.enabled,
    host: merged.host,
    port: merged.port,
    secure: merged.secure,
    user: merged.user,
    pass: merged.pass,
    from: merged.from,
    appBaseUrl: merged.appBaseUrl
  });
  resetTransporter();
  return { ok: true, status: getStatus(), persistedTo: fileOk ? 'db+file' : 'db' };
}

// 导出完整配置（含授权码），用于把配置固化进部署包：
// 写入 server/mail-config.json → 重新部署 → 任何实例/任何重启都自带这份配置。
function exportConfig() {
  const cfg = current();
  return {
    ...cfg,
    _filePath: FILE_CONFIG,
    _generatedAt: new Date().toISOString(),
    _howto: '将本对象（去掉 _ 开头的字段）写入 server/mail-config.json 并重新部署，即可长期生效'
  };
}

// ---- 开发模式兜底：落盘 + 供后台代取 ----
function recordDevMail({ to, subject, text, link }) {
  const entry = { at: new Date().toISOString(), to, subject, link };
  const line = `[${entry.at}] to=${to} subject=${subject} link=${link}\n${text}\n---\n`;
  try {
    fs.mkdirSync(path.dirname(OUTBOX), { recursive: true });
    fs.appendFileSync(OUTBOX, line);
  } catch (_) { /* 落盘失败不影响主流程 */ }

  // 只保留最近若干封，且仅在「邮件服务不可用」期间保留，供管理员人工代发
  const list = db.getSetting('devOutbox', []) || [];
  list.unshift({ ...entry, text: String(text || '').slice(0, 2000) });
  db.setSetting('devOutbox', list.slice(0, DEV_OUTBOX_KEEP));
  console.log('[mailer:dev]', `${to} | ${subject} | ${link}`);
  return entry;
}

/**
 * 发送邮件
 * @returns {Promise<{delivered:boolean, mode:'smtp'|'dev', link?:string, error?:string}>}
 */
async function sendMail({ to, subject, text, link = '' }) {
  const client = getTransporter();
  if (client) {
    try {
      const info = await client.sendMail({ from: current().from, to, subject, text });
      updateMeta({ lastSuccessAt: new Date().toISOString(), sentCount: Number(meta().sentCount || 0) + 1, lastError: '' });
      return { delivered: true, mode: 'smtp', messageId: info && info.messageId };
    } catch (e) {
      // 发送失败不静默：记错误 + 降级，后台能直接看到原因
      const message = (e && (e.code ? e.code + ' ' : '') + e.message) || '未知错误';
      updateMeta({ lastError: String(message).slice(0, 300), lastErrorAt: new Date().toISOString() });
      console.error('[mailer] SMTP 发送失败，降级开发模式：', message);
      resetTransporter();
    }
  }
  const entry = recordDevMail({ to, subject, text, link });
  updateMeta({ devCount: Number(meta().devCount || 0) + 1 });
  return { delivered: false, mode: 'dev', link: entry.link || link, error: meta().lastError || '' };
}

// 测试发信：强制真发，把成功/失败原样返回给后台（不降级、不写 outbox）
async function sendTestMail(to) {
  const cfg = current();
  // 先做完整性检查：把「缺账号/缺授权码」这类问题在发信前用人话讲清楚，
  // 而不是让管理员对着 503 的 SMTP 原始报错猜。
  const reason = readyReason();
  if (reason) return { ok: false, message: reason };
  resetTransporter(); // 测试必须用最新参数建连，不吃旧缓存
  const client = getTransporter();
  if (!client) return { ok: false, message: nodemailerError || '无法创建 SMTP 连接' };
  try {
    const info = await client.sendMail({
      from: cfg.from,
      to,
      subject: '【华农书循环】邮件服务测试',
      text: `这是一封测试邮件。\n\n如果你收到了它，说明后台的 SMTP 配置是正确的，注册验证与找回密码邮件都能正常发出。\n\n发送时间：${new Date().toLocaleString('zh-CN')}\n服务器：${cfg.host}:${cfg.port}（${cfg.secure ? 'SSL/TLS' : 'STARTTLS/明文'}）`
    });
    updateMeta({
      lastTestAt: new Date().toISOString(),
      lastTestResult: 'success',
      lastSuccessAt: new Date().toISOString(),
      lastError: ''
    });
    return { ok: true, message: '测试邮件已发出，请检查收件箱（含垃圾邮件）', messageId: info && info.messageId };
  } catch (e) {
    const message = (e && (e.code ? e.code + ' ' : '') + e.message) || '未知错误';
    updateMeta({ lastTestAt: new Date().toISOString(), lastTestResult: 'fail', lastError: String(message).slice(0, 300), lastErrorAt: new Date().toISOString() });
    return { ok: false, message: '发送失败：' + message };
  } finally {
    resetTransporter();
  }
}

/**
 * 发送 6 位验证码（注册邮箱验证 / 重置密码共用）
 * 注意：验证码邮件**不含任何链接** —— 用户拿到的就是六个数字，填回页面即可，
 * 这样在任何设备、任何 App 里都能用，不受"必须点开链接"的限制。
 */
async function sendEmailCode({ to, nickName = '', code, scene = 'verify', ttlSeconds = 300 }) {
  const isReset = scene === 'reset';
  const purpose = isReset ? '重置登录密码' : '完成邮箱验证';
  const minutes = Math.max(1, Math.round(ttlSeconds / 60));
  return sendMail({
    to,
    subject: `【华农书循环】${isReset ? '重置密码' : '邮箱验证'}验证码`,
    text:
      `${nickName ? nickName + '，你' : '你'}好：\n\n` +
      `你正在${purpose}。请在页面中输入下面的验证码：\n\n` +
      `        ${code}\n\n` +
      `验证码 ${minutes} 分钟内有效，仅限使用一次；输错 5 次会自动失效，届时需重新获取。\n` +
      `本站工作人员不会向你索要验证码，任何索取行为都属诈骗，请勿告知他人。\n\n` +
      `如果不是你本人操作，请忽略此邮件。`,
    link: ''
  });
}

/**
 * SMTP 连接自检：真正连一次服务器做握手+AUTH，把结果落到 mailMeta。
 * 服务启动时调用一次 —— 目的是让「配置到底通不通」在**启动那一刻**就有结论，
 * 而不是等第一个用户注册失败后才发现。失败不阻塞启动，只告警。
 */
async function verifyConnection() {
  const reason = readyReason();
  if (reason) {
    updateMeta({ lastVerifyAt: new Date().toISOString(), lastVerifyResult: 'skipped', lastVerifyMessage: reason });
    return { ok: false, skipped: true, message: reason };
  }
  const client = getTransporter();
  if (!client) {
    const msg = nodemailerError || '无法创建 SMTP 连接';
    updateMeta({ lastVerifyAt: new Date().toISOString(), lastVerifyResult: 'fail', lastVerifyMessage: msg });
    return { ok: false, skipped: false, message: msg };
  }
  const cfg = current();
  try {
    await client.verify();
    const msg = `SMTP 连接自检通过（${cfg.host}:${cfg.port}，${cfg.secure ? 'SSL/TLS' : 'STARTTLS/明文'}，账号 ${cfg.user}）`;
    updateMeta({ lastVerifyAt: new Date().toISOString(), lastVerifyResult: 'ok', lastVerifyMessage: msg, lastError: '' });
    console.log('[mailer] ' + msg);
    return { ok: true, skipped: false, message: msg };
  } catch (e) {
    const message = (e && (e.code ? e.code + ' ' : '') + e.message) || '未知错误';
    updateMeta({
      lastVerifyAt: new Date().toISOString(),
      lastVerifyResult: 'fail',
      lastVerifyMessage: message,
      lastError: String(message).slice(0, 300),
      lastErrorAt: new Date().toISOString()
    });
    console.error('[mailer] SMTP 连接自检失败：', message);
    resetTransporter();
    return { ok: false, skipped: false, message };
  }
}

function appBase() { return current().appBaseUrl; }
function emailVerifyUrl(token) { return `${appBase()}/#/pages/emailVerify/emailVerify?token=${encodeURIComponent(token)}`; }
function passwordResetUrl(token) { return `${appBase()}/#/pages/resetPassword/resetPassword?token=${encodeURIComponent(token)}`; }

async function sendVerificationEmail(to, token, nickName = '') {
  const link = emailVerifyUrl(token);
  return sendMail({
    to,
    subject: '【华农书循环】请验证你的邮箱',
    text: `${nickName ? nickName + '，你' : '你'}好：\n\n感谢注册华农书循环。请点击下面的链接完成邮箱验证（24 小时内有效）：\n${link}\n\n如果不是你本人操作，请忽略此邮件。`,
    link
  });
}

async function sendPasswordResetEmail(to, token, nickName = '') {
  const link = passwordResetUrl(token);
  return sendMail({
    to,
    subject: '【华农书循环】重置密码',
    text: `${nickName ? nickName + '，你' : '你'}好：\n\n我们收到了重置密码的请求。请点击下面的链接设置新密码（30 分钟内有效，仅可使用一次）：\n${link}\n\n如果不是你本人操作，请忽略此邮件，你的密码不会被改变。`,
    link
  });
}

module.exports = {
  sendMail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailCode,
  verifyConnection,
  emailVerifyUrl,
  passwordResetUrl,
  getStatus,
  saveSettings,
  exportConfig,
  sendTestMail,
  isReady,
  readyReason,
  resetTransporter,
  getAppBase: appBase,
  getDevOutbox: () => db.getSetting('devOutbox', []) || [],
  clearDevOutbox: () => db.setSetting('devOutbox', [])
};
