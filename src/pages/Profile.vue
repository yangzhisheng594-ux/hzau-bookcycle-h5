<template>
  <view class="container">
    <view class="page-nav"><text class="page-nav-title">个人中心</text></view>

    <!-- ========== 头部：头像 / 昵称 / 认证。整卡可点，直接进入个人资料编辑 ========== -->
    <view class="profile-header" @click="onHeaderTap">
      <img class="avatar" :src="displayAvatar" />
      <view class="profile-copy">
        <text class="username">{{ displayName }}</text>
        <text class="member-note">{{ verifyNote }}</text>
      </view>
      <view class="profile-action" v-if="isLoggedIn"><text class="action-arrow">›</text></view>
      <view class="profile-action" v-else><text>注册 / 登录</text><text class="action-arrow">›</text></view>
    </view>

    <!-- 邮箱未验证：不验证就无法发布与购买，属于必须显性提示的状态 -->
    <view class="verify-banner verify-email" v-if="isLoggedIn && hasPassword && !emailVerified" @click="resendVerify">
      <view class="verify-banner-left">
        <text class="verify-banner-title">邮箱未验证</text>
        <text class="verify-banner-sub">点击重新发送验证邮件，验证后即可发布与购买</text>
      </view>
      <text class="verify-banner-arrow">去验证 ›</text>
    </view>

    <!-- ========== 入口一：个人资料（明细都在里面，本页只放入口） ========== -->
    <view class="entry-list" v-if="isLoggedIn">
      <view class="entry-row" @click="navigateToEditProfile">
        <view class="entry-main">
          <text class="entry-title">个人资料</text>
          <text class="entry-sub">昵称、头像、联系方式、常用交易地址、个人简介</text>
        </view>
        <text class="entry-arrow">›</text>
      </view>
    </view>

    <!-- ========== 我的订单：三个状态宫格，售出订单收进标题右侧 ========== -->
    <view class="order-section" v-if="isLoggedIn">
      <view class="section-header">
        <text class="section-title" @click="navigateToOrderList('all')">我的订单</text>
        <view class="view-all-orders" @click="navigateToSoldOrders"><text>售出订单</text></view>
      </view>
      <view class="order-status-tabs">
        <view class="tab-item" @click="navigateToOrderList('locked')"><view class="tab-container payment"><img class="status-icon" src="/images/order-status/payment.png" /><text class="tab-label">待面交</text><text class="tab-count" v-if="orderCounts.locked">{{ orderCounts.locked }}</text></view></view>
        <view class="tab-item" @click="navigateToOrderList('trading')"><view class="tab-container shipment"><img class="status-icon" src="/images/order-status/handoff.png" /><text class="tab-label">交易中</text><text class="tab-count" v-if="orderCounts.trading">{{ orderCounts.trading }}</text></view></view>
        <view class="tab-item" @click="navigateToOrderList('completed')"><view class="tab-container receipt"><img class="status-icon" src="/images/order-status/inspect.png" /><text class="tab-label">已完成</text><text class="tab-count" v-if="orderCounts.completed">{{ orderCounts.completed }}</text></view></view>
      </view>
    </view>

    <!-- ========== 入口二：设置（账号安全 / 隐私 / 分享 / 退出 / 注销 都在里面） ========== -->
    <view class="entry-list" v-if="isLoggedIn">
      <view class="entry-row" @click="navigateToSettings">
        <view class="entry-main">
          <text class="entry-title">设置</text>
          <text class="entry-sub">登录账号、修改密码、身份认证、联系方式公开范围</text>
        </view>
        <text class="entry-arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onUnmounted } from 'vue';
import * as wx from '../services/wx';
import { globalData, registerLoginCallback, unregisterLoginCallback, refreshUserProfile } from '../store';

defineOptions({ name: 'ProfilePage' });

const userInfo = ref({});
const isLoggedIn = ref(false);
const orderCounts = ref({ locked: 0, trading: 0, completed: 0 });

