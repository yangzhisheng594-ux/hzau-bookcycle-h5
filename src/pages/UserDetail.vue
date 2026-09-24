<template>
  <view class="page-container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">用户详情</text></view>

    <view class="empty" v-if="loading && !profile">加载中…</view>
    <view class="empty" v-if="!loading && !profile">加载失败，请返回重试</view>

    <template v-if="profile">
      <!-- 头部：头像 / 昵称 / 状态 -->
      <view class="hero">
        <img class="hero-avatar" :src="profile.basic.avatar_url || '/images/demo-avatar.png'" />
        <view class="hero-copy">
          <text class="hero-name">{{ profile.basic.nick_name }}</text>
          <text class="hero-sub">{{ profile.basic.email || ('ID ' + profile.basic.user_id) }}</text>
          <view class="hero-tags">
            <text class="mini-tag" :class="'vs-' + profile.verify.verifyStatus">{{ statusText(profile.verify.verifyStatus) }}</text>
            <text class="mini-tag danger" v-if="profile.risk.frozen">已冻结</text>
            <text class="mini-tag danger" v-if="profile.risk.blacklisted">黑名单</text>
            <text class="mini-tag warn" v-if="profile.risk.locked">已锁定</text>
            <text class="mini-tag warn" v-if="profile.risk.restrictPublishUntil">限发布</text>
            <text class="mini-tag warn" v-if="profile.risk.restrictBuyUntil">限购买</text>
          </view>
        </view>
      </view>

      <!-- 登录画像：回答「谁登录了 / 有没有登上来」 -->
      <view class="section">
        <view class="sec-title">登录与设备</view>
        <view class="kv"><text class="k">最后登录时间</text><text class="v">{{ profile.basic.lastLoginAt ? formatTime(profile.basic.lastLoginAt) : '从未登录' }}</text></view>
        <view class="kv"><text class="k">最后登录 IP</text><text class="v">{{ profile.basic.lastLoginIp || '—' }}</text></view>
        <view class="kv"><text class="k">注册 IP</text><text class="v">{{ profile.basic.registerIp || '—' }}</text></view>
        <view class="kv"><text class="k">累计登录次数</text><text class="v">{{ profile.basic.loginCount }}</text></view>
        <view class="kv"><text class="k">当前在线设备</text><text class="v">{{ profile.basic.deviceCount }}</text></view>
        <view class="kv"><text class="k">连续失败次数</text><text class="v">{{ profile.risk.failedLogins }}</text></view>
        <view class="kv" v-if="profile.risk.lastFailedLoginAt"><text class="k">最近失败时间</text><text class="v">{{ formatTime(profile.risk.lastFailedLoginAt) }}</text></view>
        <view class="kv"><text class="k">注册时间</text><text class="v">{{ formatTime(profile.basic.createdAt) }}</text></view>
      </view>

      <!-- 联系方式（脱敏 + 查看审计） -->
      <view class="section">
        <view class="sec-title-row">
          <text class="sec-title">联系方式</text>
          <text class="sec-action" v-if="!profile.contact.revealed" @click="revealContacts">查看完整</text>
          <text class="sec-action muted" v-else>已记录本次查看</text>
        </view>
        <view class="kv"><text class="k">微信号</text><text class="v">{{ profile.contact.wechat || '未填写' }}</text></view>
        <view class="kv"><text class="k">手机号</text><text class="v">{{ profile.contact.phone || '未填写' }}</text></view>
        <view class="kv"><text class="k">默认面交点</text><text class="v">{{ profile.contact.meetPoint || '未设置' }}</text></view>
        <view class="kv"><text class="k">可见范围</text><text class="v">{{ profile.contact.visible }}</text></view>
      </view>

      <!-- 交易画像 -->
      <view class="section">
        <view class="sec-title">交易画像</view>
        <view class="stat-row">
          <view class="stat-mini"><text class="stat-mini-num">{{ profile.trade.bookCount }}</text><text class="stat-mini-label">发布</text></view>
          <view class="stat-mini"><text class="stat-mini-num">{{ profile.trade.soldCount }}</text><text class="stat-mini-label">已售出</text></view>
          <view class="stat-mini"><text class="stat-mini-num">{{ profile.trade.orderCount }}</text><text class="stat-mini-label">订单</text></view>
          <view class="stat-mini"><text class="stat-mini-num">{{ profile.trade.cancelledCount }}</text><text class="stat-mini-label">取消</text></view>
        </view>
        <view class="kv"><text class="k">在售 / 已下架</text><text class="v">{{ profile.trade.onSaleCount }} / {{ profile.trade.removedCount }}</text></view>
        <view class="kv"><text class="k">买家单 / 卖家单</text><text class="v">{{ profile.trade.buyOrderCount }} / {{ profile.trade.sellOrderCount }}</text></view>
        <view class="kv"><text class="k">已完成订单</text><text class="v">{{ profile.trade.completedCount }}</text></view>
        <view class="kv"><text class="k">累计成交额</text><text class="v">¥{{ profile.trade.totalAmount }}</text></view>
        <view class="kv"><text class="k">求购帖</text><text class="v">{{ profile.trade.requestCount }}</text></view>
      </view>

      <!-- 认证与风控 -->
      <view class="section">
        <view class="sec-title">认证与风控</view>
        <view class="kv"><text class="k">信用分</text><text class="v">{{ profile.risk.creditScore }}</text></view>
        <view class="kv"><text class="k">违规次数</text><text class="v">{{ profile.risk.violationCount }}</text></view>
        <view class="kv"><text class="k">累计处置次数</text><text class="v">{{ profile.risk.dispositionCount }}</text></view>
        <view class="kv" v-if="profile.risk.frozenReason"><text class="k">冻结原因</text><text class="v danger-text">{{ profile.risk.frozenReason }}</text></view>
        <view class="kv" v-if="profile.risk.blacklistReason"><text class="k">拉黑原因</text><text class="v danger-text">{{ profile.risk.blacklistReason }}</text></view>
        <view class="kv" v-if="profile.risk.restrictPublishUntil"><text class="k">限制发布至</text><text class="v">{{ formatTime(profile.risk.restrictPublishUntil) }}</text></view>
        <view class="kv" v-if="profile.risk.restrictBuyUntil"><text class="k">限制购买至</text><text class="v">{{ formatTime(profile.risk.restrictBuyUntil) }}</text></view>
        <view class="kv" v-if="profile.verify.rejectReason"><text class="k">认证拒绝原因</text><text class="v">{{ profile.verify.rejectReason }}</text></view>
        <img class="proof" v-if="profile.verify.proofImage" :src="profile.verify.proofImage" @click="previewProof" />
      </view>

      <!-- 最近登录记录 -->
      <view class="section">
        <view class="sec-title">最近登录记录</view>
        <view class="log-line" v-for="a in profile.loginAttempts" :key="a.id">
          <text class="log-dot" :class="a.success ? 'dot-ok' : 'dot-bad'"></text>
          <text class="log-text">{{ formatTime(a.createdAt) }} · {{ a.success ? '登录成功' : '登录失败' }} · {{ reasonText(a.reason) }} · {{ a.ip }}</text>
        </view>
        <view class="empty small" v-if="!profile.loginAttempts.length">暂无登录记录</view>
      </view>

      <!-- 发布记录 -->
      <view class="section">
        <view class="sec-title">发布记录（{{ profile.books.length }}）</view>
        <view class="book-line" v-for="b in profile.books" :key="b.id">
          <text class="book-name">{{ b.title || '（无标题）' }}</text>
          <text class="mini-tag" :class="'bs-' + b.status">{{ bookStatusText(b.status) }}</text>
        </view>
        <view class="empty small" v-if="!profile.books.length">暂无发布</view>
      </view>

      <!-- 订单记录 -->
      <view class="section">
        <view class="sec-title">订单记录（{{ profile.orders.length }}）</view>
        <view class="log-line" v-for="o in profile.orders" :key="o.orderId">
          <text class="log-text">{{ o.orderNumber }} · {{ o.title }} · ¥{{ o.displayPrice }} · {{ o.statusText }}</text>
        </view>
        <view class="empty small" v-if="!profile.orders.length">暂无订单</view>
      </view>

      <!-- 处置操作区 -->
      <view class="section danger-zone">
        <view class="sec-title">账号处置</view>
        <view class="dispose-grid">
          <button v-if="!profile.risk.frozen" class="btn-danger" @click="openDispose('freeze')">冻结账号</button>
          <button v-else class="btn-approve" @click="openDispose('unfreeze')">解冻账号</button>
          <button class="btn-warn" @click="openDispose('restrict_publish')">限制发布</button>
          <button class="btn-warn" @click="openDispose('restrict_buy')">限制购买</button>
          <button class="btn-plain" @click="openDispose('clear_restriction')">解除限制</button>
          <button class="btn-plain" @click="openDispose('batch_offline')">下架全部商品</button>
          <button v-if="!profile.risk.blacklisted" class="btn-danger" @click="openDispose('blacklist')">加入黑名单</button>
          <button v-else class="btn-approve" @click="openDispose('blacklist_remove')">移出黑名单</button>
        </view>
        <text class="dispose-hint">所有处置均需填写原因，并写入处置日志、通知该用户。</text>

        <!-- 删除账号：不可逆，与「处置」分开，避免与冻结/限制混为一谈 -->
        <view class="purge-zone" v-if="!profile.basic.deleted">
          <button class="btn-purge" @click="openDispose('delete_user')">删除该用户</button>
          <text class="purge-note" v-if="profile.basic.hasTrade">该用户存在历史订单。删除会清空其邮箱、密码、昵称、企业微信截图与 IP，并移除其书籍、购物车、会话、令牌、通知、登录日志；账号本身匿名保留，以免买家查不到订单。</text>
          <text class="purge-note" v-else>该用户没有任何交易记录。删除会连同账号与全部归属数据一并彻底移除，不可恢复。</text>
        </view>
        <view class="purge-zone" v-else>
          <text class="purge-note">该账号已注销。邮箱、密码、昵称等可识别信息均已清空，仅保留匿名占位以维系历史订单。</text>
        </view>
      </view>
    </template>

    <!-- 处置原因弹窗 -->
    <view class="modal-mask" v-if="disposeForm" @click="disposeForm = null">
      <view class="modal" @click.stop>
        <view class="modal-title">{{ disposeForm.title }}</view>
        <view class="modal-desc" v-if="disposeForm.desc">{{ disposeForm.desc }}</view>
        <view class="reason-chips">
          <text v-for="r in disposeForm.presets" :key="r" class="reason-chip" :class="{ active: disposeForm.reason === r }" @click="disposeForm.reason = r">{{ r }}</text>
        </view>
        <view class="day-row" v-if="disposeForm.needDays">
          <text v-for="d in [1, 3, 7, 30]" :key="d" class="reason-chip" :class="{ active: disposeForm.days === d }" @click="disposeForm.days = d">{{ d }} 天</text>
        </view>
        <input class="modal-input" v-model="disposeForm.reason" placeholder="处置原因（必填）" />
        <view class="modal-actions">
          <button class="btn-plain" @click="disposeForm = null">取消</button>
          <button class="btn-danger" @click="confirmDispose">确认执行</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';
