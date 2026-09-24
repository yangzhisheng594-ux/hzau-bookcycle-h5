<template>
  <view class="container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">设置</text></view>

    <!-- ========== 账号与安全 ========== -->
    <view class="block" v-if="isLoggedIn">
      <view class="block-title">账号与安全</view>
      <view class="card">
        <!-- 登录账号 = 邮箱。必须说清它只用于登录，避免用户误以为这是交易联系方式 -->
        <view class="row row-col">
          <view class="row-top">
            <text class="row-label">登录账号</text>
            <text class="value-tag" v-if="emailVerified">已验证</text>
          </view>
          <text class="row-value-inline">{{ email || '未绑定邮箱' }}</text>
          <text class="row-sub">仅用于登录与找回密码，不会作为交易联系方式展示</text>
        </view>

        <view class="row" v-if="hasPassword" @click="navigateToChangePassword">
          <text class="row-label">修改密码</text>
          <text class="arrow">›</text>
        </view>

        <view class="row" @click="goVerify">
          <text class="row-label">身份认证</text>
          <view class="row-inline">
            <text class="row-value" :class="{ 'is-warn': verifyStatus !== 'approved' }">{{ verifyStatusText }}</text>
            <text class="arrow">›</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ========== 隐私与交易 ========== -->
    <view class="block" v-if="isLoggedIn">
      <view class="block-title">隐私与交易</view>
      <view class="card">
        <view class="row row-col row-link" @click="navigateToEditProfile">
          <view class="row-top">
            <text class="row-label">联系方式公开范围</text>
            <view class="row-inline"><text class="row-value strong">{{ visibilityLabel }}</text><text class="arrow">›</text></view>
          </view>
          <text class="row-sub">{{ visibilityNote }}</text>
        </view>
      </view>
      <text class="block-note">联系方式（微信 / QQ / 手机）与常用交易地址在「编辑资料」中填写。</text>
    </view>

    <!-- ========== 更多：反馈 / 分享 / 下载 / 社群 / 关于 ========== -->
    <view class="block">
      <view class="block-title">更多</view>
      <view class="card">
        <view class="row" @click="openDeveloping('意见反馈')">
          <text class="row-label">意见反馈</text>
          <text class="arrow">›</text>
        </view>
        <view class="row" @click="shareToFriend">
          <text class="row-label">推荐给朋友</text>
          <text class="arrow">›</text>
        </view>
        <view class="row" @click="openDeveloping('APP 下载')">
          <text class="row-label">APP 下载</text>
          <text class="arrow">›</text>
        </view>
        <view class="row" @click="openDeveloping('加入用户交流群')">
          <text class="row-label">加入用户交流群</text>
          <text class="arrow">›</text>
        </view>
        <view class="row" @click="aboutShow = true">
          <text class="row-label">关于书循环</text>
          <text class="arrow">›</text>
        </view>
      </view>
    </view>

    <view class="logout-btn" v-if="isLoggedIn" @click="logout">退出登录</view>

    <!-- ========== 危险操作：注销放最底部，弱化呈现 + 二次确认 ========== -->
    <view class="danger-zone" v-if="isLoggedIn">
      <text class="danger-zone-label">危险操作</text>
      <view class="danger-row" @click="deleteAccount">
        <view class="danger-copy">
          <text class="danger-title">注销账号</text>
          <text class="danger-sub">永久删除账号与个人资料；历史订单会匿名保留，此操作不可恢复</text>
        </view>
        <text class="danger-arrow">›</text>
      </view>
    </view>

    <!-- ========== 开发中：轻量动效提示（意见反馈 / APP 下载 / 交流群） ========== -->
    <view class="dev-mask" v-if="devShow" @click="devShow = false">
      <view class="dev-card" @click.stop>
        <view class="dev-anim">
          <view class="dev-ring"></view>
          <view class="dev-ring-inner"></view>
          <view class="dev-core"></view>
        </view>
        <view class="dev-dots"><view class="dev-dot"></view><view class="dev-dot"></view><view class="dev-dot"></view></view>
        <text class="dev-title">{{ devName }}开发中</text>
        <text class="dev-sub">这个功能还在打磨，很快就会和同学们见面</text>
        <button class="dev-close" @click="devShow = false">知道了</button>
      </view>
    </view>

    <!-- ========== 关于华农书循环 ========== -->
    <view class="about-mask" v-if="aboutShow" @click="aboutShow = false">
      <view class="about-card" @click.stop>
        <view class="about-head">
          <view class="about-logo"><text class="about-logo-text">书</text></view>
          <view class="about-head-copy">
            <text class="about-name">华农书循环</text>
            <text class="about-slogan">教材循环，让知识继续流动</text>
          </view>
        </view>
        <view class="about-body">
          <text class="about-p">华农书循环是华中农业大学学生自主搭建的二手教材公益流转平台。针对 QQ、微信二手书群消息杂乱、交易难追溯的弊端，项目旨在盘活校内旧教材资源，降低同学们购书成本，践行绿色循环理念。</text>
          <text class="about-p">本项目参考开源项目 bnbu-second-hand-book-platform，在原有基础上改造为 H5 网页版本，并新增企业微信认证等多项适配校园场景的定制化功能。</text>
          <text class="about-link" @click="openRepo">https://github.com/taoyun0303-star/bnbu-second-hand-book-platform</text>
          <text class="about-p">在此特别感谢 Yun Tao 的开源分享，为本项目落地提供了宝贵的产品思路与开发基础。</text>
          <text class="about-p">本平台为学生公益项目，不用于商业用途，功能持续迭代优化，欢迎各位同学提交意见反馈。</text>
        </view>
        <button class="about-close" @click="aboutShow = false">知道了</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import * as wx from '../services/wx';
