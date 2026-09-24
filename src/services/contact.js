// 运营/客服联系方式（管理员微信）
//
// ⚠️ 不做硬编码：这个值每个部署都不一样，写进源码后一旦公开仓库就会连联系方式一起泄露。
// 由服务端下发首页时注入 `window.__SITE__`（见 server/index.js 的 sendAppHtml），
// 值来自环境变量 ADMIN_WECHAT 或 server/site-config.json（已 gitignore）。
export const ADMIN_WECHAT = String(
  (typeof window !== 'undefined' && window.__SITE__ && window.__SITE__.adminWechat) || ''
).trim();

// 界面上要显示时用这个：未配置时给出可读文案，而不是留空
export const ADMIN_WECHAT_TEXT = ADMIN_WECHAT || '暂未配置';

// 复制管理员微信号并提示
export async function copyAdminWechat(wx) {
  if (!ADMIN_WECHAT) {
    wx.showToast({ title: '管理员尚未配置联系方式', icon: 'none', duration: 2000 });
    return false;
  }
  const okFlag = await wx.setClipboardData({ data: ADMIN_WECHAT });
  if (okFlag) {
    wx.showToast({ title: '微信号已复制：' + ADMIN_WECHAT, icon: 'none', duration: 2200 });
  } else {
    wx.showModal({ title: '管理员微信', content: ADMIN_WECHAT, showCancel: false, confirmText: '知道了' });
  }
  return true;
}
