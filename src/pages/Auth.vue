<template>
  <view class="page-container">
    <view class="page-nav">
      <view class="nav-back" @click="goBack">‹</view>
      <text class="nav-title">{{ pageTitle }}</text>
    </view>

    <view class="brand">
      <view class="brand-title">华农书循环</view>
      <view class="brand-sub">校内教材流转 · 用校园邮箱注册</view>
    </view>

    <view class="tab-row">
      <text class="tab" :class="{ active: tab === 'login' }" @click="switchTab('login')">登录</text>
      <text class="tab" :class="{ active: tab === 'register' }" @click="switchTab('register')">注册</text>
      <text class="tab" :class="{ active: tab === 'reset' }" @click="switchTab('reset')">找回密码</text>
    </view>

    <!-- 通用错误提示 -->
    <view class="err-banner" v-if="error">
      <text class="err-icon">!</text>
      <text class="err-text">{{ error }}</text>
      <text class="err-close" @click="error = ''">✕</text>
    </view>

    <!-- 登录 -->
    <view class="form" v-if="tab === 'login'">
      <input class="input" v-model="loginForm.email" placeholder="邮箱或昵称" autocomplete="username" />
      <view class="input-wrap">
        <input class="input" :type="loginShowPw ? 'text' : 'password'" v-model="loginForm.password" placeholder="密码" autocomplete="current-password" @keyup.enter="doLogin" />
        <text class="eye" @click="loginShowPw = !loginShowPw">{{ loginShowPw ? '👁' : '👁️‍🗨️' }}</text>
      </view>
      <view class="input-wrap" v-if="loginChallenge">
        <input class="input" v-model="loginChallengeAnswer" :placeholder="'人机校验：' + loginChallenge.question" />
      </view>
      <view class="challenge-tip" v-if="loginChallenge">检测到同一网络下尝试了多个账号，请先完成校验</view>
      <button class="primary-btn" :disabled="submitting" @click="doLogin">{{ submitting ? '登录中…' : '登 录' }}</button>
      <view class="link-row"><text class="link" @click="switchTab('reset')">忘记密码？</text><text class="link" @click="switchTab('register')">去注册 ›</text></view>
    </view>

    <!-- 注册 -->
    <view class="form" v-else-if="tab === 'register'">
      <input class="input" v-model="regForm.email" placeholder="邮箱（用于验证与找回密码）" autocomplete="email" />
      <input class="input" v-model="regForm.nickName" placeholder="昵称（1-16 字，其他同学可见）" />
      <view class="input-wrap">
        <input class="input" :type="regShowPw ? 'text' : 'password'" v-model="regForm.password" placeholder="密码：至少 8 位，含字母和数字" autocomplete="new-password" />
        <text class="eye" @click="regShowPw = !regShowPw">{{ regShowPw ? '👁' : '👁️‍🗨️' }}</text>
      </view>
      <view class="input-wrap">
        <input class="input" :type="regShowPw2 ? 'text' : 'password'" v-model="regForm.confirmPassword" placeholder="确认密码" autocomplete="new-password" @keyup.enter="doRegister" />
        <text class="eye" @click="regShowPw2 = !regShowPw2">{{ regShowPw2 ? '👁' : '👁️‍🗨️' }}</text>
      </view>
      <button class="primary-btn" :disabled="submitting" @click="doRegister">{{ submitting ? '注册中…' : '注册并登录' }}</button>
      <view class="link-row"><text class="link" @click="switchTab('login')">已有账号？去登录 ›</text></view>
    </view>

    <!-- 找回密码 -->
    <view class="form" v-else>
      <input class="input" v-model="resetEmail" placeholder="注册时使用的邮箱" autocomplete="email" />
      <button class="primary-btn" :disabled="submitting" @click="doForgot">{{ submitting ? '提交中…' : '发送重置链接' }}</button>
      <view class="link-row"><text class="link" @click="switchTab('login')">想起密码？去登录 ›</text></view>
    </view>

    <!-- 注册成功：邮箱验证引导（内联卡片，不再弹窗卡死） -->
    <view class="result-card" v-if="resultType === 'verify-email'">
      <view class="result-title">注册成功 🎉</view>
      <view class="result-desc" v-if="smtpMode === 'dev'">
        邮件服务当前不可用，你的验证码是 <text class="code-strong">{{ resultCode }}</text> —— 直接进入验证页填入即可。
      </view>
      <view class="result-desc" v-else>
        还差一步：验证码已发送至你的邮箱，5 分钟内有效。去验证页填入这 6 位数字即可发布与购买。
      </view>
      <view class="result-actions">
        <button class="result-btn primary" @click="goVerifyEmail">去输入验证码</button>
        <button class="result-btn ghost" @click="goToProfile">稍后再说，进入个人中心</button>
      </view>
    </view>

    <!-- 找回密码结果 -->
    <view class="result-card" v-if="resultType === 'reset-password'">
      <view class="result-title">重置请求已提交</view>
      <view class="result-desc" v-if="smtpMode === 'dev'">当前邮件服务未配置，验证码无法自动发出。请联系管理员微信 {{ adminWechat }} 代发验证码。</view>
      <view class="result-desc" v-else>重置验证码已发送至该邮箱，5 分钟内有效。若未收到请检查垃圾邮件。</view>
      <view class="result-actions">
        <button class="result-btn primary" v-if="smtpMode !== 'dev'" @click="goResetPassword">去设置新密码</button>
        <button class="result-btn primary" @click="copyAdminWechatLocal" v-if="smtpMode === 'dev'">复制管理员微信</button>
        <button class="result-btn ghost" @click="switchTab('login')">返回登录</button>
      </view>
    </view>

    <!-- 底部取消返回（大屏/无系统返回键时兜底） -->
    <view class="bottom-cancel" v-if="!resultType" @click="goBack"><text class="cancel-text">取消，返回上一页</text></view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import * as wx from '../services/wx';
