<template>
  <view class="page-container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">重置密码</text></view>

    <view class="card" v-if="!done">
      <!-- 历史邮件里的重置链接：不需要填邮箱和验证码 -->
      <template v-if="linkToken">
        <view class="tip-top">正在使用邮件中的重置链接，请直接设置新密码。</view>
      </template>
      <template v-else>
        <input class="input" type="email" v-model="email" placeholder="注册时使用的邮箱" autocomplete="username" />
        <view class="code-row">
          <input class="input code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位验证码" @keyup.enter="submit" />
          <button class="code-btn" :disabled="countdown > 0 || sending" @click="sendCode">
            {{ countdown > 0 ? `${countdown}s` : (sending ? '发送中' : '获取验证码') }}
          </button>
        </view>
      </template>

      <input class="input" type="password" v-model="password" placeholder="新密码：至少 8 位，含字母和数字" autocomplete="new-password" />
      <input class="input" type="password" v-model="confirmPassword" placeholder="确认新密码" autocomplete="new-password" @keyup.enter="submit" />
      <view class="err" v-if="error">{{ error }}</view>
      <button class="primary-btn" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : '确认重置' }}</button>
      <view class="tip">重置成功后，该账号在所有设备的登录状态都会失效，需要用新密码重新登录。</view>
    </view>

    <view class="card result" v-else>
      <view class="ok-icon">✓</view>
      <view class="result-title">密码已重置</view>
      <view class="result-desc">请使用新密码登录。如有问题可联系管理员微信 {{ adminWechat }}。</view>
      <button class="primary-btn" @click="goLogin">去登录</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';
import { ADMIN_WECHAT_TEXT } from '../services/contact';

const route = useRoute();
const linkToken = ref('');
const email = ref('');
const code = ref('');
const password = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const sending = ref(false);
const countdown = ref(0);
const error = ref('');
const done = ref(false);
const adminWechat = ADMIN_WECHAT_TEXT;
let timer = null;

onMounted(() => {
  linkToken.value = String(route.query.token || '');
  email.value = String(route.query.email || '');
});

onUnmounted(() => { if (timer) clearInterval(timer); });

function startCountdown(seconds) {
  countdown.value = seconds;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) { clearInterval(timer); timer = null; countdown.value = 0; }
  }, 1000);
}

function goBack() { wx.navigateBack(); }
function goLogin() { wx.navigateTo({ url: '/pages/auth/auth?tab=login' }); }

async function sendCode() {
  if (sending.value || countdown.value > 0) return;
  error.value = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { error.value = '请先填写正确的邮箱'; return; }
  sending.value = true;
  wx.showLoading({ title: '发送中…', mask: true });
  try {
    const res = await wx.cloud.callFunction({ name: 'forgotPassword', data: { email: email.value } });
    wx.hideLoading();
    const payload = res.result || {};
    // 后端对「邮箱是否存在」不做区分（防账号枚举），所以这里永远提示已发送
    wx.showToast({ title: '验证码已发送', icon: 'success' });
    startCountdown(60);
    if (payload.mailMode === 'dev') {
      error.value = '邮件服务当前不可用，验证码未能发出，请联系管理员微信代发。';
    }
  } catch (e) {
    wx.hideLoading();
    error.value = '网络异常，请稍后重试';
  } finally {
    sending.value = false;
  }
}

async function submit() {
  if (submitting.value) return;
  error.value = '';
  if (password.value !== confirmPassword.value) { error.value = '两次输入的密码不一致'; return; }

  const body = { newPassword: password.value, confirmPassword: confirmPassword.value };
  if (linkToken.value) body.token = linkToken.value;
  else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { error.value = '请填写正确的邮箱'; return; }
    if (!/^\d{6}$/.test(code.value)) { error.value = '请输入 6 位数字验证码'; return; }
    body.email = email.value;
    body.code = code.value;
  }

  submitting.value = true;
  wx.showLoading({ title: '提交中…', mask: true });
  try {
    const res = await wx.cloud.callFunction({ name: 'resetPassword', data: body });
    wx.hideLoading();
    const payload = res.result || {};
    if (payload.success) {
      done.value = true;
      wx.showToast({ title: '重置成功', icon: 'success' });
    } else {
      error.value = payload.message || '重置失败，请重新获取验证码';
    }
  } catch (e) {
    wx.hideLoading();
    error.value = '网络异常，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page-container { min-height: 100vh; padding: 0 calc(32 * var(--rpx)) calc(40 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.card { display: flex; flex-direction: column; padding: calc(28 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; }
.result { align-items: center; text-align: center; }
.ok-icon { display: flex; align-items: center; justify-content: center; width: calc(96 * var(--rpx)); height: calc(96 * var(--rpx)); border-radius: 50%; background: #e8f3ec; color: #166a3f; font-size: calc(44 * var(--rpx)); font-weight: 750; }
.result-title { margin-top: calc(18 * var(--rpx)); color: #29443a; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.result-desc { margin: calc(12 * var(--rpx)) 0 calc(24 * var(--rpx)); color: #7f8f86; font-size: calc(22 * var(--rpx)); line-height: 1.7; }
.input { width: 100%; height: calc(88 * var(--rpx)); margin-bottom: calc(18 * var(--rpx)); padding: 0 calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe4dd; border-radius: calc(16 * var(--rpx)); background: #fff; color: #29443a; font-size: calc(26 * var(--rpx)); box-sizing: border-box; }
.input:focus { border-color: #166a3f; outline: none; }
.code-row { display: flex; gap: calc(14 * var(--rpx)); }
.code-row .code { flex: 1; margin-bottom: calc(18 * var(--rpx)); letter-spacing: calc(6 * var(--rpx)); text-align: center; }
.code-btn { flex: 0 0 auto; height: calc(88 * var(--rpx)); margin-bottom: calc(18 * var(--rpx)); padding: 0 calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #166a3f; border-radius: calc(16 * var(--rpx)); background: #fff; color: #166a3f; font-size: calc(24 * var(--rpx)); font-weight: 700; cursor: pointer; white-space: nowrap; }
.code-btn[disabled] { border-color: #dfe4dd; color: #9aa7a0; }
.err { margin-bottom: calc(14 * var(--rpx)); color: #b35353; font-size: calc(23 * var(--rpx)); }
.primary-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(88 * var(--rpx)); border: 0; border-radius: calc(18 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(29 * var(--rpx)); font-weight: 700; cursor: pointer; }
.primary-btn[disabled] { background: #c7cdd5; }
.tip { margin-top: calc(18 * var(--rpx)); color: #8a9a90; font-size: calc(21 * var(--rpx)); line-height: 1.7; }
.tip-top { margin-bottom: calc(18 * var(--rpx)); color: #8a9a90; font-size: calc(22 * var(--rpx)); line-height: 1.6; }
</style>