import { isAdminLoggedIn } from '../services/server';

const route = useRoute();
const userId = route.query.userId || route.query.user_id;
const profile = ref(null);
const loading = ref(false);
const disposeForm = ref(null);

const DISPOSE_PRESETS = {
  freeze: { title: '冻结账号', desc: '冻结后该用户无法登录，且所有已登录设备立即下线（数据保留，可解冻）', presets: ['涉嫌诈骗', '多次违规发布', '恶意骚扰他人', '身份造假'], needDays: false },
  unfreeze: { title: '解冻账号', desc: '解冻后该用户可重新登录并恢复操作', presets: ['申诉通过', '误判已核实', '已完成整改'], needDays: false },
  restrict_publish: { title: '限制发布', desc: '限制期内该用户无法发布新书与求购', presets: ['重复刷屏发布', '发布违规内容', '商品信息虚假'], needDays: true },
  restrict_buy: { title: '限制购买', desc: '限制期内该用户无法锁单购买', presets: ['恶意锁单不取', '多次取消订单', '骚扰卖家'], needDays: true },
  clear_restriction: { title: '解除全部限制', desc: '同时解除限制发布与限制购买', presets: ['申诉通过', '限制期已到', '误判'], needDays: false },
  batch_offline: { title: '下架该用户全部在架商品', desc: '仅下架当前在售商品，交易中的商品不受影响', presets: ['批量违规内容', '账号异常排查', '应本人要求'], needDays: false },
  blacklist: { title: '加入黑名单', desc: '拉黑后会同时冻结账号，并禁止该邮箱再次注册', presets: ['诈骗', '严重违规', '身份造假'], needDays: false },
  blacklist_remove: { title: '移出黑名单', desc: '移出后该邮箱可再次注册', presets: ['误判', '申诉通过'], needDays: false },
  delete_user: {
    title: '删除该用户',
    desc: '不可恢复。将清除该用户发布的书籍、购物车、会话、令牌、通知与登录日志，并清空邮箱、密码、昵称、企业微信截图与 IP。若该用户存在历史订单，账号会匿名保留，以免买家查不到订单。',
    presets: ['用户本人申请注销', '长期不用的僵尸号', '违规账号清理', '测试数据清理'],
    needDays: false
  }
};

