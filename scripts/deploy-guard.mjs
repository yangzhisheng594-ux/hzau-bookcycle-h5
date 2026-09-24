// 部署护栏：把「运行期数据」在读盘打包前移出项目目录，部署后原样搬回。
//
// 为什么必须有这个步骤：
//   workbuddy_sites_deploy 只硬编码排除 node_modules / .git / 构建产物，
//   **不支持任何 ignore 文件**（.gitignore 对它无效）。而它的上传是「覆盖同名文件、不删多余文件」，
//   所以 server/data/db.json 一旦存在于项目里，就会被原样推到线上，覆盖掉线上的用户库。
//   实测事故：线上 db.json 被替换成本地开发库（字节完全一致），用户账号被清掉、后台配置丢失。
//   反过来，只要文件不打包进去，线上那份就会被完整保留（upserts only，不会删除）。
//
// 用法：
//   node scripts/deploy-guard.mjs prep      # 部署前：移出数据
//   node scripts/deploy-guard.mjs restore   # 部署后：搬回数据
//   node scripts/deploy-guard.mjs status    # 查看当前状态（部署前必看）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 备份必须放在项目目录**之外**，否则照样会被打进部署包
const HOLD = path.join(ROOT, '..', '_runtime-at-deploy');

// 只处理运行期目录：库文件、上传文件、邮件外发日志、测试用数据文件
const TARGETS = ['server/data', 'server/uploads'];

const exists = p => { try { return fs.existsSync(p); } catch { return false; } };
const size = p => { try { return fs.statSync(p).size; } catch { return 0; } };

// ── SMTP 固化检查 ────────────────────────────────────────────────────────────
// 为什么：SMTP 授权码是**不可再生凭据**（QQ 邮箱只在生成那一刻显示明文，之后谁都看不到）。
// 曾经连丢三次：配置只落在线上 db.json → 被部署覆盖 → 用户被迫重新生成 → 再配 → 再丢。
// 所以部署前必须确认：随包发布的 server/mail-config.json 里的账号+授权码是完整的。
// 否则部署上去的是一个「没有凭据」的配置，线上退回 dev 模式，用户又被要求重来一遍。
const MAIL_CONFIG = path.join(ROOT, 'server', 'mail-config.json');
// 密钥留存档在**项目目录之外**（不会被打进部署包）：用户给凭据时先抄一份到这儿，
// prep 会自动从这里回读，省得每次都翻聊天记录 / 再问用户。
const SECRETS = path.join(ROOT, '..', '_secrets', 'mail-credentials.md');

function readSecretFromVault() {
  if (!exists(SECRETS)) return null;
  const md = fs.readFileSync(SECRETS, 'utf8');
  // 只认结构化表格行，不做全文正则猜测（避免把备注、示例误当授权码）
  const row = md.match(/^\|\s*授权码（16\s*位）\s*\|\s*([^\|]+?)\s*\|/m);
  if (!row) return null;
  const v = row[1].replace(/\s+/g, '');
  if (/待填|待用户|待补|TODO|—|-$/i.test(row[1])) return null;
  return /^[A-Za-z0-9]{16}$/.test(v) ? v : null;   // QQ SMTP 授权码 = 16 位字母数字
}

function checkMailConfig({ fix = false } = {}) {
  if (!exists(MAIL_CONFIG)) return { ok: true, skipped: '无 server/mail-config.json' };
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(MAIL_CONFIG, 'utf8')); }
  catch { return { ok: false, msg: 'server/mail-config.json 不是合法 JSON' }; }

  if (!cfg.enabled) return { ok: true, skipped: '邮件功能未启用' };
  if (!cfg.user) {
    // 连账号都没有 = 用户本来就不需要发信，只提醒不拦
    return { ok: true, warn: '邮件已启用但未填发信账号 → 线上将走 dev 模式（写 outbox，不真发）' };
  }
  if (cfg.pass) return { ok: true, skipped: '账号+授权码已固化' };

  // 半配置：有账号没授权码。先试着从留存档自动回填
  const vault = readSecretFromVault();
  if (vault && fix) {
    cfg.pass = vault;
    fs.writeFileSync(MAIL_CONFIG, JSON.stringify(cfg, null, 2) + '\n');
    return { ok: true, autoFill: true };
  }
  if (vault) return { ok: true, hasVault: true };

  return {
    ok: false,
    msg: [
      `server/mail-config.json 里 user=${cfg.user} 但 pass 为空`,
      '',
      '直接部署会把「没有凭据」的配置推上去 → 线上退回 dev 模式 → 用户又要去 QQ 邮箱',
      '重新生成授权码（该码只在生成那一刻可见，丢了就不可逆）。这种情况已经发生过三次。',
      '',
      '修法（二选一）：',
      '  1) 把 16 位授权码写进 server/mail-config.json 的 pass 字段；',
      `  2) 或抄进密钥留存档 _secrets/mail-credentials.md 的「授权码（16 位）」行，下次 prep 会自动回填。`,
      '',
      '确认不需要发信就先关掉：把 enabled 改成 false 再部署。'
    ].join('\n')
  };
}

