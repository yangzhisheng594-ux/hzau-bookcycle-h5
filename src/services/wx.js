// wx API H5 适配层：在浏览器环境复刻小程序运行时能力，保证页面逻辑与原小程序等价。
// 覆盖：showToast / showModal / showLoading / hideLoading / cloud.callFunction / cloud.uploadFile
//       setStorageSync / getStorageSync / removeStorageSync / navigateTo / switchTab / navigateBack
//       chooseMedia / previewImage / setNavigationBarTitle
import { compressImageFile } from '../utils/image';

let routerRef = null;
export function bindRouter(router) { routerRef = router; }

/* ---------- 轻提示 ---------- */
let toastTimer = null;
export function showToast({ title = '', icon = 'none', duration = 1500 } = {}) {
  removeToast();
  const el = document.createElement('div');
  el.className = 'wx-toast';
  el.dataset.role = 'wx-toast';
  const iconHtml = icon === 'success'
    ? '<span class="wx-toast-icon wx-toast-success">✓</span>'
    : icon === 'error'
      ? '<span class="wx-toast-icon wx-toast-error">✕</span>'
      : '';
  el.innerHTML = `${iconHtml}<span class="wx-toast-text"></span>`;
  el.querySelector('.wx-toast-text').textContent = title;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  toastTimer = setTimeout(removeToast, duration);
}
function removeToast() {
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  document.querySelectorAll('[data-role="wx-toast"]').forEach(n => n.remove());
}

/* ---------- 加载中 ---------- */
let loadingCount = 0;
export function showLoading({ title = '加载中...', mask = false } = {}) {
  loadingCount += 1;
  let el = document.querySelector('[data-role="wx-loading"]');
  if (!el) {
    el = document.createElement('div');
    el.className = 'wx-loading';
    el.dataset.role = 'wx-loading';
    el.innerHTML = '<div class="wx-loading-box"><span class="wx-loading-spinner"></span><span class="wx-loading-text"></span></div>';
    document.body.appendChild(el);
  }
  el.querySelector('.wx-loading-text').textContent = title;
  el.classList.toggle('with-mask', Boolean(mask));
}
export function hideLoading() {
  loadingCount = Math.max(loadingCount - 1, 0);
  if (loadingCount === 0) {
    const el = document.querySelector('[data-role="wx-loading"]');
    if (el) el.remove();
  }
}

/* ---------- 模态框（Promise 化，resolve {confirm, cancel}） ---------- */
export function showModal({ title = '', content = '', confirmText = '确定', cancelText = '取消', showCancel = true, success } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'wx-modal-mask';
    wrap.dataset.role = 'wx-modal';
    wrap.innerHTML = `
      <div class="wx-modal">
        <div class="wx-modal-title"></div>
        <div class="wx-modal-content"></div>
        <div class="wx-modal-actions">
          ${showCancel ? '<button class="wx-modal-btn cancel" data-act="cancel"></button>' : ''}
          <button class="wx-modal-btn confirm" data-act="confirm"></button>
        </div>
      </div>`;
    wrap.querySelector('.wx-modal-title').textContent = title;
    wrap.querySelector('.wx-modal-content').textContent = content;
    const confirmBtn = wrap.querySelector('[data-act="confirm"]');
    confirmBtn.textContent = confirmText;
    if (showCancel) wrap.querySelector('[data-act="cancel"]').textContent = cancelText;
    const done = result => {
      wrap.remove();
      if (typeof success === 'function') success(result);
      resolve(result);
    };
    confirmBtn.addEventListener('click', () => done({ confirm: true, cancel: false }));
    if (showCancel) wrap.querySelector('[data-act="cancel"]').addEventListener('click', () => done({ confirm: false, cancel: true }));
    document.body.appendChild(wrap);
  });
}

/* ---------- 云能力（真实后端：HTTP API，保持调用形态不变） ---------- */
import serverService from './server';
export const cloud = {
  callFunction: options => serverService.callFunction(options),
  uploadFile: options => serverService.uploadFile(options)
};

/* ---------- 本地存储 ---------- */
export function setStorageSync(key, value) {
  try { localStorage.setItem('wx_' + key, JSON.stringify(value)); } catch (e) { /* quota */ }
}
export function getStorageSync(key) {
  try {
    const raw = localStorage.getItem('wx_' + key);
    return raw === null ? '' : JSON.parse(raw);
  } catch (e) { return ''; }
}
export function removeStorageSync(key) { localStorage.removeItem('wx_' + key); }