onMounted(() => {
  if (!isAdminLoggedIn()) {
    wx.showToast({ title: '请先登录管理后台', icon: 'none' });
    wx.navigateTo({ url: '/pages/admin/admin' });
    return;
  }
  load();
});

async function load(reveal = false) {
  if (!userId) { wx.showToast({ title: '缺少用户 ID', icon: 'none' }); return; }
  loading.value = true;
  const res = await wx.cloud.callFunction({ name: 'adminGetUserDetail', data: { userId, revealContacts: reveal } });
  loading.value = false;
  if (res.result && res.result.success) {
    profile.value = res.result.data;
  } else {
    wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' });
  }
}

// 明文查看联系方式：后端会写审计日志，此处二次确认
function revealContacts() {
  wx.showModal({
    title: '查看完整联系方式',
    content: '本次查看会被记录到审计日志（管理员 / 时间 / 目标用户）。',
    confirmText: '确认查看',
    success: res => { if (res.confirm) load(true); }
  });
}

async function call(name, data) {
  const res = await wx.cloud.callFunction({ name, data });
  if (!res.result || !res.result.success) {
    wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
    return null;
  }
  return res.result;
}

function openDispose(key) {
  const cfg = DISPOSE_PRESETS[key];
  if (!cfg) return;
  disposeForm.value = { key, title: cfg.title, desc: cfg.desc, presets: cfg.presets, needDays: cfg.needDays, reason: '', days: 7 };
}