function listDir(dir) {
  try { return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile()); }
  catch { return []; }
}

function heldDirs(t) {
  // 备份区可能有带时间戳的历史备份（上次忘记 restore），一并列出来提醒
  const base = t.replace(/[\\/]/g, '__');
  try { return fs.readdirSync(HOLD).filter(f => f === base || f.startsWith(base + '.')); }
  catch { return []; }
}

function status() {
  const lines = [];
  for (const t of TARGETS) {
    const src = path.join(ROOT, t);
    const inRepo = exists(src) ? listDir(src) : [];
    const heldFiles = heldDirs(t).reduce((n, d) => n + listDir(path.join(HOLD, d)).length, 0);
    lines.push({
      target: t,
      项目内文件: inRepo.length,
      备份区文件: heldFiles,
      已移出: !exists(src) && heldFiles > 0,
      历史备份: heldDirs(t).filter(d => d !== t.replace(/[\\/]/g, '__')).length
    });
  }
  return lines;
}

function move(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
}

function prep() {
  // 先做凭据检查再动文件：失败要早失败，别把数据移走了才发现问题
  const mc = checkMailConfig({ fix: true });
  if (mc.autoFill) console.log('✓ 已从密钥留存档自动回填 SMTP 授权码（_secrets/mail-credentials.md）');
  if (mc.warn) console.warn('⚠ ' + mc.warn);
  if (!mc.ok) {
    console.error('\n✗✗ 部署中止 —— SMTP 配置未固化 ✗✗\n');
    console.error(mc.msg + '\n');
    process.exit(2);
  }

  fs.mkdirSync(HOLD, { recursive: true });
  const moved = [];
  for (const t of TARGETS) {
    const src = path.join(ROOT, t);
    if (!exists(src)) continue;
    if (!listDir(src).length) { console.log(`· 跳过 ${t}（空目录）`); continue; }
    const dest = path.join(HOLD, t.replace(/[\\/]/g, '__'));
    if (exists(dest)) {
      // 不覆盖既有备份：可能是上次没 restore，先让用户处理
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const alt = `${dest}.${stamp}`;
      console.warn(`⚠ 备份区已存在 ${path.basename(dest)}，改存为 ${path.basename(alt)}（请检查上次是否忘记 restore）`);
      move(src, alt);
      moved.push(`${t} → ${alt}`);
      continue;
    }
    move(src, dest);
    moved.push(`${t} → ${dest}`);
  }
  if (!moved.length) console.log('· 项目内没有待移出的运行期数据（干净，可直接部署）');
  else moved.forEach(m => console.log('✓ ' + m));
  console.log(`\n现在可以安全部署了（线上 server/data 不会被覆盖）。部署完成后务必执行 restore。`);
}

function restore() {
  const done = [];
  for (const t of TARGETS) {
    const dest = path.join(ROOT, t);
    const held = path.join(HOLD, t.replace(/[\\/]/g, '__'));
    if (!exists(held)) { console.log(`· ${t} 备份区没有内容，跳过`); continue; }
    if (exists(dest) && listDir(dest).length) {
      // 部署期间本地又跑过服务、重新生成了数据：保留新生成的那份，不直接覆盖
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const alt = `${dest}.fresh-${stamp}`;
      move(dest, alt);
      console.warn(`⚠ ${t} 在部署期间被重新生成，已移到 ${path.basename(alt)} 保留`);
    } else if (exists(dest)) {
      fs.rmdirSync(dest); // 空目录，直接让位
    }
    move(held, dest);
    done.push(`${t} 已恢复（${listDir(dest).length} 个文件）`);
  }
  done.forEach(m => console.log('✓ ' + m));
  try {
    if (!fs.readdirSync(HOLD).length) fs.rmdirSync(HOLD);
  } catch { /* ignore */ }
  console.log('\n本地数据已还原。');
}

const cmd = process.argv[2] || 'status';
if (cmd === 'prep') prep();
else if (cmd === 'restore') restore();
else {
  console.table(status());
  const mc = checkMailConfig();
  if (mc.ok && mc.skipped) console.log(`\n· SMTP：${mc.skipped}`);
  if (mc.warn) console.warn(`\n⚠ SMTP：${mc.warn}`);
  if (mc.hasVault) console.log('\n· SMTP：留存档里有授权码，prep 时会自动回填');
  if (!mc.ok) console.error('\n✗ SMTP：' + mc.msg.split('\n')[0] + ' → 详见 prep 输出');

  const dataDir = path.join(ROOT, 'server', 'data');
  const files = listDir(dataDir);
  if (files.length) {
    console.log(`\n⚠ 项目内还有运行期数据：${files.join(', ')}`);
    console.log('  直接部署会把线上库覆盖成本地这份 → 先执行 node scripts/deploy-guard.mjs prep');
    process.exit(2);
  }
  console.log('\n✓ 项目内无运行期数据，可安全部署');
}
