// 全局状态（等价 app.js 的 App({ globalData }) 与登录流程）
// 数据层已切换为真实后端；登录=持久 clientId 静默注册/登录，verifyStatus 驱动身份体系。
import { reactive } from 'vue';
import * as wx from './services/wx';
import serverService, { isAdminLoggedIn, getToken, getRefreshToken, clearSession } from './services/server';

export const globalData = reactive({
  userInfo: null,
  isUserLoggedIn: null,
  verifyStatus: 'none', // none | pending | approved | rejected
  // 资料完整度由服务端计算下发（规则只有一份，避免前端各算各的）
  profileCompleteness: null,
  isAdmin: false,
  sellListNeedRefresh: false,
  requestListNeedRefresh: false,
  cartNeedRefresh: false,
  orderListNeedRefresh: false,
  profileNeedRefresh: false,
  isDemoMode: false,
  pageLoginCallbacks: {}
});

let isLoggingIn = false;

export function registerLoginCallback(pageName, callback) {
  if (pageName && typeof callback === 'function') {
    globalData.pageLoginCallbacks[pageName] = callback;
    if (globalData.isUserLoggedIn !== null) {
      callback(globalData.isUserLoggedIn, globalData.userInfo);
    }
  }
}

export function unregisterLoginCallback(pageName) {
  if (pageName && globalData.pageLoginCallbacks[pageName]) {
    delete globalData.pageLoginCallbacks[pageName];
  }
}

export function notifyPagesLoginStateChanged(isLoggedIn, userInfo) {
  for (const pageName in globalData.pageLoginCallbacks) {
    if (typeof globalData.pageLoginCallbacks[pageName] === 'function') {
      globalData.pageLoginCallbacks[pageName](isLoggedIn, userInfo);
    }
  }
}

// 用户数据签名：用于判断是否真的变化，避免无意义广播引发连锁刷新
function userSignature(userData) {
  if (!userData) return 'null';
  return [userData.user_id, userData.nick_name, userData.avatar_url, userData.verifyStatus, userData.rejectReason].join('|');
}

function applyUser(userData) {
  const prevSig = globalData.isUserLoggedIn === null ? '' : userSignature(globalData.userInfo);
  const nextSig = userSignature(userData);
  globalData.userInfo = userData;
  globalData.isUserLoggedIn = Boolean(userData && userData.user_id);
  globalData.verifyStatus = (userData && userData.verifyStatus) || 'none';
  globalData.isAdmin = isAdminLoggedIn();
  // 未登录时清掉完整度，避免退出后仍显示上一个账号的进度
  if (!globalData.isUserLoggedIn) globalData.profileCompleteness = null;
  // 数据无变化不广播：否则「我的」页刷新身份→广播→自己回调→再刷新…会死循环，
  // 并连带所有 tab 页反复清空重载（页面加载状态来回切换的根因）
  if (prevSig === nextSig && globalData.isUserLoggedIn !== null) return;
  notifyPagesLoginStateChanged(globalData.isUserLoggedIn, userData);
}

export function checkUserLoginState() {
  // 有令牌才恢复会话；没有令牌就是游客，不再静默注册（真实账号系统由用户主动注册/登录）
  if (!getToken()) {
    applyUser(null);
    return;
  }
  const userInfo = wx.getStorageSync('userInfo');
  if (userInfo && userInfo.user_id) {
    applyUser(userInfo);
    // 后台静默刷新一次（昵称/审核状态可能已被管理员变更）
    refreshUserProfile();
  } else {
    refreshUserProfile();
  }
}

// 退出登录：通知服务端吊销刷新令牌，本地清除令牌与缓存
export async function logout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) await wx.cloud.callFunction({ name: 'logout', data: { refreshToken } });
  } catch (e) { /* 服务端吊销失败也清本地 */ }
  clearSession();
  wx.removeStorageSync('userInfo');
  wx.removeStorageSync('openid');
  applyUser(null);
}

