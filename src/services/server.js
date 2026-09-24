// 真实后端服务层：保持与 demoService 相同的调用形态 callFunction({name,data}) → {result}
// 页面调用点无需改动；新增能力（审核/锁单/运营位/管理后台）以新 name 暴露。
import * as wx from './wx';

const TOKEN_KEY = 'token';
const ADMIN_TOKEN_KEY = 'admin_token';
const CLIENT_ID_KEY = 'client_id';
const REFRESH_KEY = 'refresh_token';

export function getToken() { return wx.getStorageSync(TOKEN_KEY) || ''; }
export function setToken(token) { wx.setStorageSync(TOKEN_KEY, token); }
export function clearToken() { wx.removeStorageSync(TOKEN_KEY); }
export function getRefreshToken() { return wx.getStorageSync(REFRESH_KEY) || ''; }
export function setRefreshToken(token) { wx.setStorageSync(REFRESH_KEY, token); }
export function clearRefreshToken() { wx.removeStorageSync(REFRESH_KEY); }
export function clearSession() { clearToken(); clearRefreshToken(); }
export function getAdminToken() { return wx.getStorageSync(ADMIN_TOKEN_KEY) || ''; }
export function setAdminToken(token) { wx.setStorageSync(ADMIN_TOKEN_KEY, token); }
export function isAdminLoggedIn() { return Boolean(getAdminToken()); }

// 演示登录的持久客户端标识（等价 openid）：首次生成后永存本机
export function getClientId() {
  let id = wx.getStorageSync(CLIENT_ID_KEY);
  if (!id) {
    id = 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    wx.setStorageSync(CLIENT_ID_KEY, id);
  }
  return id;
}

async function request(method, url, { body, admin, formData } = {}) {
  const headers = {};
  const token = admin ? getAdminToken() : getToken();
  if (token) {
    // 托管网关会覆盖 Authorization 头，query token 是可靠通道，双发兜底
    headers.Authorization = 'Bearer ' + token;
    url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
  }
  if (body && !formData) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: formData || (body ? JSON.stringify(body) : undefined)
    });
  } catch (e) {
    return { success: false, code: 'NETWORK', message: '网络连接失败，请检查网络后重试' };
  }
  let json = null;
  try { json = await res.json(); } catch (e) { /* 空响应 */ }
  if (json) return json;
  return { success: false, message: `请求失败(${res.status})` };
}

