// JSON 文件持久化数据层（单文件隔离，后续可整体替换为 MySQL/Mongo）
// 说明：Node 单进程单线程，本文件内所有「检查+修改+落盘」都在同步函数中完成，
// 不在 check 与 set 之间插入任何 await，因此锁单/审核等操作天然原子，无并发竞态。
const fs = require('fs');
const path = require('path');
const config = require('./config');

const COLLECTIONS = [
  'users', 'books', 'orders', 'cartItems', 'requests', 'verifications', 'banners', 'adminLogs', 'categories',
  'sessions', 'emailTokens', 'resetTokens', 'securityLogs', 'loginAttempts', 'notifications',
  'emailCodes'
];

// ── 修改前自动备份 ────────────────────────────────────────────────────────────
// 原则：任何「会改写数据文件」的动作（启动迁移、结构升级）之前，先复制一份原文件。
// 备份放在 server/data/auto-backups/ 下 —— 它属于运行期数据目录，
// 部署护栏会把整个 server/data 移出项目，所以不会被打包上传，也不会撑大部署包。
// 按数据文件名分目录隔离：测试库(test-*.json)的备份不会挤掉生产库(db.json)的备份
const BACKUP_DIR = path.join(
  path.dirname(config.dataFile),
  'auto-backups',
  path.basename(config.dataFile, '.json')
);
const MAX_BACKUPS = 20;

function autoBackup(reason = 'startup') {
  try {
    if (!fs.existsSync(config.dataFile)) return null;
    const bytes = fs.statSync(config.dataFile).size;
    if (!bytes) return null;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `db-${stamp}-${reason}.json`);
    fs.copyFileSync(config.dataFile, target);
    pruneBackups();
    console.log(`[db] 已自动备份：${path.basename(target)}（${bytes} 字节）`);
    return target;
  } catch (e) {
    console.error('[db] 自动备份失败（不阻塞启动）：', e.message);
    return null;
  }
}

function pruneBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('db-') && f.endsWith('.json'))
      .sort();
    // 按名字排序即时间序（文件名是 ISO 时间戳），删掉最老的
    while (files.length > MAX_BACKUPS) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (_) { /* 清理失败不影响主流程 */ }
}

let db = null;

function now() { return new Date().toISOString(); }

function seed() {
  return {
    meta: { version: 2, createdAt: now() },
    seq: {
      user: 1, book: 1, order: 1, cartItem: 1, request: 1, verification: 1, banner: 3, adminLog: 1, category: 5,
      session: 1, emailToken: 1, resetToken: 1, securityLog: 1, loginAttempt: 1, notification: 1, emailCode: 1
    },
    users: [],
    books: [],
    orders: [],
    cartItems: [],
    requests: [],
    verifications: [],
    sessions: [],
    emailTokens: [],
    resetTokens: [],
    emailCodes: [],
    securityLogs: [],
    loginAttempts: [],
    notifications: [],
    banners: [
      {
        id: 1, title: '勤读力耕，立己达人', subtitle: '狮子山下 · 校内流转 · 书友相遇',
        imageUrl: '', linkUrl: '', sort: 1, enabled: true, createdAt: now(), updatedAt: now()
      },
      {
        id: 2, title: '教材循环，让知识继续流动', subtitle: '华农二手书循环计划',
        imageUrl: '', linkUrl: '', sort: 2, enabled: true, createdAt: now(), updatedAt: now()
      }
    ],
    adminLogs: [],
    categories: [
      { id: 1, name: '计算机科学' },
      { id: 2, name: '经济管理' },
      { id: 3, name: '文学艺术' },
      { id: 4, name: '语言学习' }
    ],
    // 键值配置（如 mail）：托管沙箱无法注入环境变量，运行期可改的配置一律落这里
    settings: {}
  };
}

// 一次性迁移：数据目录从「部署包内」搬到「部署包外」后，线上第一次启动要把旧库搬过去。
// 只复制、不删除 —— 包内那份留着兜底，任何时候都能人工比对/回滚。
function migrateFromPackage() {
  if (!config.outsidePackage) return;
  if (fs.existsSync(config.dataFile)) return;
  const legacy = config.packageDataFile;
  if (!fs.existsSync(legacy)) return;
  try {
    fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
    fs.copyFileSync(legacy, config.dataFile);
    console.log(`[db] 已把历史数据迁移到部署包外：${legacy} -> ${config.dataFile}`);
  } catch (e) {
    console.error('[db] 数据迁移失败（继续使用包内文件）：', e.message);
  }
}