import { globalData } from '../store';
import { setToken, setRefreshToken } from '../services/server';
import { ADMIN_WECHAT_TEXT, copyAdminWechat } from '../services/contact';

const adminWechat = ADMIN_WECHAT_TEXT;
function copyAdminWechatLocal() { copyAdminWechat(wx); }

const tab = ref('login');
const submitting = ref(false);
const error = ref('');
const loginShowPw = ref(false);
// 同 IP 撞多个账号时，服务端下发的人机校验题
const loginChallenge = ref(null);
const loginChallengeAnswer = ref('');
const regShowPw = ref(false);
const regShowPw2 = ref(false);
const resultType = ref(''); // '' | 'verify-email' | 'reset-password'
const resultLink = ref('');
// 邮件通道不可用时服务端回传的 6 位验证码（仅注册者本人可见，用于当场自证）
const resultCode = ref('');
const smtpMode = ref('');

const loginForm = ref({ email: '', password: '' });
const regForm = ref({ email: '', nickName: '', password: '', confirmPassword: '' });
const resetEmail = ref('');

const pageTitle = computed(() => ({ login: '登录', register: '注册账号', reset: '找回密码' }[tab.value]));

function switchTab(t) {
  tab.value = t;
  error.value = '';
  resultType.value = '';
  resultLink.value = '';
  resultCode.value = '';
}

function goBack() {
  // 如果注册/登录后已经拿到结果卡片，返回首页/个人中心
  if (resultType.value) { wx.switchTab({ url: '/pages/profile/profile' }); return; }
  wx.navigateBack();
}

function goToProfile() { wx.switchTab({ url: '/pages/profile/profile' }); }

async function applySession(res, successText) {
  if (!res.result || !res.result.success) {
    error.value = (res.result && res.result.message) || '操作失败，请重试';
    return false;
  }
  const data = res.result;
  if (data.token) { setToken(data.token); if (data.refreshToken) setRefreshToken(data.refreshToken); }
  if (data.userData) {
    wx.setStorageSync('userInfo', data.userData);
    globalData.userInfo = data.userData;
    globalData.isUserLoggedIn = true;
    globalData.verifyStatus = data.userData.verifyStatus || 'none';
  }
  wx.showToast({ title: successText, icon: 'success' });
  return true;
}