const verifyStatus = computed(() => globalData.verifyStatus || 'none');
const email = computed(() => (globalData.userInfo && globalData.userInfo.email) || '');
const emailVerified = computed(() => Boolean(globalData.userInfo && globalData.userInfo.emailVerified));
const hasPassword = computed(() => Boolean(globalData.userInfo && globalData.userInfo.hasPassword !== undefined ? globalData.userInfo.hasPassword : (globalData.userInfo && globalData.userInfo.email)));

const displayName = computed(() => userInfo.value.nickName || userInfo.value.nick_name || '华农书友');
const displayAvatar = computed(() => userInfo.value.avatarUrl || userInfo.value.avatar_url || '/images/demo-avatar.png');

// 认证状态只显示状态本身，不再拖「· 华农二手书循环计划」这条每次都重复的后缀
const verifyNote = computed(() => {
  switch (verifyStatus.value) {
    case 'approved': return '已认证';
    case 'pending': return '审核中';
    case 'rejected': return '认证未通过';
    default: return '未认证';
  }
});

// 头部整卡可点：已登录进个人资料编辑，未登录进注册/登录
function onHeaderTap() {
  if (isLoggedIn.value) navigateToEditProfile();
  else handleLoginTap();
}

function navigateToSoldOrders() {
  if (!isLoggedIn.value) { handleLoginTap(); return; }
  wx.navigateTo({ url: '/pages/soldOrders/soldOrders' });
}

onMounted(() => {
  registerLoginCallback('profilePage', () => checkLoginStatusAndLoadData());
  checkLoginStatusAndLoadData();
});

onActivated(() => { checkLoginStatusAndLoadData(); });
onUnmounted(() => unregisterLoginCallback('profilePage'));

let profileDataLoading = false; // 重入锁：刷新身份会广播登录状态，回调又是本函数，不锁会自激循环

async function checkLoginStatusAndLoadData() {
  if (profileDataLoading) return;
  profileDataLoading = true;
  try {
    await doCheckLoginStatusAndLoadData();
  } finally {
    profileDataLoading = false;
  }
}

async function doCheckLoginStatusAndLoadData() {
  const loggedIn = globalData.isUserLoggedIn;
  const userInfoFromGlobal = globalData.userInfo;

  isLoggedIn.value = Boolean(loggedIn);
  userInfo.value = userInfoFromGlobal && userInfoFromGlobal.user_id
    ? { nickName: userInfoFromGlobal.nick_name, avatarUrl: userInfoFromGlobal.avatar_url, ...userInfoFromGlobal }
    : {};

  if (loggedIn) {
    // 每次进入「我的」都静默刷新一次：审核结果、联系方式、资料完整度都可能已被改动
    try {
      const fresh = await refreshUserProfile();
      if (fresh && fresh.user_id) {
        userInfo.value = { ...fresh, nickName: fresh.nick_name, avatarUrl: fresh.avatar_url };
      }
    } catch (e) { /* 刷新失败用本地缓存兜底 */ }
    if (!userInfoFromGlobal || !userInfoFromGlobal.nick_name) {
      await loadUserProfileFromServer();
    }
    loadOrderCounts();
  } else {
    userInfo.value = {};
    orderCounts.value = { locked: 0, trading: 0, completed: 0 };
  }
}

async function loadUserProfileFromServer() {
  if (!globalData.isUserLoggedIn || !globalData.userInfo || !globalData.userInfo.open_id) return;
  wx.showLoading({ title: '加载信息...' });
  try {
    const res = await wx.cloud.callFunction({ name: 'getUserProfile' });
    wx.hideLoading();
    if (res.result && res.result.success && res.result.data) {
      const serverUserInfo = res.result.data;
      userInfo.value = { nickName: serverUserInfo.nick_name, avatarUrl: serverUserInfo.avatar_url, ...serverUserInfo };
      globalData.userInfo = serverUserInfo;
      wx.setStorageSync('userInfo', serverUserInfo);
    }
  } catch (err) {
    wx.hideLoading();
    console.error('调用 getUserProfile 云函数失败 (MySQL):', err);
  }
}