// callFunction 名称 → REST 映射
const routes = {
  // 认证与资料
  login: d => request('POST', '/api/auth/login', { body: { clientId: getClientId(), nickName: d.userInfoFromWx && d.userInfoFromWx.nickName, avatarUrl: d.userInfoFromWx && d.userInfoFromWx.avatarUrl } }),
  // 账号系统（邮箱 + 密码）
  register: d => request('POST', '/api/auth/register', { body: d }),
  loginWithPassword: d => request('POST', '/api/auth/login', { body: d }),
  // 验证码是当前主路径；旧链接走 emailToken（不能用 token —— 请求层会再追加一份用户令牌，撞名）
  verifyEmail: d => (d.code
    ? request('POST', '/api/auth/verify-email', { body: { code: d.code } })
    : request('GET', '/api/auth/verify-email?emailToken=' + encodeURIComponent(d.token))),
  resendVerification: () => request('POST', '/api/auth/resend-verification', { body: {} }),
  refreshSession: d => request('POST', '/api/auth/refresh', { body: { refreshToken: d.refreshToken } }),
  logout: d => request('POST', '/api/auth/logout', { body: { refreshToken: d.refreshToken } }),
  logoutAll: () => request('POST', '/api/auth/logout-all', { body: {} }),
  listSessions: d => request('GET', '/api/auth/sessions?current=' + encodeURIComponent(d.refreshToken || '')),
  revokeSession: d => request('DELETE', '/api/auth/sessions/' + d.id),
  forgotPassword: d => request('POST', '/api/auth/forgot-password', { body: d }),
  resetPassword: d => request('POST', '/api/auth/reset-password', { body: d }),
  changePassword: d => request('PUT', '/api/users/me/password', { body: d }),
  adminLogin: d => request('POST', '/api/auth/admin/login', { body: d }),
  loginChallenge: () => request('GET', '/api/auth/login-challenge'),
  getNotifications: () => request('GET', '/api/notifications/mine'),
  readNotifications: d => request('POST', '/api/notifications/read', { body: d }),
  getUserProfile: () => request('GET', '/api/auth/me'),
  updateUserProfile: d => request('PUT', '/api/users/me', { body: d.updatedProfileData || d }),
  updateNickname: d => request('PUT', '/api/users/me/nickname', { body: d }),
  // 账号注销（需密码 + 输入「注销」二次确认）
  deleteMyAccount: d => request('POST', '/api/users/me/delete', { body: d }),
  // 身份审核
  submitVerification: d => request('POST', '/api/verification', { body: d }),
  getMyVerification: () => request('GET', '/api/verification/mine'),
  // 基础数据
  getCategories: () => request('GET', '/api/categories'),
  getBanners: () => request('GET', '/api/banners'),
  // 书籍
  getBooksForHomepage: () => request('GET', '/api/books/homepage'),
  getBooks: d => request('GET', '/api/books?' + qs(d)),
  getBookDetail: d => request('GET', '/api/books/' + d.bookId),
  getUserSellingBooks: d => request('GET', '/api/books/mine?' + qs(d)),
  publishBook: d => request('POST', '/api/books', { body: { ...(d.formData || {}), imageUrls: d.imageFileIDs || d.imageUrls || [], bookIdToEdit: d.bookIdToEdit } }),
  deletePublishedBook: d => request('POST', `/api/books/${d.bookId}/remove`),
  // 购物车
  getCartItems: () => request('GET', '/api/cart'),
  addToCart: d => request('POST', '/api/cart', { body: d }),
  deleteCartItems: d => request('POST', '/api/cart/delete', { body: d }),
  updateCartItem: () => Promise.resolve({ success: true, message: '二手书每本仅可购买一件' }),
  // 订单（确认购买=锁单）
  confirmPurchase: d => request('POST', '/api/orders', { body: d }),
  createAndPayOrder: d => request('POST', '/api/orders', { body: d }), // 旧名兼容，语义已变
  getOrders: d => request('GET', '/api/orders/mine?role=buyer&' + qs(d)),
  getSellerOrders: d => request('GET', '/api/orders/mine?role=seller&' + qs(d)),
  getOrderCounts: () => request('GET', '/api/orders/counts'),
  orderTrading: d => request('POST', `/api/orders/${d.orderId}/trading`),
  orderComplete: d => request('POST', `/api/orders/${d.orderId}/complete`),
  orderCancel: d => request('POST', `/api/orders/${d.orderId}/cancel`, { body: d }),
  confirmReceipt: d => request('POST', `/api/orders/${d.orderId}/complete`),
  shipOrderItem: d => request('POST', `/api/orders/${d.orderId}/trading`),
  // 求购
  getSeekingPosts: d => request('GET', '/api/requests?' + qs(d.userId ? { mine: 1, ...d } : d)),
  getPurchaseRequestDetail: d => request('GET', '/api/requests/' + d.requestId),
  publishOrUpdateRequest: d => request('POST', '/api/requests', { body: d }),
  deletePurchaseRequest: d => request('DELETE', '/api/requests/' + d.requestId),
  // 管理后台
  adminGetVerifications: d => request('GET', '/api/admin/verifications?' + qs(d), { admin: true }),
  adminReviewVerification: d => request('POST', `/api/admin/verifications/${d.id}/review`, { admin: true, body: d }),
  adminGetStats: () => request('GET', '/api/admin/stats', { admin: true }),
  adminGetUsers: d => request('GET', '/api/admin/users?' + qs(d || {}), { admin: true }),
  adminGetUserDetail: d => request('GET', `/api/admin/users/${d.userId}?` + qs({ revealContacts: d.revealContacts ? 1 : '' }), { admin: true }),
  adminSetUserStatus: d => request('POST', `/api/admin/users/${d.userId}/status`, { admin: true, body: d }),
  adminBlacklistUser: d => request('POST', `/api/admin/users/${d.userId}/blacklist`, { admin: true, body: d }),
  adminGetUserBooks: d => request('GET', `/api/admin/users/${d.userId}/books`, { admin: true }),
  adminDeleteUser: d => request('DELETE', `/api/admin/users/${d.userId}`, { admin: true, body: d || {} }),
  // 存储治理（容量统计 + 生命周期清理）
  adminGetStorage: () => request('GET', '/api/admin/storage', { admin: true }),
  adminRunCleanup: d => request('POST', '/api/admin/cleanup', { admin: true, body: d || {} }),
  // 邮件设置（SMTP 配置在后台维护，托管沙箱无法注入环境变量）
  adminGetMailSettings: () => request('GET', '/api/admin/mail-settings', { admin: true }),
  adminBackup: () => request('GET', '/api/admin/backup', { admin: true }),
  adminExportMailSettings: () => request('GET', '/api/admin/mail-settings/export', { admin: true }),
  adminSaveMailSettings: d => request('POST', '/api/admin/mail-settings', { admin: true, body: d }),
  adminTestMail: d => request('POST', '/api/admin/mail-settings/test', { admin: true, body: d }),
  adminGetMailOutbox: d => request('GET', '/api/admin/mail-outbox?' + qs(d || {}), { admin: true }),
  adminClearMailOutbox: () => request('POST', '/api/admin/mail-outbox/clear', { admin: true, body: {} }),
  adminGetLoginRecords: d => request('GET', '/api/admin/login-records?' + qs(d || {}), { admin: true }),
  adminDeleteLoginRecord: d => request('DELETE', `/api/admin/login-records/${d.id}`, { admin: true }),
  adminClearLoginRecords: d => request('POST', '/api/admin/login-records/clear', { admin: true, body: d || {} }),
  // 求购帖管理（用户发布的「买书」信息）
  adminGetRequests: d => request('GET', '/api/admin/requests?' + qs(d || {}), { admin: true }),
  adminDeleteRequest: d => request('DELETE', `/api/admin/requests/${d.id}`, { admin: true }),
  adminClearLogs: d => request('POST', '/api/admin/logs/clear', { admin: true, body: d || {} }),
  adminBatchOfflineBooks: d => request('POST', '/api/admin/books/batch-offline', { admin: true, body: d }),
  adminGetBooks: d => request('GET', '/api/admin/books?' + qs(d || {}), { admin: true }),
  adminSetBookStatus: d => request('POST', `/api/admin/books/${d.id}/status`, { admin: true, body: d }),
  adminDeleteBook: d => request('DELETE', `/api/admin/books/${d.id}`, { admin: true }),
  adminGetOrders: () => request('GET', '/api/admin/orders', { admin: true }),
  adminCancelOrder: d => request('POST', `/api/admin/orders/${d.orderId}/cancel`, { admin: true }),
  adminDeleteOrder: d => request('DELETE', `/api/admin/orders/${d.id}`, { admin: true }),
  adminGetBanners: () => request('GET', '/api/admin/banners', { admin: true }),
  adminCreateBanner: d => request('POST', '/api/admin/banners', { admin: true, body: d }),
  adminUpdateBanner: d => request('PUT', `/api/admin/banners/${d.id}`, { admin: true, body: d }),
  adminDeleteBanner: d => request('DELETE', `/api/admin/banners/${d.id}`, { admin: true }),
  adminGetLogs: () => request('GET', '/api/admin/logs', { admin: true })
};