import { globalData, refreshUserProfile, logout as doLogout } from '../store';

defineOptions({ name: 'SettingsPage' });

const isLoggedIn = computed(() => Boolean(globalData.isUserLoggedIn));
const userInfo = computed(() => globalData.userInfo || {});
const verifyStatus = computed(() => globalData.verifyStatus || 'none');

const email = computed(() => userInfo.value.email || '');
const emailVerified = computed(() => Boolean(userInfo.value.emailVerified));
const hasPassword = computed(() => Boolean(userInfo.value.hasPassword !== undefined ? userInfo.value.hasPassword : userInfo.value.email));

const verifyStatusText = computed(() => {
  switch (verifyStatus.value) {
    case 'approved': return '已认证';
    case 'pending': return '审核中';
    case 'rejected': return '未通过，点击重新提交';
    default: return '未认证，点击去认证';
  }
});

// 与服务端 contactVisible 三档一一对应，文案只说「对方看不看得到」，不暴露实现细节
const CONTACT_VISIBILITY_TEXT = {
  public: { label: '公开可见', note: '所有登录用户都能在书籍与求购详情页看到你的联系方式。' },
  order_only: { label: '仅交易对方可见', note: '只有与你存在订单关系的同学才能看到联系方式，其余人只能看到锁形提示。' },
  private: { label: '不公开', note: '任何人都看不到你的联系方式，交易需通过订单页沟通。' }
};
const visibilityLabel = computed(() => (CONTACT_VISIBILITY_TEXT[userInfo.value.contactVisible] || CONTACT_VISIBILITY_TEXT.order_only).label);
const visibilityNote = computed(() => (CONTACT_VISIBILITY_TEXT[userInfo.value.contactVisible] || CONTACT_VISIBILITY_TEXT.order_only).note);

onMounted(async () => {
  // 静默刷新一次：审核结果、可见范围可能刚在别的页面被改过
  await refreshUserProfile().catch(() => null);
});

function goBack() { wx.navigateBack(); }
function navigateToEditProfile() { wx.navigateTo({ url: '/pages/editProfile/editProfile' }); }
function navigateToChangePassword() { wx.navigateTo({ url: '/pages/changePassword/changePassword' }); }
function goVerify() { wx.navigateTo({ url: '/pages/verify/verify' }); }

/* ---------- 更多：开发中提示 / 分享 / 关于 ---------- */
const devShow = ref(false);
const devName = ref('');
const aboutShow = ref(false);

function openDeveloping(name) {
  devName.value = name;
  devShow.value = true;
}

const REPO_URL = 'https://github.com/taoyun0303-star/bnbu-second-hand-book-platform';
function openRepo() {
  try { window.open(REPO_URL, '_blank'); }
  catch (e) { wx.showToast({ title: '打开失败，请手动访问', icon: 'none' }); }
}

