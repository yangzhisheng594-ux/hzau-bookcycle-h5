// 交易联系方式的「默认带出」
// ------------------------------------------------------------------
// 痛点：每次发布书籍/求购都要重新敲一遍微信、QQ、手机、面交地点。
// 做法：把个人资料里的联系方式预填到发布表单；用户在这里改过的值再回写资料。
// 即「填一次，以后都不用重复输入；这次不想填，下次补上也会带出来」。
//
// 注意：书籍/求购详情页给买家看的联系方式，服务端始终从「用户资料」实时读取
// （见 server/index.js 的 contactBlock），所以这里只需保证资料本身是最新的，
// 不需要在每本书上再存一份联系方式副本——那样反而会出现联系方式过期不一致。
import * as wx from './wx';
import { globalData, notifyPagesLoginStateChanged, refreshUserProfile } from '../store';

// 与 server/index.js 的 CONTACT_FIELD_RULES / 资料字段一一对应
export const TRADE_CONTACT_FIELDS = ['contactWechat', 'contactQq', 'contactPhone', 'defaultMeetPoint'];

export const CONTACT_VISIBILITY_TEXT = {
  public: '所有登录用户可见',
  order_only: '仅交易对方可见',
  private: '不公开'
};

export function emptyTradeContact() {
  return { contactWechat: '', contactQq: '', contactPhone: '', defaultMeetPoint: '' };
}

export function pickTradeContact(userInfo) {
  const u = userInfo || {};
  return {
    contactWechat: u.contactWechat || '',
    contactQq: u.contactQq || '',
    contactPhone: u.contactPhone || '',
    defaultMeetPoint: u.defaultMeetPoint || ''
  };
}

// 拉服务端最新资料再回填，避免本地缓存里的旧资料把服务端新值覆盖掉
export async function loadTradeContact() {
  try {
    await refreshUserProfile();
  } catch (e) {
    // 刷新失败就用本地缓存兜底，不能因为一次网络抖动让人没法发布
  }
  const userInfo = globalData.userInfo || wx.getStorageSync('userInfo') || {};
  return {
    fields: pickTradeContact(userInfo),
    contactVisible: userInfo.contactVisible || 'order_only'
  };
}

// 给表单用的一句话提示：买家到底看不看得到你的联系方式
export function tradeVisibilityHint(contactVisible) {
  if (contactVisible === 'private') {
    return '你当前设置为「不公开」——买家看不到任何联系方式，只能通过站内下单沟通。可在「我的 → 编辑资料」中修改。';
  }
  if (contactVisible === 'public') {
    return '你当前设置为「所有登录用户可见」——书籍/求购详情页会直接展示以上信息。';
  }
  return '你当前设置为「仅交易对方可见」——对方确认下单后，才能看到以上联系方式。';
}

// 前端先拦一道，规则与服务端保持一致（宽松优先，只为少一次无效请求）
export function validateTradeContact(fields) {
  const wechat = String(fields.contactWechat || '').trim();
  const qq = String(fields.contactQq || '').trim();
  const phone = String(fields.contactPhone || '').trim();
  const meetPoint = String(fields.defaultMeetPoint || '').trim();
  if (wechat && !/^[A-Za-z0-9_-]{2,20}$/.test(wechat)) return '微信号应为 2-20 位字母、数字、下划线或减号';
  if (qq && !/^\d{5,12}$/.test(qq)) return 'QQ 号应为 5-12 位数字';
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return '手机号格式不正确';
  if (meetPoint.length > 60) return '常用交易地址最长 60 个字符';
  return '';
}

// 只把「用户真的改过」的字段写回资料：没动的字段不提交，避免误清空
export async function syncTradeContact(current, baseline) {
  const payload = {};
  for (const key of TRADE_CONTACT_FIELDS) {
    const now = String(current[key] || '').trim();
    const was = String((baseline || {})[key] || '').trim();
    if (now !== was) payload[key] = now;
  }
  if (!Object.keys(payload).length) return { changed: false };

  const res = await wx.cloud.callFunction({ name: 'updateUserProfile', data: payload });
  if (!res.result || !res.result.success) {
    throw new Error((res.result && res.result.message) || '交易信息保存失败');
  }
  const saved = res.result.data || {};
  const merged = {
    ...(wx.getStorageSync('userInfo') || {}),
    ...saved,
    ...pickTradeContact({ ...current })
  };
  globalData.userInfo = merged;
  if (res.result.profileCompleteness) globalData.profileCompleteness = res.result.profileCompleteness;
  wx.setStorageSync('userInfo', merged);
  notifyPagesLoginStateChanged(true, merged);
  return { changed: true };
}
