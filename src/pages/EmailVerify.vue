<template>
  <view class="page-container">
    <view class="page-nav"><text class="nav-title">邮箱验证</text></view>

    <view class="card" v-if="!finished">
      <view class="lead">我们已向你的注册邮箱发送了一封验证码邮件</view>
      <view class="email" v-if="maskedEmail">{{ maskedEmail }}</view>

      <input
        class="code-input"
        v-model="code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        placeholder="请输入 6 位验证码"
        @keyup.enter="submit"
      />
      <view class="err" v-if="error">{{ error }}</view>

      <button class="primary-btn" :disabled="submitting || code.length !== 6" @click="submit">
        {{ submitting ? '验证中…' : '确认验证' }}
      </button>
      <button class="ghost-btn" :disabled="countdown > 0 || resending" @click="resend">
        {{ countdown > 0 ? `重新获取（${countdown}s）` : (resending ? '发送中…' : '重新获取验证码') }}
      </button>

      <view class="tip">验证码 5 分钟内有效，输错 5 次会自动失效。没收到先看垃圾邮件，仍没有可联系管理员人工代发。</view>
    </view>

    <view class="card result" v-else>
      <view class="icon" :class="succeeded ? 'ok' : 'error'">{{ succeeded ? '✓' : '✕' }}</view>
      <view class="title">{{ titleText }}</view>
      <view class="desc">{{ descText }}</view>
      <button class="primary-btn" v-if="succeeded" @click="goProfile">进入个人中心</button>
      <button class="primary-btn" v-else @click="goLogin">去登录</button>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';

const route = useRoute();

const code = ref('');
const email = ref('');
const error = ref('');
const submitting = ref(false);
const resending = ref(false);
const countdown = ref(0);
const finished = ref(false);
const succeeded = ref(false);
const titleText = ref('');
const descText = ref('');
let timer = null;

const maskedEmail = computed(() => {
  const e = String(email.value || '');
  const at = e.indexOf('@');
  if (at <= 0) return e;
  const name = e.slice(0, at);
  const head = name.length <= 2 ? name.slice(0, 1) + '*' : name.slice(0, 2) + '***' + name.slice(-1);
  return head + e.slice(at);
});

