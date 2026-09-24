<template>
  <view class="container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">个人资料</text></view>
    <text class="page-sub">这些信息会展示给交易对方，帮助你更快完成线下交付。</text>

    <!-- ========== 基础资料 ========== -->
    <view class="block">
      <view class="block-title">基础资料</view>
      <view class="card">
        <view class="avatar-block">
          <text class="label">个人头像</text>
          <button class="avatar-wrapper" type="button" @click="chooseAvatar">
            <img class="avatar-preview" :src="avatarUrl || '/images/demo-avatar.png'" />
            <text class="avatar-change">{{ avatarUrl ? '更换' : '上传' }}</text>
          </button>
        </view>
        <view class="divider"></view>
        <view class="form-item">
          <text class="label">昵称</text>
          <input class="input-field" type="text" placeholder="请输入昵称" maxlength="16" v-model="nickName" />
        </view>
        <view class="divider"></view>
        <view class="form-item form-item-col">
          <text class="label">个人简介<text class="label-opt">选填</text></text>
          <textarea class="input-textarea" placeholder="例如：水产学院大三，教材大多九成新，可送到图书馆门口" maxlength="120" v-model="bio" @input="onBioInput"></textarea>
          <text class="counter">{{ bio.length }}/120</text>
        </view>
      </view>
    </view>

    <!-- ========== 交易联系方式 ========== -->
    <view class="block">
      <view class="block-title">交易联系方式</view>
      <text class="block-note">登录邮箱只用于登录，不会作为交易联系方式展示。填写下面的联系方式，买家才能联系到你。</text>
      <view class="card">
        <view class="form-item">
          <text class="label">微信号</text>
          <input class="input-field" type="text" placeholder="选填" maxlength="20" v-model="contactWechat" />
        </view>
        <view class="divider"></view>
        <view class="form-item">
          <text class="label">QQ 号</text>
          <input class="input-field" type="text" inputmode="numeric" placeholder="选填" maxlength="12" v-model="contactQq" />
        </view>
        <view class="divider"></view>
        <view class="form-item">
          <text class="label">手机号</text>
          <input class="input-field" type="tel" inputmode="numeric" placeholder="选填" maxlength="11" v-model="contactPhone" />
        </view>
        <view class="divider"></view>
        <view class="form-item">
          <text class="label">常用交易地址 / 校区</text>
          <input class="input-field" type="text" placeholder="如：狮子山校区·图书馆门口" maxlength="60" v-model="meetPoint" />
        </view>
      </view>
    </view>

    <!-- ========== 隐私设置 ========== -->
    <view class="block">
      <view class="block-title">联系方式公开范围</view>
      <view class="card">
        <view class="vis-option" v-for="opt in visibilityOptions" :key="opt.key" @click="contactVisible = opt.key">
          <view class="vis-radio" :class="{ on: contactVisible === opt.key }"></view>
          <view class="vis-copy">
            <text class="vis-label">{{ opt.label }}</text>
            <text class="vis-desc">{{ opt.desc }}</text>
          </view>
        </view>
      </view>
      <text class="block-note vis-tip">默认「仅交易对方可见」：有人确认购买你的书、或你确认购买他人的书之后，双方才能互相看到联系方式。</text>
    </view>

    <button class="save-btn" :disabled="saving" @click="saveProfile">{{ saving ? '保存中…' : '保存资料' }}</button>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import * as wx from '../services/wx';
import { globalData, notifyPagesLoginStateChanged, refreshUserProfile } from '../store';

const avatarUrl = ref('');
const nickName = ref('');
const contactQq = ref('');
const contactWechat = ref('');
const contactPhone = ref('');
const meetPoint = ref('');
const bio = ref('');
const contactVisible = ref('order_only');
const saving = ref(false);

const visibilityOptions = [
  { key: 'order_only', label: '仅交易对方可见（推荐）', desc: '确认订单后双方互相可见，其他人只看到锁定提示' },
  { key: 'public', label: '所有登录用户可见', desc: '方便快速对接，但联系方式会公开在书籍/求购详情页' },
  { key: 'private', label: '不公开', desc: '任何人（含交易对方）都看不到，交易请通过订单页沟通' }
];

onMounted(async () => {
  // 优先用服务端最新值，避免本地缓存里的旧资料覆盖（也防止回显不全）
  const fresh = await refreshUserProfile().catch(() => null);
  const userInfo = (fresh && fresh.user_id ? fresh : wx.getStorageSync('userInfo')) || {};
  avatarUrl.value = userInfo.avatar_url || userInfo.avatarUrl || '';
  nickName.value = userInfo.nick_name || userInfo.nickName || '';
  contactQq.value = userInfo.contactQq || '';
  contactWechat.value = userInfo.contactWechat || '';
  contactPhone.value = userInfo.contactPhone || '';
  meetPoint.value = userInfo.defaultMeetPoint || '';
  bio.value = userInfo.bio || '';
  contactVisible.value = userInfo.contactVisible || 'order_only';
});