async function doLogin() {
  if (submitting.value) return;
  error.value = '';
  if (!loginForm.value.email || !loginForm.value.password) { error.value = '请填写账号与密码'; return; }
  if (loginChallenge.value && !loginChallengeAnswer.value) { error.value = '请完成人机校验'; return; }
  submitting.value = true;
  wx.showLoading({ title: '登录中…', mask: true });
  try {
    const payload = { email: loginForm.value.email.trim(), password: loginForm.value.password };
    // 被要求人机校验时，带上服务端下发的题目与答案
    if (loginChallenge.value) {
      payload.challengeId = loginChallenge.value.challengeId;
      payload.challengeAnswer = Number(loginChallengeAnswer.value);
    }
    const res = await wx.cloud.callFunction({ name: 'loginWithPassword', data: payload });
    wx.hideLoading();
    const code = res.result && res.result.code;
    if (code === 'CHALLENGE_REQUIRED') {
      // 服务端返回新题目：展示校验输入框，等用户作答后重试
      loginChallenge.value = res.result.challenge || null;
      loginChallengeAnswer.value = '';
      error.value = '需要人机校验';
      return;
    }
    loginChallenge.value = null;
    loginChallengeAnswer.value = '';
    const ok = await applySession(res, '登录成功');
    if (ok) setTimeout(() => wx.switchTab({ url: '/pages/profile/profile' }), 600);
  } catch (e) {
    wx.hideLoading();
    error.value = '网络异常，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

function goVerifyEmail() {
  wx.navigateTo({ url: '/pages/emailVerify/emailVerify' });
}

function goResetPassword() {
  const mail = String(resetEmail.value || '').trim();
  wx.navigateTo({ url: `/pages/resetPassword/resetPassword${mail ? '?email=' + encodeURIComponent(mail) : ''}` });
}

async function doRegister() {
  if (submitting.value) return;
  error.value = '';
  const { email, nickName, password, confirmPassword } = regForm.value;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim());
  if (!emailOk) { error.value = '请输入有效的邮箱地址'; return; }
  if (!nickName || nickName.trim().length < 1 || nickName.trim().length > 16) { error.value = '昵称需为 1-16 个字符'; return; }
  if (!password) { error.value = '请设置密码'; return; }
  const pwMsg = passwordStrength(password);
  if (pwMsg) { error.value = pwMsg; return; }
  if (password !== confirmPassword) { error.value = '两次输入的密码不一致'; return; }
  submitting.value = true;
  wx.showLoading({ title: '注册中…', mask: true });
  try {
    const res = await wx.cloud.callFunction({ name: 'register', data: { email: email.trim(), nickName: nickName.trim(), password, confirmPassword } });
    wx.hideLoading();
    if (!res.result || !res.result.success) { error.value = (res.result && res.result.message) || '注册失败，请稍后重试'; return; }
    const ok = await applySession(res, '注册成功');
    if (ok) {
      // 内联显示验证引导，不再用容易卡住的弹窗
      resultType.value = 'verify-email';
      smtpMode.value = (res.result.devEmailCode ? 'dev' : 'smtp');
      resultCode.value = res.result.devEmailCode || '';
      resultLink.value = res.result.devVerifyLink || '';
    }
  } catch (e) {
    wx.hideLoading();
    error.value = '网络异常，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

async function doForgot() {
  if (submitting.value) return;
  error.value = '';
  if (!resetEmail.value) { error.value = '请填写邮箱'; return; }
  submitting.value = true;
  wx.showLoading({ title: '提交中…', mask: true });
  try {
    const res = await wx.cloud.callFunction({ name: 'forgotPassword', data: { email: resetEmail.value.trim() } });
    wx.hideLoading();
    if (res.result && res.result.success) {
      resultType.value = 'reset-password';
      // 服务端不再回传重置链接（防账号接管），只告知邮件通道是否可用
      smtpMode.value = res.result.mailMode === 'dev' ? 'dev' : 'smtp';
      resultLink.value = '';
    } else {
      error.value = (res.result && res.result.message) || '提交失败，请稍后重试';
    }
  } catch (e) {
    wx.hideLoading();
    error.value = '网络异常，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

function passwordStrength(pw) {
  if (String(pw).length < 8) return '密码至少 8 位';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return '密码需同时包含字母和数字';
  return '';
}

function openLink(link) { if (link) window.location.href = link; }
async function copyLink(link) {
  if (!link) return;
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(link);
    else {
      const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    wx.showToast({ title: '链接已复制', icon: 'success' });
  } catch (e) { wx.showToast({ title: '复制失败，请手动复制', icon: 'none' }); }
}
</script>

<style scoped>
.page-container { min-height: 100vh; padding: 0 calc(32 * var(--rpx)) calc(40 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(72 * var(--rpx)); height: calc(72 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(18 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.brand { padding: calc(24 * var(--rpx)) 0 calc(34 * var(--rpx)); text-align: center; }
.brand-title { color: #166a3f; font-size: calc(42 * var(--rpx)); font-weight: 800; }
.brand-sub { margin-top: calc(10 * var(--rpx)); color: #8a9a90; font-size: calc(22 * var(--rpx)); }
.tab-row { display: flex; margin-bottom: calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e3e8e1; border-radius: calc(16 * var(--rpx)); overflow: hidden; background: #fff; }
.tab { flex: 1; padding: calc(22 * var(--rpx)) 0; color: #7b8b82; font-size: calc(25 * var(--rpx)); text-align: center; cursor: pointer; }
.tab.active { background: #166a3f; color: #fff; font-weight: 700; }
.err-banner { display: flex; align-items: center; gap: calc(14 * var(--rpx)); margin-bottom: calc(18 * var(--rpx)); padding: calc(18 * var(--rpx)) calc(22 * var(--rpx)); border-radius: calc(16 * var(--rpx)); background: #fdf1f0; color: #b35353; }
.err-icon { display: flex; align-items: center; justify-content: center; width: calc(32 * var(--rpx)); height: calc(32 * var(--rpx)); border-radius: 50%; background: #f3c9c6; color: #fff; font-size: calc(22 * var(--rpx)); font-weight: 700; }
.err-text { flex: 1; font-size: calc(23 * var(--rpx)); line-height: 1.5; }
.err-close { padding: calc(6 * var(--rpx)); font-size: calc(24 * var(--rpx)); cursor: pointer; }
.form { display: flex; flex-direction: column; }
.input { width: 100%; height: calc(88 * var(--rpx)); margin-bottom: calc(18 * var(--rpx)); padding: 0 calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe4dd; border-radius: calc(16 * var(--rpx)); background: #fff; color: #29443a; font-size: calc(26 * var(--rpx)); box-sizing: border-box; }
.input:focus { border-color: #166a3f; outline: none; }
.input-wrap { position: relative; }
.input-wrap .input { padding-right: calc(76 * var(--rpx)); }
.challenge-tip { margin-top: calc(12 * var(--rpx)); color: #b3760f; font-size: calc(21 * var(--rpx)); line-height: 1.6; }
.eye { position: absolute; right: calc(18 * var(--rpx)); top: calc(22 * var(--rpx)); font-size: calc(30 * var(--rpx)); line-height: 1; cursor: pointer; user-select: none; }
.primary-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(88 * var(--rpx)); border: 0; border-radius: calc(18 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(29 * var(--rpx)); font-weight: 700; cursor: pointer; }
.primary-btn[disabled] { background: #c7cdd5; }
.link-row { display: flex; justify-content: space-between; margin-top: calc(18 * var(--rpx)); }
.link { color: #166a3f; font-size: calc(23 * var(--rpx)); font-weight: 600; cursor: pointer; }
.bottom-cancel { margin-top: calc(36 * var(--rpx)); text-align: center; }
.cancel-text { color: #8a9a90; font-size: calc(24 * var(--rpx)); cursor: pointer; }
.result-card { margin-top: calc(22 * var(--rpx)); padding: calc(28 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dce9de; border-radius: calc(22 * var(--rpx)); background: #f0f8f2; }
.result-title { color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 750; text-align: center; }
.result-desc { margin-top: calc(14 * var(--rpx)); color: #4a6354; font-size: calc(23 * var(--rpx)); line-height: 1.7; text-align: center; }
.code-strong { display: inline-block; padding: calc(2 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(8 * var(--rpx)); background: #eef6f0; color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 800; letter-spacing: calc(4 * var(--rpx)); }
.result-actions { display: flex; flex-direction: column; gap: calc(14 * var(--rpx)); margin-top: calc(24 * var(--rpx)); }
.result-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(78 * var(--rpx)); border: calc(1 * var(--rpx)) solid #d4e2d8; border-radius: calc(16 * var(--rpx)); background: #fff; color: #166a3f; font-size: calc(26 * var(--rpx)); font-weight: 700; cursor: pointer; box-sizing: border-box; }
.result-btn.primary { border-color: #166a3f; background: #166a3f; color: #fff; }
.result-btn.ghost { border: 0; background: transparent; color: #8a9a90; }
</style>