async function confirmDispose() {
  const form = disposeForm.value;
  if (!form) return;
  const reason = String(form.reason || '').trim();
  if (!reason) { wx.showToast({ title: '请填写处置原因', icon: 'none' }); return; }

  let result;
  if (form.key === 'delete_user') {
    result = await call('adminDeleteUser', { userId, reason });
  } else if (form.key === 'batch_offline') {
    result = await call('adminBatchOfflineBooks', { userId, reason });
  } else if (form.key === 'blacklist') {
    result = await call('adminBlacklistUser', { userId, reason });
  } else if (form.key === 'blacklist_remove') {
    result = await call('adminBlacklistUser', { userId, reason, remove: true });
  } else {
    result = await call('adminSetUserStatus', { userId, action: form.key, reason, days: form.days });
  }
  if (result) {
    if (form.key === 'delete_user') {
      wx.showToast({ title: result.message || '已删除', icon: 'none', duration: 3000 });
      disposeForm.value = null;
      // 该用户可能已被彻底删除，详情页不再有意义 → 退回列表并让列表刷新
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    wx.showToast({ title: result.message || '已执行', icon: 'success' });
    disposeForm.value = null;
    load(Boolean(profile.value && profile.value.contact.revealed));
  }
}

function statusText(status) {
  return { none: '未认证', pending: '待审核', approved: '已认证', rejected: '已拒绝' }[status] || status;
}
function bookStatusText(status) {
  return { available: '可购买', locked: '已锁定', trading: '交易中', sold: '已售出', removed: '已下架' }[status] || status;
}
function reasonText(reason) {
  return {
    success: '登录成功', user_not_found: '账号不存在', wrong_password: '密码错误',
    no_password: '账号未设置密码', account_locked: '账号已锁定', account_frozen: '账号已冻结',
    ip_rate_limited: '触发频率限制', challenge_required: '需要人机校验'
  }[reason] || reason;
}
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function previewProof() {
  if (profile.value && profile.value.verify.proofImage) {
    wx.previewImage({ current: profile.value.verify.proofImage, urls: [profile.value.verify.proofImage] });
  }
}
function goBack() { wx.navigateBack(); }
</script>

<style scoped>
.page-container { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(60 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }

.hero { display: flex; align-items: center; margin-bottom: calc(16 * var(--rpx)); padding: calc(26 * var(--rpx)); border-radius: calc(22 * var(--rpx)); background: linear-gradient(135deg, #166a3f 0%, #2c7d4e 100%); }
.hero-avatar { width: calc(96 * var(--rpx)); height: calc(96 * var(--rpx)); margin-right: calc(18 * var(--rpx)); border: calc(2 * var(--rpx)) solid rgba(255,255,255,.5); border-radius: 50%; background: #eef3ee; object-fit: cover; flex: none; }
.hero-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.hero-name { color: #fff; font-size: calc(32 * var(--rpx)); font-weight: 750; }
.hero-sub { margin-top: calc(6 * var(--rpx)); color: #d8e4da; font-size: calc(21 * var(--rpx)); }
.hero-tags { display: flex; flex-wrap: wrap; gap: calc(8 * var(--rpx)); margin-top: calc(12 * var(--rpx)); }

.section { margin-bottom: calc(16 * var(--rpx)); padding: calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(20 * var(--rpx)); background: #fff; }
.sec-title { color: #166a3f; font-size: calc(26 * var(--rpx)); font-weight: 750; }
.sec-title-row { display: flex; align-items: center; justify-content: space-between; }
.sec-action { padding: calc(6 * var(--rpx)) calc(16 * var(--rpx)); border: calc(1 * var(--rpx)) solid #166a3f; border-radius: calc(16 * var(--rpx)); color: #166a3f; font-size: calc(20 * var(--rpx)); font-weight: 650; cursor: pointer; }
.sec-action.muted { border-color: #dfe9e1; color: #9daaa1; font-weight: 500; cursor: default; }
.kv { display: flex; align-items: flex-start; justify-content: space-between; gap: calc(20 * var(--rpx)); margin-top: calc(14 * var(--rpx)); }
.k { color: #8d98a8; font-size: calc(22 * var(--rpx)); flex: none; }
.v { color: #29443a; font-size: calc(22 * var(--rpx)); font-weight: 600; text-align: right; word-break: break-all; }
.v.danger-text { color: #b35353; }

.mini-tag { padding: calc(4 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(10 * var(--rpx)); font-size: calc(19 * var(--rpx)); font-weight: 650; white-space: nowrap; }
.vs-pending { background: #fdf6e3; color: #c98f1b; }
.vs-approved { background: #e8f3ec; color: #166a3f; }
.vs-rejected, .vs-none { background: #f4f4f2; color: #a3a39e; }
.mini-tag.danger { background: #fdf0f0; color: #b35353; }
.mini-tag.warn { background: #fdf6e3; color: #c98f1b; }
.bs-available { background: #e8f3ec; color: #166a3f; }
.bs-locked, .bs-trading { background: #fdf6e3; color: #c98f1b; }
.bs-sold, .bs-removed { background: #f4f4f2; color: #a3a39e; }

.stat-row { display: flex; gap: calc(12 * var(--rpx)); margin-top: calc(16 * var(--rpx)); }
.stat-mini { display: flex; flex: 1; flex-direction: column; align-items: center; padding: calc(16 * var(--rpx)) 0; border-radius: calc(14 * var(--rpx)); background: #f7faf7; }
.stat-mini-num { color: #166a3f; font-size: calc(34 * var(--rpx)); font-weight: 800; }
.stat-mini-label { margin-top: calc(4 * var(--rpx)); color: #8d98a8; font-size: calc(19 * var(--rpx)); }

.proof { width: 100%; max-height: calc(400 * var(--rpx)); margin-top: calc(16 * var(--rpx)); border: calc(1 * var(--rpx)) solid #f0eeea; border-radius: calc(12 * var(--rpx)); object-fit: contain; cursor: pointer; }
.log-line { display: flex; align-items: flex-start; gap: calc(10 * var(--rpx)); margin-top: calc(12 * var(--rpx)); }
.log-dot { width: calc(14 * var(--rpx)); height: calc(14 * var(--rpx)); margin-top: calc(8 * var(--rpx)); border-radius: 50%; flex: none; }
.dot-ok { background: #166a3f; }
.dot-bad { background: #b35353; }
.log-text { color: #62786c; font-size: calc(21 * var(--rpx)); line-height: 1.6; }
.book-line { display: flex; align-items: center; justify-content: space-between; gap: calc(12 * var(--rpx)); margin-top: calc(12 * var(--rpx)); }
.book-name { color: #29443a; font-size: calc(22 * var(--rpx)); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.danger-zone { border-color: #f0dede; background: #fffbfb; }
.dispose-grid { display: flex; flex-wrap: wrap; gap: calc(12 * var(--rpx)); margin-top: calc(18 * var(--rpx)); }
button { display: flex; align-items: center; justify-content: center; height: calc(64 * var(--rpx)); min-width: calc(190 * var(--rpx)); margin: 0; padding: 0 calc(20 * var(--rpx)); border: 0; border-radius: calc(14 * var(--rpx)); font-size: calc(22 * var(--rpx)); font-weight: 600; cursor: pointer; }
.btn-danger { background: #b35353; color: #fff; }
.btn-warn { background: #fdf6e3; color: #b3760f; }
.btn-approve { background: #166a3f; color: #fff; }
.btn-plain { border: calc(1 * var(--rpx)) solid #dfe9e1; background: #fff; color: #687d71; }
.dispose-hint { display: block; margin-top: calc(16 * var(--rpx)); color: #9daaa1; font-size: calc(20 * var(--rpx)); line-height: 1.6; }
/* 删除账号：与「处置」视觉分开，它是不可逆的终局操作 */
.purge-zone { margin-top: calc(20 * var(--rpx)); padding-top: calc(18 * var(--rpx)); border-top: calc(1 * var(--rpx)) dashed #ecd9d9; }
.btn-purge { display: flex !important; align-items: center; justify-content: center; width: 100% !important; height: calc(78 * var(--rpx)); margin: 0 !important; border: calc(1 * var(--rpx)) solid #b35353; border-radius: calc(15 * var(--rpx)); background: #fff !important; color: #b35353; font-size: calc(26 * var(--rpx)); font-weight: 700; line-height: calc(78 * var(--rpx)); box-sizing: border-box; }
.purge-note { display: block; margin-top: calc(12 * var(--rpx)); color: #9daaa1; font-size: calc(20 * var(--rpx)); line-height: 1.6; }

.empty { padding: calc(60 * var(--rpx)) 0; color: #9daaa1; font-size: calc(25 * var(--rpx)); text-align: center; }
.empty.small { padding: calc(24 * var(--rpx)) 0; font-size: calc(22 * var(--rpx)); }

.modal-mask { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: calc(40 * var(--rpx)); background: rgba(30,42,36,.5); box-sizing: border-box; }
.modal { width: 100%; max-width: calc(620 * var(--rpx)); max-height: 82vh; overflow-y: auto; padding: calc(30 * var(--rpx)); border-radius: calc(22 * var(--rpx)); background: #fff; }
.modal-title { color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.modal-desc { margin-top: calc(10 * var(--rpx)); color: #8d98a8; font-size: calc(21 * var(--rpx)); line-height: 1.6; }
.reason-chips, .day-row { display: flex; flex-wrap: wrap; gap: calc(12 * var(--rpx)); margin-top: calc(18 * var(--rpx)); }
.reason-chip { padding: calc(10 * var(--rpx)) calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(22 * var(--rpx)); color: #687d71; font-size: calc(22 * var(--rpx)); cursor: pointer; }
.reason-chip.active { border-color: #b35353; background: #fdf0f0; color: #b35353; }
.modal-input { width: 100%; height: calc(76 * var(--rpx)); margin-top: calc(18 * var(--rpx)); padding: 0 calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(12 * var(--rpx)); font-size: calc(24 * var(--rpx)); box-sizing: border-box; }
.modal-actions { display: flex; justify-content: flex-end; gap: calc(14 * var(--rpx)); margin-top: calc(24 * var(--rpx)); }
</style>