/* ---------- 路由导航（路径与小程序保持一致） ---------- */
export function navigateTo({ url, success, fail } = {}) {
  if (!routerRef) return;
  const { path, query } = parseUrl(url);
  routerRef.push({ path, query }).then(() => {
    if (typeof success === 'function') success({ eventChannel: getEventChannel(path) });
  }).catch(err => { if (typeof fail === 'function') fail(err); });
}
export function switchTab({ url } = {}) {
  if (!routerRef) return;
  const { path, query } = parseUrl(url);
  routerRef.push({ path, query });
}
export function navigateBack() {
  if (!routerRef) return;
  routerRef.back();
}
function parseUrl(url) {
  const [path, qs] = String(url || '').split('?');
  const query = {};
  if (qs) qs.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { path, query };
}

/* ---------- EventChannel 等价物：cart/bookDetail → checkout 传参 ---------- */
const eventChannels = {};
export function getEventChannel(key) {
  if (!eventChannels[key]) {
    const listeners = {};
    eventChannels[key] = {
      emit(event, payload) { (listeners[event] || []).forEach(fn => fn(payload)); },
      on(event, fn) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(fn);
        // 若数据先于监听到达（navigate 后才注册），立即补发
        if (pendingEvents[key] && pendingEvents[key][event]) {
          fn(pendingEvents[key][event]);
          delete pendingEvents[key][event];
        }
      }
    };
  }
  return eventChannels[key];
}
const pendingEvents = {};
export function emitCheckoutData(items) {
  const key = '/pages/checkout/checkout';
  const channel = getEventChannel(key);
  channel.emit('acceptDataFromCartPage', { data: items });
  if (!pendingEvents[key]) pendingEvents[key] = {};
  pendingEvents[key]['acceptDataFromCartPage'] = { data: items };
}

/* ---------- 媒体选择 / 图片预览 ---------- */
// wx.chooseMedia 等价：返回 { tempFiles: [{ tempFilePath }] }，H5 中 tempFilePath 为压缩后的 dataURL
export function chooseMedia({ count = 9 } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = count > 1;
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []).slice(0, count);
      if (!files.length) { reject({ errMsg: 'chooseMedia:fail cancel' }); return; }
      try {
        const tempFiles = await Promise.all(files.map(file => compressImageFile(file).then(dataUrl => ({ tempFilePath: dataUrl }))));
        resolve({ tempFiles });
      } catch (err) {
        reject({ errMsg: 'chooseMedia:fail ' + (err && err.message) });
      }
    });
    // 部分浏览器取消选择不触发任何事件，用 cancel 事件兜底
    input.addEventListener('cancel', () => reject({ errMsg: 'chooseMedia:fail cancel' }));
    input.click();
  });
}

// wx.previewImage 等价：全屏轻量预览
export function previewImage({ current, urls = [] } = {}) {
  const list = urls.length ? urls : [current];
  const wrap = document.createElement('div');
  wrap.className = 'wx-preview-mask';
  wrap.innerHTML = list.map(u => `<img src="${u}" alt="">`).join('');
  wrap.addEventListener('click', () => wrap.remove());
  document.body.appendChild(wrap);
}

// wx.setClipboardData 等价：复制文本（带 http 降级路径）
export async function setClipboardData({ data = '' } = {}) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(data);
      return true;
    }
  } catch (e) { /* 走降级 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = data;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const okFlag = document.execCommand('copy');
    ta.remove();
    return okFlag;
  } catch (e) {
    return false;
  }
}

/* ---------- 标题 ---------- */
export function setNavigationBarTitle({ title } = {}) {
  if (title) document.title = title;
}

/* ---------- 页面标题映射（等价 wx.setNavigationBarTitle 的常见调用） ---------- */
export const PAGE_TITLES = {
  '/pages/index/index': '华农书循环',
  '/pages/sell/sell': '华农书循环',
  '/pages/request/request': '我的求购',
  '/pages/cart/cart': '购物车',
  '/pages/profile/profile': '个人中心',
  '/pages/bookDetail/bookDetail': '图书详情',
  '/pages/publish/publish': '发布书籍',
  '/pages/publishRequest/publishRequest': '发布求购',
  '/pages/checkout/checkout': '确认订单',
  '/pages/editProfile/editProfile': '编辑资料',
  '/pages/changePassword/changePassword': '修改密码',
  '/pages/settings/settings': '设置',
  '/pages/orderList/orderList': '我的订单',
  '/pages/search/search': '搜索书籍',
  '/pages/soldOrders/soldOrders': '售出订单',
  '/pages/logs/logs': '日志',
  '/pages/verify/verify': '身份认证',
  '/pages/auth/auth': '登录',
  '/pages/resetPassword/resetPassword': '重置密码',
  '/pages/emailVerify/emailVerify': '邮箱验证',
  '/pages/admin/admin': '管理后台'
};