function goBack() { wx.navigateBack(); }
function onBioInput(e) { bio.value = (e && e.target && e.target.value) || ''; }

// 等价小程序 open-type="chooseAvatar"：H5 用文件选择 + 压缩 dataURL
function chooseAvatar() {
  wx.chooseMedia({ count: 1 }).then(res => {
    avatarUrl.value = res.tempFiles[0].tempFilePath;
  }).catch(() => { /* 用户取消 */ });
}

// 校验规则与服务端保持一致；前端先拦一道只是为了少一次无效请求
function validate() {
  const name = nickName.value.trim();
  if (!name) return '昵称不能为空或纯空格';
  if (name.length > 16) return '昵称最长 16 个字符';
  if (contactWechat.value.trim() && !/^[A-Za-z0-9_-]{2,20}$/.test(contactWechat.value.trim())) {
    return '微信号应为 2-20 位字母、数字、下划线或减号';
  }
  if (contactQq.value.trim() && !/^\d{5,12}$/.test(contactQq.value.trim())) return 'QQ 号应为 5-12 位数字';
  if (contactPhone.value.trim() && !/^1[3-9]\d{9}$/.test(contactPhone.value.trim())) return '手机号格式不正确';
  if (meetPoint.value.trim().length > 60) return '常用交易地址最长 60 个字符';
  if (bio.value.trim().length > 120) return '个人简介最长 120 个字符';
  return '';
}