function qs(obj = {}) {
  const parts = [];
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join('&');
}

async function callFunction(options) {
  const { name, data = {} } = options || {};
  const handler = routes[name];
  if (!handler) return { result: { success: false, message: `未实现的接口: ${name}` } };
  try {
    let result = await handler(data);
    // 访问令牌过期：用 refresh token 静默续期一次后重试（双令牌模型）
    if (result && result.code === 'TOKEN_EXPIRED' && getRefreshToken() && name !== 'refreshSession') {
      const refreshed = await tryRefresh();
      if (refreshed) result = await handler(data);
    }
    // 兼容 demoService 的 login 返回结构
    if (name === 'login' && result.success) {
      setToken(result.token);
      if (result.refreshToken) setRefreshToken(result.refreshToken);
      return { result: { success: true, openid: result.openid, userData: result.userData } };
    }
    // 改密等接口会吊销旧会话并下发新的令牌对。统一在这里接管，
    // 否则客户端仍攥着已失效的 refresh token，访问令牌一过期就被强制登出。
    if (result && result.success && result.token && name !== 'refreshSession') {
      setToken(result.token);
      if (result.refreshToken) setRefreshToken(result.refreshToken);
    }
    return { result };
  } catch (e) {
    console.error('[server] callFunction error:', name, e);
    return { result: { success: false, code: 'CLIENT', message: '请求处理失败，请稍后重试' } };
  }
}

let refreshing = null;
function tryRefresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await routes.refreshSession({ refreshToken: getRefreshToken() });
      if (res && res.success && res.token) {
        setToken(res.token);
        if (res.refreshToken) setRefreshToken(res.refreshToken);
        return true;
      }
    } catch (e) { /* 续期失败按未登录处理 */ }
    clearSession();
    return false;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

// dataURL → FormData 上传，type=proof 走私有存储
async function uploadFile(options = {}) {
  const { filePath, type = 'public' } = options;
  try {
    let blob;
    if (typeof filePath === 'string' && filePath.startsWith('data:')) {
      blob = await (await fetch(filePath)).blob();
    } else {
      // 已经是 URL（http 或 /uploads/...）直接回传
      return { fileID: filePath, url: filePath };
    }
    const formData = new FormData();
    formData.append('type', type);
    formData.append('file', blob, type === 'proof' ? 'proof.jpg' : 'photo.jpg');
    const result = await request('POST', '/api/upload', { formData });
    if (!result.success) throw new Error(result.message || '上传失败');
    return { fileID: result.fileID, url: result.url };
  } catch (e) {
    return { fileID: '', error: e.message, success: false, message: e.message || '图片上传失败，请重试' };
  }
}

// 私有图片（审核截图）：<img> 不带鉴权头，需 fetch → blob → objectURL
const privateImageCache = {};
export async function loadPrivateImage(url, { admin = false } = {}) {
  if (!url || !url.startsWith('/api/files/private/')) return url;
  if (privateImageCache[url]) return privateImageCache[url];
  const token = admin ? getAdminToken() : getToken();
  try {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(token ? url + sep + 'token=' + encodeURIComponent(token) : url, { headers });
    if (!res.ok) return '';
    const blob = await res.blob();
    privateImageCache[url] = URL.createObjectURL(blob);
    return privateImageCache[url];
  } catch (e) {
    return '';
  }
}

export default {
  isEnabled: () => true,
  callFunction,
  uploadFile
};