async function loadOrderCounts() {
  try {
    const res = await wx.cloud.callFunction({ name: 'getOrderCounts' });
    if (res.result && res.result.success) orderCounts.value = res.result.data;
  } catch (error) {
    console.warn('[ProfilePage] Failed to load order counts:', error);
  }
}

function handleLoginTap() {
  if (isLoggedIn.value) {
    wx.showToast({ title: '您已登录', icon: 'none' });
    return;
  }
  // 真实账号系统：跳转到注册/登录页，不再静默造号
  wx.navigateTo({ url: '/pages/auth/auth' });
}

function navigateToEditProfile() { wx.navigateTo({ url: '/pages/editProfile/editProfile' }); }
function navigateToSettings() { wx.navigateTo({ url: '/pages/settings/settings' }); }
function navigateToOrderList(status) {
  wx.navigateTo({ url: `/pages/orderList/orderList?status=${status || 'all'}` });
}

// 重新发送验证邮件
async function resendVerify() {
  wx.showLoading({ title: '发送中…', mask: true });
  try {
    const res = await wx.cloud.callFunction({ name: 'resendVerification', data: {} });
    wx.hideLoading();
    const link = res.result && res.result.devVerifyLink;
    wx.showModal({
      title: link ? '需要验证邮箱（测试环境）' : '验证邮件已发送',
      content: link
        ? '当前未配置 SMTP 邮件服务。点击「立即验证」可直接完成验证；生产环境配置 SMTP 后将自动发送真实邮件。'
        : '验证邮件已发送，请前往邮箱查收并点击验证链接。',
      confirmText: link ? '立即验证' : '知道了',
      showCancel: Boolean(link),
      cancelText: link ? '复制链接' : '关闭',
      success: r => {
        if (r.confirm && link) window.location.href = link;
        else if (r.cancel && link) copyText(link);
      }
    });
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: '发送失败，请稍后重试', icon: 'none' });
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    wx.showToast({ title: '链接已复制', icon: 'success' });
  } catch (e) { wx.showToast({ title: '复制失败，请手动复制', icon: 'none' }); }
}
</script>

