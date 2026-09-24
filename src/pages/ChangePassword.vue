<template>
  <view class="page-container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">修改密码</text></view>

    <view class="intro">
      <text class="intro-title">账号安全</text>
      <text class="intro-desc">修改成功后，你在其他设备上的登录会全部失效，需要用新密码重新登录。</text>
    </view>

    <view class="card">
      <view class="field">
        <text class="field-label">当前密码</text>
        <view class="input-wrap">
          <input class="input" :type="show.old ? 'text' : 'password'" v-model="oldPassword" placeholder="请输入当前密码" autocomplete="current-password" />
          <text class="eye" :class="{ on: show.old }" @click="show.old = !show.old">{{ show.old ? '🙈' : '👁' }}</text>
        </view>
      </view>

      <view class="field">
        <text class="field-label">新密码</text>
        <view class="input-wrap">
          <input class="input" :type="show.next ? 'text' : 'password'" v-model="newPassword" placeholder="至少 8 位，含字母和数字" autocomplete="new-password" />
          <text class="eye" :class="{ on: show.next }" @click="show.next = !show.next">{{ show.next ? '🙈' : '👁' }}</text>
        </view>
        <!-- 大小写和符号是最容易出错的地方，实时给一条强度提示 -->
        <text class="field-hint" :class="{ ok: strength.ok }">{{ strength.text }}</text>
      </view>

      <view class="field">
        <text class="field-label">确认新密码</text>
        <view class="input-wrap">
          <input class="input" :type="show.confirm ? 'text' : 'password'" v-model="confirmPassword" placeholder="再次输入新密码" autocomplete="new-password" @keyup.enter="submit" />
          <text class="eye" :class="{ on: show.confirm }" @click="show.confirm = !show.confirm">{{ show.confirm ? '🙈' : '👁' }}</text>
        </view>
        <text class="field-hint" v-if="confirmPassword && !samePassword">两次输入的密码不一致</text>
      </view>

      <view class="err" v-if="error">{{ error }}</view>
      <button class="primary-btn" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : '确认修改' }}</button>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import * as wx from '../services/wx';
import { globalData, refreshUserProfile } from '../store';

const oldPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const error = ref('');
// 每个输入框独立的显示/隐藏开关：三个框分别看，避免"看了一个全暴露"
const show = reactive({ old: false, next: false, confirm: false });

const samePassword = computed(() => !confirmPassword.value || newPassword.value === confirmPassword.value);
const strength = computed(() => {
  const pwd = newPassword.value;
  if (!pwd) return { ok: false, text: '密码需至少 8 位，且同时包含字母和数字' };
  if (pwd.length < 8) return { ok: false, text: `还差 ${8 - pwd.length} 位（至少 8 位）` };
  if (!/[A-Za-z]/.test(pwd)) return { ok: false, text: '需包含字母' };
  if (!/\d/.test(pwd)) return { ok: false, text: '需包含数字' };
  return { ok: true, text: '密码格式符合要求' };
});

function goBack() { wx.navigateBack(); }

async function submit() {
  if (submitting.value) return;
  error.value = '';
  if (!oldPassword.value) { error.value = '请输入当前密码'; return; }
  if (!strength.value.ok) { error.value = strength.value.text; return; }
  if (newPassword.value !== confirmPassword.value) { error.value = '两次输入的密码不一致'; return; }
  if (newPassword.value === oldPassword.value) { error.value = '新密码不能与当前密码相同'; return; }

  submitting.value = true;
  wx.showLoading({ title: '提交中…', mask: true });
  try {
    const res = await wx.cloud.callFunction({
      name: 'changePassword',
      data: { oldPassword: oldPassword.value, newPassword: newPassword.value, confirmPassword: confirmPassword.value }
    });
    wx.hideLoading();
    if (res.result && res.result.success) {
      // 服务端会吊销其他会话并下发新的令牌对（services/server 已自动保存），这里同步刷新一次资料
      await refreshUserProfile().catch(() => {});
      wx.showToast({ title: '密码已更新', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 900);
    } else {
      error.value = (res.result && res.result.message) || '修改失败';
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

.intro { margin-bottom: calc(18 * var(--rpx)); padding: calc(20 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #f0e3c2; border-radius: calc(18 * var(--rpx)); background: linear-gradient(135deg, #fffdf6, #fdf8ea); }
.intro-title { display: block; color: #a37a12; font-size: calc(25 * var(--rpx)); font-weight: 750; }
.intro-desc { display: block; margin-top: calc(7 * var(--rpx)); color: #a08b55; font-size: calc(21 * var(--rpx)); line-height: 1.5; }

.card { display: flex; flex-direction: column; padding: calc(26 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(20 * var(--rpx)) rgba(22, 106, 63,.03); }
.field { margin-bottom: calc(20 * var(--rpx)); }
.field-label { display: block; margin-bottom: calc(10 * var(--rpx)); color: #3d594c; font-size: calc(24 * var(--rpx)); font-weight: 650; }
.input-wrap { display: flex; align-items: center; height: calc(88 * var(--rpx)); padding: 0 calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe4dd; border-radius: calc(16 * var(--rpx)); background: #fff; box-sizing: border-box; }
.input-wrap:focus-within { border-color: #166a3f; }
.input { flex: 1; min-width: 0; border: 0; background: transparent; color: #29443a; font-size: calc(26 * var(--rpx)); outline: none; }
.eye { margin-left: calc(12 * var(--rpx)); padding: calc(6 * var(--rpx)); font-size: calc(30 * var(--rpx)); line-height: 1; cursor: pointer; opacity: .55; user-select: none; }
.eye.on { opacity: 1; }
.field-hint { display: block; margin-top: calc(8 * var(--rpx)); color: #b35353; font-size: calc(20 * var(--rpx)); }
.field-hint.ok { color: #3d7a55; }
.err { margin-bottom: calc(14 * var(--rpx)); color: #b35353; font-size: calc(23 * var(--rpx)); }
.primary-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(88 * var(--rpx)); border: 0; border-radius: calc(18 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(29 * var(--rpx)); font-weight: 700; cursor: pointer; }
.primary-btn[disabled] { background: #c7cdd5; }
</style>