onMounted(async () => {
  // 历史邮件里的验证链接仍然可用（老链接不能失效）
  const linkToken = String(route.query.token || '');
  if (linkToken) { await verifyByLink(linkToken); return; }
  await loadProfile();
  startCountdown(60);
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

async function loadProfile() {
  try {
    const res = await wx.cloud.callFunction({ name: 'getUserProfile' });
    const payload = res.result || {};
    if (payload.success && payload.data) {
      email.value = payload.data.email || '';
      if (payload.data.emailVerified) {
        finish(true, '邮箱已验证', '你的邮箱已经完成验证，无需重复操作。');
      }
    }
  } catch (e) {
    // 拿不到资料不影响页面：用户仍可直接填验证码（服务端会按登录态校验归属）
  }
}

function finish(okFlag, title, desc) {
  succeeded.value = okFlag;
  titleText.value = title;
  descText.value = desc;
  finished.value = true;
}

async function verifyByLink(token) {
  submitting.value = true;
  try {
    const res = await wx.cloud.callFunction({ name: 'verifyEmail', data: { token } });
    const payload = res.result || {};
    if (payload.success) {
      finish(true, '邮箱验证成功', '你现在可以发布教材与下单购买了（仍需通过企业微信身份认证）。');
    } else {
      finish(false, '验证失败', payload.message || '链接已过期或已被使用，请重新获取验证码。');
    }
  } catch (e) {
    finish(false, '验证失败', '网络异常，请稍后重试。');
  } finally {
    submitting.value = false;
  }
}

async function submit() {
  if (submitting.value) return;
  error.value = '';
  if (!/^\d{6}$/.test(code.value)) { error.value = '请输入 6 位数字验证码'; return; }
  submitting.value = true;
  try {
    const res = await wx.cloud.callFunction({ name: 'verifyEmail', data: { code: code.value } });
    const payload = res.result || {};
    if (payload.success) {
      wx.showToast({ title: '验证成功', icon: 'success' });
      finish(true, '邮箱验证成功', '你现在可以发布教材与下单购买了（仍需通过企业微信身份认证）。');
    } else {
      error.value = payload.message || '验证码不正确，请重试';
    }
  } catch (e) {
    error.value = '网络异常，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

async function resend() {
  if (resending.value || countdown.value > 0) return;
  resending.value = true;
  error.value = '';
  try {
    const res = await wx.cloud.callFunction({ name: 'resendVerification', data: {} });
    const payload = res.result || {};
    if (payload.success) {
      startCountdown(payload.resendAfterSeconds || 60);
      wx.showToast({ title: '验证码已发送', icon: 'success' });
      // 邮件通道不可用时服务端会把验证码回传，直接填进输入框，省得再找管理员要
      if (payload.devEmailCode) {
        code.value = payload.devEmailCode;
        wx.showToast({ title: '邮件不可用，已自动填入', icon: 'none' });
      }
    } else {
      error.value = payload.message || '发送失败，请稍后再试';
    }
  } catch (e) {
    error.value = '网络异常，请稍后重试';
  } finally {
    resending.value = false;
  }
}

function goProfile() { wx.switchTab({ url: '/pages/profile/profile' }); }
function goLogin() { wx.navigateTo({ url: '/pages/auth/auth?tab=login' }); }
</script>

<style scoped>
.page-container { min-height: 100vh; padding: 0 calc(32 * var(--rpx)) calc(40 * var(--rpx)); box-sizing: border-box; }
.page-nav { display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.card { display: flex; flex-direction: column; padding: calc(34 * var(--rpx)) calc(28 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; }
.result { align-items: center; text-align: center; }
.lead { color: #29443a; font-size: calc(27 * var(--rpx)); font-weight: 700; line-height: 1.6; }
.email { margin-top: calc(8 * var(--rpx)); color: #166a3f; font-size: calc(25 * var(--rpx)); font-weight: 700; }
.code-input { width: 100%; height: calc(104 * var(--rpx)); margin-top: calc(24 * var(--rpx)); padding: 0 calc(24 * var(--rpx)); border: calc(2 * var(--rpx)) solid #dfe4dd; border-radius: calc(18 * var(--rpx)); background: #fff; color: #29443a; font-size: calc(40 * var(--rpx)); font-weight: 700; letter-spacing: calc(10 * var(--rpx)); text-align: center; box-sizing: border-box; }
.code-input:focus { border-color: #166a3f; outline: none; }
.err { margin-top: calc(12 * var(--rpx)); color: #b35353; font-size: calc(23 * var(--rpx)); }
.primary-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(88 * var(--rpx)); margin-top: calc(22 * var(--rpx)); border: 0; border-radius: calc(18 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(28 * var(--rpx)); font-weight: 700; cursor: pointer; }
.primary-btn[disabled] { background: #c7cdd5; }
.ghost-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(80 * var(--rpx)); margin-top: calc(14 * var(--rpx)); border: calc(1 * var(--rpx)) solid #cfe0d4; border-radius: calc(18 * var(--rpx)); background: #fff; color: #166a3f; font-size: calc(25 * var(--rpx)); font-weight: 700; cursor: pointer; }
.ghost-btn[disabled] { color: #9aa7a0; border-color: #e6ebe7; }
.tip { margin-top: calc(20 * var(--rpx)); color: #8a9a90; font-size: calc(21 * var(--rpx)); line-height: 1.7; }
.icon { display: flex; align-items: center; justify-content: center; width: calc(96 * var(--rpx)); height: calc(96 * var(--rpx)); border-radius: 50%; font-size: calc(44 * var(--rpx)); font-weight: 750; }
.icon.ok { background: #e8f3ec; color: #166a3f; }
.icon.error { background: #fef0f0; color: #b35353; }
.title { margin-top: calc(20 * var(--rpx)); color: #29443a; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.desc { margin: calc(12 * var(--rpx)) 0 calc(26 * var(--rpx)); color: #7f8f86; font-size: calc(23 * var(--rpx)); line-height: 1.7; }
</style>