// 推荐给朋友：复制站点地址。优先用剪贴板 API，失败退回 execCommand（老浏览器 / 非安全上下文）
function copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

async function shareToFriend() {
  const url = window.location.origin + '/';
  let copied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      copied = true;
    } else {
      copyFallback(url);
      copied = true;
    }
  } catch (e) {
    try { copyFallback(url); copied = true; } catch (err) { copied = false; }
  }
  wx.showToast({
    title: copied ? '已复制网址，感谢分享' : '复制失败，请手动分享',
    icon: copied ? 'success' : 'none',
    duration: 2000
  });
}

async function logout() {
  wx.showModal({
    title: '提示',
    content: '确定要退出登录吗？',
    success: async res => {
      if (!res.confirm) return;
      wx.showLoading({ title: '退出中…', mask: true });
      await doLogout();
      wx.hideLoading();
      wx.showToast({ title: '已退出登录', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 900);
    }
  });
}

// 注销账号：不可逆操作，双重确认（先读后果 + 输入确认词，再验密码）
function deleteAccount() {
  if (!isLoggedIn.value) return;

  const submit = async (password, confirmWord) => {
    wx.showLoading({ title: '正在注销…', mask: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'deleteMyAccount', data: { password, confirm: confirmWord } });
      wx.hideLoading();
      const result = res.result || {};
      if (!result.success) {
        wx.showToast({ title: result.message || '注销失败', icon: 'none', duration: 3000 });
        return;
      }
      await doLogout();
      wx.showModal({
        title: '账号已注销',
        content: '你的账号与个人资料已删除。历史订单会匿名保留，以便交易对方继续查看。',
        showCancel: false,
        confirmText: '知道了',
        success: () => wx.navigateBack()
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    }
  };

  wx.showModal({
    title: '注销账号（不可恢复）',
    content: '注销后将：\n· 无法再用该账号登录，且无法找回\n· 已发布的书、购物车、消息全部删除\n· 个人资料（含联系方式）彻底清除\n\n历史订单会匿名保留，以免影响买家查看。',
    confirmText: '我已了解，继续',
    confirmColor: '#b35353',
    success: r => {
      if (!r.confirm) return;
      openConfirmDialog(password => {}, submit);
    }
  });
}

// 二次弹窗：要求输入「注销」并验密码。两步都过了才真的提交，防误触、也防他人拿手机直接注销。
function openConfirmDialog(_unused, submit) {
  const box = document.createElement('div');
  box.className = 'wx-prompt-mask';
  box.innerHTML = '<div class="wx-prompt">'
    + '<div class="wx-prompt-title">请输入「注销」二字以确认</div>'
    + '<input class="wx-prompt-input" type="text" placeholder="注销" />'
    + '<div class="wx-prompt-title" style="margin-top:14px;">当前登录密码</div>'
    + '<input class="wx-prompt-input wx-prompt-pwd" type="password" placeholder="用于验证是你本人" />'
    + '<div class="wx-prompt-actions"><button class="wx-prompt-cancel">取消</button><button class="wx-prompt-ok">确认注销</button></div>'
    + '</div>';
  document.body.appendChild(box);
  const wordInput = box.querySelector('.wx-prompt-input');
  const pwdInput = box.querySelector('.wx-prompt-pwd');
  box.querySelector('.wx-prompt-cancel').onclick = () => box.remove();
  box.querySelector('.wx-prompt-ok').onclick = () => {
    const word = wordInput.value.trim();
    const pwd = pwdInput.value;
    if (word !== '注销') { wx.showToast({ title: '请输入「注销」二字', icon: 'none' }); return; }
    if (hasPassword.value && !pwd) { wx.showToast({ title: '请输入当前密码', icon: 'none' }); return; }
    box.remove();
    submit(pwd, '注销');
  };
  wordInput.focus();
}
</script>

<style scoped>
.container { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(40 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(104 * var(--rpx)); }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(26 * var(--rpx)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }

.block { margin-bottom: calc(22 * var(--rpx)); }
.block-title { position: relative; margin: 0 0 calc(10 * var(--rpx)) calc(6 * var(--rpx)); padding-left: calc(15 * var(--rpx)); color: #166a3f; font-size: calc(27 * var(--rpx)); font-weight: 780; }
.block-title::before { position: absolute; top: calc(5 * var(--rpx)); left: 0; width: calc(6 * var(--rpx)); height: calc(25 * var(--rpx)); border-radius: calc(4 * var(--rpx)); background: #d9a62e; content: ''; }
.block-note { display: block; margin: calc(10 * var(--rpx)) calc(6 * var(--rpx)) 0; color: #94a09a; font-size: calc(20 * var(--rpx)); line-height: 1.45; }

.card { border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(20 * var(--rpx)) rgba(22, 106, 63,.03); overflow: hidden; }
.row { display: flex; align-items: center; justify-content: space-between; min-height: calc(94 * var(--rpx)); padding: calc(20 * var(--rpx)) calc(26 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f3f1ed; box-sizing: border-box; cursor: pointer; }
.row:last-child { border-bottom: none; }
.row-col { flex-direction: column; align-items: stretch; }
.row-top { display: flex; align-items: center; justify-content: space-between; }
.row-inline { display: flex; align-items: center; }
.row-label { color: #3d594c; font-size: calc(26 * var(--rpx)); font-weight: 650; }
.row-value { color: #2c463b; font-size: calc(25 * var(--rpx)); font-weight: 620; }
.row-value-inline { margin-top: calc(9 * var(--rpx)); color: #4a5a52; font-size: calc(26 * var(--rpx)); font-weight: 620; word-break: break-all; }
.row-value.strong { color: #166a3f; font-weight: 720; }
.row-value.is-warn { color: #b07f16; }
.row-sub { margin-top: calc(7 * var(--rpx)); color: #9aa4ae; font-size: calc(20 * var(--rpx)); line-height: 1.45; }
.value-tag { margin-left: calc(10 * var(--rpx)); padding: calc(2 * var(--rpx)) calc(9 * var(--rpx)); border-radius: calc(9 * var(--rpx)); background: #e8f4eb; color: #3d7a55; font-size: calc(18 * var(--rpx)); font-weight: 600; }
.arrow { margin-left: calc(10 * var(--rpx)); color: #c2c9d1; font-size: calc(32 * var(--rpx)); line-height: 1; }

.logout-btn { display: flex; align-items: center; justify-content: center; height: calc(84 * var(--rpx)); margin-top: calc(4 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ecd9a8; border-radius: calc(18 * var(--rpx)); background: #fdf8ea; color: #b07f16; font-size: calc(27 * var(--rpx)); font-weight: 700; cursor: pointer; }

.danger-zone { margin-top: calc(28 * var(--rpx)); padding-top: calc(18 * var(--rpx)); border-top: calc(1 * var(--rpx)) dashed #eee2e2; }
.danger-zone-label { display: block; margin: 0 0 calc(11 * var(--rpx)) calc(6 * var(--rpx)); color: #b9a3a3; font-size: calc(21 * var(--rpx)); letter-spacing: calc(1 * var(--rpx)); }
.danger-row { display: flex; align-items: center; justify-content: space-between; padding: calc(18 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #f2e6e6; border-radius: calc(17 * var(--rpx)); background: #fffcfc; cursor: pointer; }
.danger-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.danger-title { color: #a86060; font-size: calc(25 * var(--rpx)); font-weight: 700; }
.danger-sub { margin-top: calc(5 * var(--rpx)); color: #ab9a9a; font-size: calc(20 * var(--rpx)); line-height: 1.4; }
.danger-arrow { margin-left: calc(12 * var(--rpx)); color: #d5bcbc; font-size: calc(30 * var(--rpx)); line-height: 1; }

/* ---------- 开发中：双环旋转 + 呼吸内核 + 弹跳圆点 ---------- */
.dev-mask { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: calc(60 * var(--rpx)); background: rgba(30,42,36,.5); box-sizing: border-box; }
.dev-card { width: 100%; max-width: calc(540 * var(--rpx)); padding: calc(44 * var(--rpx)) calc(34 * var(--rpx)) calc(30 * var(--rpx)); border-radius: calc(26 * var(--rpx)); background: #fff; text-align: center; box-sizing: border-box; }
.dev-anim { position: relative; width: calc(132 * var(--rpx)); height: calc(132 * var(--rpx)); margin: 0 auto calc(14 * var(--rpx)); }
.dev-ring { position: absolute; inset: 0; border: calc(7 * var(--rpx)) solid #e7f0e8; border-top-color: #166a3f; border-radius: 50%; animation: devSpin 1.05s linear infinite; }
.dev-ring-inner { position: absolute; inset: calc(30 * var(--rpx)); border: calc(6 * var(--rpx)) solid #f5ecd4; border-bottom-color: #d9a62e; border-radius: 50%; animation: devSpinReverse 1.45s linear infinite; }
.dev-core { position: absolute; inset: calc(52 * var(--rpx)); border-radius: 50%; background: #166a3f; animation: devPulse 1.2s ease-in-out infinite; }
.dev-dots { display: flex; justify-content: center; margin-bottom: calc(20 * var(--rpx)); }
.dev-dot { width: calc(12 * var(--rpx)); height: calc(12 * var(--rpx)); border-radius: 50%; background: #d9a62e; animation: devBounce 1.15s ease-in-out infinite; }
.dev-dot + .dev-dot { margin-left: calc(11 * var(--rpx)); }
.dev-dot:nth-child(2) { animation-delay: .16s; }
.dev-dot:nth-child(3) { animation-delay: .32s; }
.dev-title { display: block; color: #1d4d35; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.dev-sub { display: block; margin-top: calc(11 * var(--rpx)); color: #8d98a8; font-size: calc(22 * var(--rpx)); line-height: 1.5; }
.dev-close { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(80 * var(--rpx)); margin: calc(26 * var(--rpx)) 0 0; border: 0; border-radius: calc(16 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(27 * var(--rpx)); font-weight: 700; line-height: 1.2 !important; }

@keyframes devSpin { to { transform: rotate(360deg); } }
@keyframes devSpinReverse { to { transform: rotate(-360deg); } }
@keyframes devPulse { 0%, 100% { opacity: .5; transform: scale(.82); } 50% { opacity: 1; transform: scale(1.12); } }
@keyframes devBounce { 0%, 100% { opacity: .42; transform: translateY(0); } 50% { opacity: 1; transform: translateY(calc(-11 * var(--rpx))); } }

/* ---------- 关于华农书循环 ---------- */
.about-mask { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: calc(56 * var(--rpx)) calc(40 * var(--rpx)); background: rgba(30,42,36,.5); box-sizing: border-box; }
.about-card { display: flex; flex-direction: column; width: 100%; max-width: calc(600 * var(--rpx)); max-height: 82vh; padding: calc(32 * var(--rpx)) calc(30 * var(--rpx)) calc(26 * var(--rpx)); border-radius: calc(26 * var(--rpx)); background: #fff; box-sizing: border-box; }
.about-head { display: flex; align-items: center; padding-bottom: calc(20 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f0eeea; }
.about-logo { display: flex; align-items: center; justify-content: center; width: calc(78 * var(--rpx)); height: calc(78 * var(--rpx)); margin-right: calc(18 * var(--rpx)); border-radius: calc(20 * var(--rpx)); background: linear-gradient(135deg, #166a3f, #35855a); flex: none; }
.about-logo-text { color: #e8c270; font-size: calc(36 * var(--rpx)); font-weight: 750; }
.about-head-copy { display: flex; flex-direction: column; min-width: 0; }
.about-name { color: #1d4d35; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.about-slogan { margin-top: calc(7 * var(--rpx)); color: #8b9f91; font-size: calc(21 * var(--rpx)); }
.about-body { flex: 1; margin-top: calc(20 * var(--rpx)); overflow-y: auto; -webkit-overflow-scrolling: touch; }
.about-p { display: block; margin-bottom: calc(16 * var(--rpx)); color: #4a5a52; font-size: calc(23 * var(--rpx)); line-height: 1.75; text-align: justify; }
.about-link { display: block; margin-bottom: calc(16 * var(--rpx)); color: #166a3f; font-size: calc(22 * var(--rpx)); line-height: 1.6; text-decoration: underline; word-break: break-all; }
.about-close { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(80 * var(--rpx)); margin: calc(8 * var(--rpx)) 0 0; border: 0; border-radius: calc(16 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(27 * var(--rpx)); font-weight: 700; line-height: 1.2 !important; flex: none; }
</style>