<style scoped>
.container { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(32 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.page-nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; text-align: center; }
.profile-header { display: flex; align-items: center; padding: calc(27 * var(--rpx)) calc(24 * var(--rpx)); border-radius: calc(25 * var(--rpx)); background: linear-gradient(135deg, #166a3f, #35855a); box-shadow: 0 calc(14 * var(--rpx)) calc(26 * var(--rpx)) rgba(22, 106, 63,.15); }
.avatar { width: calc(90 * var(--rpx)); height: calc(90 * var(--rpx)); margin-right: calc(18 * var(--rpx)); border: calc(4 * var(--rpx)) solid rgba(255,255,255,.9); border-radius: 50%; background: #fff; box-shadow: 0 calc(5 * var(--rpx)) calc(12 * var(--rpx)) rgba(0,0,0,.16); object-fit: cover; cursor: pointer; }
.profile-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.username { overflow: hidden; color: #fff; font-size: calc(34 * var(--rpx)); font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.member-note { margin-top: calc(9 * var(--rpx)); color: #d2dfd5; font-size: calc(21 * var(--rpx)); letter-spacing: calc(.5 * var(--rpx)); }
.profile-action { display: flex; align-items: center; justify-content: center; height: calc(56 * var(--rpx)); min-width: calc(56 * var(--rpx)); margin-left: calc(12 * var(--rpx)); padding: 0 calc(12 * var(--rpx)); border: calc(1 * var(--rpx)) solid rgba(255,255,255,.28); border-radius: calc(16 * var(--rpx)); background: rgba(255,255,255,.10); color: #fff; font-size: calc(22 * var(--rpx)); font-weight: 600; line-height: calc(56 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.action-arrow { margin-left: calc(5 * var(--rpx)); font-size: calc(29 * var(--rpx)); font-weight: 400; }

/* 入口行：本页只放「去哪里」，不放明细 */
.entry-list { margin-top: calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(22 * var(--rpx)) rgba(22, 106, 63,.035); overflow: hidden; }
.entry-row { display: flex; align-items: center; padding: calc(24 * var(--rpx)) calc(26 * var(--rpx)); cursor: pointer; }
.entry-main { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.entry-title { color: #1d4d35; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.entry-sub { margin-top: calc(8 * var(--rpx)); color: #94a09a; font-size: calc(21 * var(--rpx)); line-height: 1.45; }
.entry-arrow { flex-shrink: 0; margin-left: calc(16 * var(--rpx)); color: #c2c9d1; font-size: calc(34 * var(--rpx)); line-height: 1; }

/* 订单卡片 */
.order-section { margin-top: calc(20 * var(--rpx)); padding: 0 calc(21 * var(--rpx)) calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(24 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(22 * var(--rpx)) rgba(22, 106, 63,.035); }
.section-header { display: flex; align-items: center; justify-content: space-between; height: calc(91 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f0eeea; cursor: pointer; }
.section-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.view-all-orders { display: flex; align-items: center; color: #8d98a8; font-size: calc(23 * var(--rpx)); }
.view-all-orders::after { margin-left: calc(7 * var(--rpx)); color: #b1b8c2; content: '›'; font-size: calc(30 * var(--rpx)); line-height: 1; }
.order-status-tabs { display: flex; padding-top: calc(22 * var(--rpx)); }
.tab-item { width: 33.3333%; cursor: pointer; }
.tab-container { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; height: calc(138 * var(--rpx)); margin: 0 calc(6 * var(--rpx)); border-radius: calc(17 * var(--rpx)); }
.tab-container.payment { background: #fdf6e3; color: #c98f1b; }
.tab-container.shipment { background: #f2f7f3; color: #567aa4; }
.tab-container.receipt { background: #eef8f7; color: #338477; }
.status-icon { width: calc(60 * var(--rpx)); height: calc(60 * var(--rpx)); margin-bottom: calc(7 * var(--rpx)); }
.tab-label { color: #526074; font-size: calc(25 * var(--rpx)); font-weight: 700; line-height: 1; text-align: center; }
.tab-count { position: absolute; top: calc(-9 * var(--rpx)); right: calc(1 * var(--rpx)); min-width: calc(31 * var(--rpx)); height: calc(31 * var(--rpx)); padding: 0 calc(5 * var(--rpx)); border: calc(3 * var(--rpx)) solid #fff; border-radius: calc(18 * var(--rpx)); background: #c98f1b; color: #fff; font-size: calc(19 * var(--rpx)); line-height: calc(31 * var(--rpx)); text-align: center; box-sizing: border-box; }

.verify-banner { display: flex; align-items: center; justify-content: space-between; margin-top: calc(18 * var(--rpx)); padding: calc(20 * var(--rpx)) calc(24 * var(--rpx)); border-radius: calc(18 * var(--rpx)); cursor: pointer; }
.verify-email { border: calc(1 * var(--rpx)) solid #f0dfb7; background: rgba(255,251,239,.95); }
.verify-banner-left { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.verify-banner-title { color: #166a3f; font-size: calc(26 * var(--rpx)); font-weight: 750; }
.verify-banner-sub { margin-top: calc(6 * var(--rpx)); color: #8d98a8; font-size: calc(20 * var(--rpx)); }
.verify-banner-arrow { margin-left: calc(14 * var(--rpx)); color: #b07f16; font-size: calc(24 * var(--rpx)); font-weight: 700; white-space: nowrap; }
</style>