async function saveProfile() {
  if (saving.value) return;
  const problem = validate();
  if (problem) { wx.showToast({ title: problem, icon: 'none', duration: 2500 }); return; }

  saving.value = true;
  wx.showLoading({ title: '保存中...' });
  try {
    // 头像若为新选的 dataURL，先上传拿到真实地址，避免把 base64 塞进数据库
    let finalAvatarUrl = avatarUrl.value;
    if (finalAvatarUrl && finalAvatarUrl.startsWith('data:')) {
      const uploadRes = await wx.cloud.uploadFile({ filePath: finalAvatarUrl, type: 'public' });
      if (!uploadRes.fileID) throw new Error(uploadRes.message || '头像上传失败');
      finalAvatarUrl = uploadRes.fileID;
    }

    // 1. 昵称走专用接口（服务端校验，ID 与昵称分离，全站列表实时同步）
    const nickRes = await wx.cloud.callFunction({ name: 'updateNickname', data: { nickName: nickName.value.trim() } });
    if (!nickRes.result || !nickRes.result.success) {
      throw new Error((nickRes.result && nickRes.result.message) || '昵称保存失败');
    }

    // 2. 交易资料走资料接口（服务端逐字段校验并回传完整度）
    const res = await wx.cloud.callFunction({
      name: 'updateUserProfile',
      data: {
        updatedProfileData: {
          avatarUrl: finalAvatarUrl,
          contactQq: contactQq.value.trim(),
          contactWechat: contactWechat.value.trim(),
          contactPhone: contactPhone.value.trim(),
          defaultMeetPoint: meetPoint.value.trim(),
          bio: bio.value.trim(),
          contactVisible: contactVisible.value
        }
      }
    });
    if (!res.result || !res.result.success) {
      throw new Error((res.result && res.result.message) || '保存失败');
    }

    wx.hideLoading();
    const saved = res.result.data || {};
    const newUserInfo = {
      ...wx.getStorageSync('userInfo'),
      ...saved,
      avatar_url: finalAvatarUrl,
      avatarUrl: finalAvatarUrl,
      nick_name: nickName.value.trim(),
      nickName: nickName.value.trim()
    };
    globalData.userInfo = newUserInfo;
    globalData.profileCompleteness = res.result.profileCompleteness || globalData.profileCompleteness;
    wx.setStorageSync('userInfo', newUserInfo);
    notifyPagesLoginStateChanged(true, newUserInfo);
    wx.showToast({ title: '保存成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 800);
  } catch (error) {
    wx.hideLoading();
    console.error('[EditProfile] saveProfile failed:', error);
    wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none', duration: 2500 });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.container { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(150 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(104 * var(--rpx)); }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(26 * var(--rpx)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.page-sub { display: block; margin-bottom: calc(18 * var(--rpx)); padding: 0 calc(4 * var(--rpx)); color: #8b9f91; font-size: calc(21 * var(--rpx)); line-height: 1.45; }

.block { margin-bottom: calc(22 * var(--rpx)); }
.block-title { position: relative; margin: 0 0 calc(10 * var(--rpx)) calc(6 * var(--rpx)); padding-left: calc(15 * var(--rpx)); color: #166a3f; font-size: calc(27 * var(--rpx)); font-weight: 780; }
.block-title::before { position: absolute; top: calc(5 * var(--rpx)); left: 0; width: calc(6 * var(--rpx)); height: calc(25 * var(--rpx)); border-radius: calc(4 * var(--rpx)); background: #d9a62e; content: ''; }
.block-note { display: block; margin: 0 calc(6 * var(--rpx)) calc(11 * var(--rpx)); color: #94a09a; font-size: calc(20 * var(--rpx)); line-height: 1.45; }
.vis-tip { margin: calc(11 * var(--rpx)) calc(6 * var(--rpx)) 0; }

.card { padding: 0 calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(20 * var(--rpx)) rgba(22, 106, 63,.03); }
.avatar-block { display: flex; align-items: center; justify-content: space-between; padding: calc(24 * var(--rpx)) 0; }
.label { color: #3d594c; font-size: calc(26 * var(--rpx)); font-weight: 650; }
.label-opt { margin-left: calc(8 * var(--rpx)); color: #a8b3ac; font-size: calc(19 * var(--rpx)); font-weight: 500; }
.avatar-wrapper { display: flex; align-items: center; margin: 0; padding: 0; background: transparent; cursor: pointer; }
.avatar-preview { width: calc(92 * var(--rpx)); height: calc(92 * var(--rpx)); border-radius: 50%; background: #eff3ef; object-fit: cover; }
.avatar-change { margin-left: calc(12 * var(--rpx)); color: #5a856f; font-size: calc(22 * var(--rpx)); }
.divider { height: calc(1 * var(--rpx)); background: #f0eeea; }
.form-item { display: flex; align-items: center; min-height: calc(94 * var(--rpx)); }
.form-item-col { flex-direction: column; align-items: stretch; padding: calc(20 * var(--rpx)) 0 calc(16 * var(--rpx)); }
.form-item-col .label { margin-bottom: calc(12 * var(--rpx)); }
.input-field { flex: 1; min-width: 0; color: #566f62; font-size: calc(25 * var(--rpx)); text-align: right; }
.input-textarea { width: 100%; min-height: calc(140 * var(--rpx)); padding: calc(14 * var(--rpx)) calc(16 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e6ece4; border-radius: calc(14 * var(--rpx)); background: #fafcf9; color: #566f62; font-size: calc(24 * var(--rpx)); line-height: 1.5; box-sizing: border-box; resize: none; }
.counter { margin-top: calc(8 * var(--rpx)); color: #a8b3ac; font-size: calc(19 * var(--rpx)); text-align: right; }

.vis-option { display: flex; align-items: flex-start; padding: calc(20 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #f0eeea; cursor: pointer; }
.vis-option:last-child { border-bottom: none; }
.vis-radio { flex-shrink: 0; width: calc(34 * var(--rpx)); height: calc(34 * var(--rpx)); margin: calc(4 * var(--rpx)) calc(16 * var(--rpx)) 0 0; border: calc(2 * var(--rpx)) solid #cfd8d2; border-radius: 50%; box-sizing: border-box; position: relative; }
.vis-radio.on { border-color: #166a3f; background: #166a3f; }
.vis-radio.on::after { position: absolute; top: calc(7 * var(--rpx)); left: calc(7 * var(--rpx)); width: calc(14 * var(--rpx)); height: calc(14 * var(--rpx)); border-radius: 50%; background: #fff; content: ''; }
.vis-copy { flex: 1; min-width: 0; }
.vis-label { display: block; color: #3d594c; font-size: calc(25 * var(--rpx)); font-weight: 650; }
.vis-desc { display: block; margin-top: calc(6 * var(--rpx)); color: #94a09a; font-size: calc(20 * var(--rpx)); line-height: 1.45; }

/* 保存按钮吸底：资料项多、滚动到底才能存太反直觉，这里让它常驻可视区。
 * ⚠️ position:fixed 的定位基准是**视口**，不是 #app 这个 480px 居中列。
 *    只写 left/right: 24rpx 的话，PC 宽屏上按钮会横跨整个浏览器窗口（H5 不适配）。
 *    必须补 max-width + margin:auto 把它约束回容器内 —— 与 Publish / Checkout 的吸底条同一写法。 */
.save-btn { position: fixed; right: calc(24 * var(--rpx)); bottom: calc(18 * var(--rpx) + env(safe-area-inset-bottom)); left: calc(24 * var(--rpx)); z-index: 60; display: flex; align-items: center; justify-content: center; width: auto; max-width: calc(var(--app-max-width) - calc(48 * var(--rpx))); height: calc(84 * var(--rpx)); margin: 0 auto; border-radius: calc(17 * var(--rpx)); background: #166a3f !important; color: #fff; font-size: calc(28 * var(--rpx)); font-weight: 700; line-height: calc(84 * var(--rpx)); box-shadow: 0 calc(10 * var(--rpx)) calc(24 * var(--rpx)) rgba(22, 106, 63,.28); }
.save-btn[disabled] { opacity: .72; }
</style>