function load() {
  migrateFromPackage();
  try {
    if (fs.existsSync(config.dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));
      if (parsed && Array.isArray(parsed.users)) {
        db = parsed;
        // ★ 先备份再迁移：任何结构升级都不允许在「没有退路」的状态下改写用户数据
        autoBackup('before-migrate');
        migrate();
        return;
      }
    }
  } catch (e) {
    console.error('[db] 数据文件损坏，备份后重建：', e.message);
    try { fs.copyFileSync(config.dataFile, config.dataFile + '.broken-' + Date.now()); } catch (_) { /* ignore */ }
  }
  db = seed();
  persist();
}

// 向前进化：老数据文件缺少新集合/字段时补齐，保证升级不丢数据
function migrate() {
  let dirty = false;
  for (const name of COLLECTIONS) {
    if (!Array.isArray(db[name])) { db[name] = []; dirty = true; }
  }
  db.seq = db.seq || {};
  for (const key of ['user', 'book', 'order', 'cartItem', 'request', 'verification', 'banner', 'adminLog', 'category', 'session', 'emailToken', 'resetToken', 'securityLog', 'loginAttempt', 'notification', 'emailCode']) {
    if (typeof db.seq[key] !== 'number') { db.seq[key] = 1; dirty = true; }
  }
  // settings 是键值对象（非数组集合），不能进 COLLECTIONS，否则会被强行改成数组
  if (!db.settings || typeof db.settings !== 'object' || Array.isArray(db.settings)) { db.settings = {}; dirty = true; }
  // 风控/审计字段（新增字段一律可空/默认值，保证存量用户兼容）
  for (const user of db.users) {
    if (user.frozen === undefined) { user.frozen = false; dirty = true; }
    if (user.loginCount === undefined) { user.loginCount = 0; dirty = true; }
    if (user.lastLoginIp === undefined) { user.lastLoginIp = ''; dirty = true; }
    if (user.registerIp === undefined) { user.registerIp = ''; dirty = true; }
    if (user.restrictPublishUntil === undefined) { user.restrictPublishUntil = null; dirty = true; }
    if (user.restrictBuyUntil === undefined) { user.restrictBuyUntil = null; dirty = true; }
    if (user.blacklisted === undefined) { user.blacklisted = false; dirty = true; }
  }
  for (const user of db.users) {
    if (user.passwordHash === undefined) { user.passwordHash = ''; dirty = true; }
    if (user.email === undefined) { user.email = ''; dirty = true; }
    if (user.emailVerified === undefined) { user.emailVerified = false; dirty = true; }
    if (user.failedLogins === undefined) { user.failedLogins = 0; dirty = true; }
    if (user.lockedUntil === undefined) { user.lockedUntil = null; dirty = true; }
  }
  if (dirty) persist();
}

function persist() {
  const dir = path.dirname(config.dataFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = config.dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, config.dataFile); // 原子替换，避免写一半断电
}

load();

module.exports = {
  get: name => db[name],
  collections: COLLECTIONS,
  now,
  persist,
  // 全量深拷贝快照：后台一键备份用。含 seq/settings/meta，
  // 所以导出文件本身就能直接写回 config.dataFile 完成还原。
  dump() { return JSON.parse(JSON.stringify(db)); },
  nextId(name) {
    const key = name.replace(/s$/, '');
    db.seq[key] = (db.seq[key] || 1);
    return db.seq[key]++;
  },
  findById(name, id) {
    return db[name].find(item => String(item.id) === String(id));
  },
  insert(name, item) {
    db[name].unshift(item);
    persist();
    return item;
  },
  remove(name, id) {
    const index = db[name].findIndex(item => String(item.id) === String(id));
    if (index >= 0) { db[name].splice(index, 1); persist(); return true; }
    return false;
  },
  // 键值配置读写（settings 集合）
  getSetting(key, fallback = null) {
    const value = db.settings ? db.settings[key] : undefined;
    return value === undefined ? fallback : value;
  },
  setSetting(key, value) {
    if (!db.settings) db.settings = {};
    db.settings[key] = value;
    persist();
    return value;
  },
  // 手动触发一次备份（后台「立即备份」按钮 / 危险操作前调用）
  autoBackup,
  listBackups() {
    try {
      return fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('db-') && f.endsWith('.json'))
        .sort().reverse()
        .map(f => {
          const stat = fs.statSync(path.join(BACKUP_DIR, f));
          return { name: f, bytes: stat.size, at: stat.mtime.toISOString() };
        });
    } catch (_) { return []; }
  },
  backupDir: BACKUP_DIR
};