export function refreshUserProfile() {
  const prevStatus = globalData.verifyStatus;
  return wx.cloud.callFunction({ name: 'getUserProfile' }).then(res => {
    if (res.result && res.result.success && res.result.data) {
      wx.setStorageSync('userInfo', res.result.data);
      applyUser(res.result.data);
      globalData.profileCompleteness = res.result.profileCompleteness || null;
      // 审核结果主动感知：每次状态跳变（pending→rejected / pending→approved）立即告知一次。
      // 用过 lastNotifiedStatus 做「只通知一次」去重，避免 45s 轮询反复弹窗。
      const newStatus = globalData.verifyStatus;
      if ((newStatus === 'rejected' || newStatus === 'approved') && newStatus !== lastNotifiedStatus) {
        lastNotifiedStatus = newStatus;
        if (newStatus === 'rejected') {
          const reason = (res.result.data.rejectReason || '管理员未填写具体原因').trim();
          wx.showModal({
            title: '身份认证未通过',
            content: `拒绝原因：${reason}。你可以补充材料后重新提交，如有疑问请联系管理员（微信见认证页）。`,
            confirmText: '去重新提交',
            cancelText: '知道了',
            success: r => { if (r.confirm) wx.navigateTo({ url: '/pages/verify/verify' }); }
          });
        } else if (newStatus === 'approved') {
          wx.showToast({ title: '身份认证已通过 ✅', icon: 'success', duration: 2200 });
        }
      }
      return res.result.data;
    }
    if (res.result && res.result.code === 'UNAUTHORIZED') {
      // token 失效：重新静默登录
      return doCloudLogin(null, true);
    }
    return null;
  });
}

// 应用级状态监听：管理员在后台「通过/拒绝」后，用户无需手动刷新即可收到通知。
// 触发点：① 页面重新获得焦点（从后台切回/切回标签页）；② 每 45s 兜底轮询（登录态下）。
// 因 applyUser 已做签名比对（无变化不广播），轮询不会引发连锁刷新。
let statusWatcherStarted = false;
let lastNotifiedStatus = null;
export function startStatusWatch() {
  if (statusWatcherStarted) return;
  statusWatcherStarted = true;
  const tick = () => { if (globalData.isUserLoggedIn) refreshUserProfile().catch(() => {}); };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', tick);
  }
  setInterval(tick, 45 * 1000);
}

export function doCloudLogin(userInfoFromWx = null, isSilent = false) {
  if (!isSilent && !isLoggingIn) {
    wx.showLoading({ title: '登录中...' });
    isLoggingIn = true;
  }
  return wx.cloud.callFunction({
    name: 'login',
    data: { userInfoFromWx }
  }).then(res => {
    if (!isSilent) { wx.hideLoading(); isLoggingIn = false; }
    if (res.result && res.result.success && res.result.userData && res.result.userData.user_id) {
      wx.setStorageSync('userInfo', res.result.userData);
      if (res.result.openid) wx.setStorageSync('openid', res.result.openid);
      applyUser(res.result.userData);
      if (!isSilent) wx.showToast({ title: '登录成功', icon: 'success', duration: 1000 });
      return true;
    }
    applyUser(null);
    wx.removeStorageSync('userInfo');
    if (!isSilent) wx.showToast({ title: (res.result && res.result.message) || '登录失败', icon: 'none' });
    return false;
  }).catch(err => {
    if (!isSilent) { wx.hideLoading(); isLoggingIn = false; }
    applyUser(null);
    wx.removeStorageSync('userInfo');
    console.error('[App] login error:', err);
    if (!isSilent) wx.showToast({ title: '登录请求失败', icon: 'none' });
    return false;
  });
}

// 需要「已认证」的操作前置检查：先向服务器刷新一次身份状态（管理员可能刚审核通过），
// 再用最新状态判断；未认证 → 引导去认证页；审核中 → 提示等待
export async function requireApproved(actionName = '继续操作') {
  if (!globalData.isUserLoggedIn) {
    wx.showToast({ title: '登录异常，请重新进入', icon: 'none' });
    return false;
  }
  try { await refreshUserProfile(); } catch (e) { /* 刷新失败用本地缓存状态兜底 */ }
  if (globalData.verifyStatus === 'approved') return true;
  if (globalData.verifyStatus === 'pending') {
    wx.showModal({ title: '审核中', content: '身份资料已提交，管理员审核通过后即可' + actionName + '。', showCancel: false, confirmText: '我知道了' });
    return false;
  }
  const content = globalData.verifyStatus === 'rejected'
    ? `你的身份认证未通过（${globalData.userInfo && globalData.userInfo.rejectReason || '资料不符'}），请重新提交后再${actionName}。`
    : `发布与购买需要先完成企业微信身份认证，认证通过后即可${actionName}。`;
  wx.showModal({
    title: '需要身份认证',
    content,
    confirmText: '去认证',
    cancelText: '再看看'
  }).then(res => {
    if (res.confirm) wx.navigateTo({ url: '/pages/verify/verify' });
  });
  return false;
}

// 兜底导出（保持原引用兼容）
export { serverService };
