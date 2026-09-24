<template>
  <view class="page-container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">身份认证</text></view>

    <view class="verify-card" v-if="status === 'approved'">
      <view class="status-icon approved">✓</view>
      <view class="status-title">已完成身份认证</view>
      <view class="status-desc">你可以正常发布教材、发布求购与确认购买。</view>
    </view>

    <view class="verify-card" v-else-if="status === 'pending'">
      <view class="status-icon pending">…</view>
      <view class="status-title">资料已提交，请等待管理员审核</view>
      <view class="status-desc">审核通过后即可正常使用平台全部功能，一般 24 小时内完成。</view>
      <img class="proof-preview" v-if="proofDisplay" :src="proofDisplay" @click="previewProof" />
    </view>

    <template v-else>
      <view class="verify-card" v-if="status === 'rejected'">
        <view class="status-icon rejected">✕</view>
        <view class="status-title">认证未通过</view>
        <view class="reject-reason-box">
          <text class="reject-reason-label">拒绝原因</text>
          <text class="reject-reason-text">{{ rejectReason || '管理员未填写具体原因' }}</text>
        </view>
        <view class="status-desc">请按上面的原因补充材料后重新提交。如有疑问可联系管理员。</view>
      </view>

      <view class="contact-card" @click="copyWechat">
        <view class="contact-copy">
          <text class="contact-title">认证遇到问题？联系管理员</text>
          <text class="contact-sub">微信：{{ adminWechat }}（点击复制）</text>
        </view>
        <text class="contact-action">复制</text>
      </view>

      <view class="section">
        <view class="section-title">上传企业微信截图</view>
        <view class="section-desc">请上传能够证明本人身份的企业微信/相关身份截图（如企业微信「我」页面），管理员审核通过后即可正常使用平台。</view>
        <view class="upload-area" @click="chooseProof">
          <template v-if="proofDisplay">
            <view class="proof-wrap">
              <img class="proof-preview" :src="proofDisplay" @click.stop="previewProof" />
              <!-- 右上角 ×：认证被拒后想换新图，先删掉旧图才能重新选 -->
              <view class="delete-icon" @click.stop="removeProof">×</view>
            </view>
            <view class="proof-actions">
              <text class="proof-action" @click.stop="chooseProof">重新选择</text>
              <text class="proof-action danger" @click.stop="removeProof">删除这张</text>
            </view>
          </template>
          <template v-else>
            <text class="upload-icon">＋</text>
            <text class="upload-text">点击上传截图</text>
          </template>
        </view>
        <view class="upload-tip">
          {{ proofDisplay ? '点图片可放大；换图请先点右上角 × 删除，或直接点「重新选择」' : '截图仅管理员可见，不会公开展示' }}
        </view>
        <button class="submit-btn" :disabled="submitting || !proofImage" @click="submitVerification">
          {{ submitting ? '提交中…' : (status === 'rejected' ? '重新提交审核' : '提交审核') }}
        </button>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import * as wx from '../services/wx';
import { globalData, refreshUserProfile } from '../store';
import { loadPrivateImage } from '../services/server';
import { ADMIN_WECHAT_TEXT, copyAdminWechat } from '../services/contact';

const adminWechat = ADMIN_WECHAT_TEXT;

const status = ref('none');
const rejectReason = ref('');
const proofImage = ref('');
const proofDisplay = ref('');
const submitting = ref(false);

onMounted(() => { loadStatus(); });

async function setProof(url) {
  proofImage.value = url;
  proofDisplay.value = url.startsWith('/api/files/private/') ? await loadPrivateImage(url) : url;
}

async function loadStatus() {
  status.value = globalData.verifyStatus || 'none';
  try {
    const res = await wx.cloud.callFunction({ name: 'getMyVerification' });
    if (res.result && res.result.success && res.result.data) {
      status.value = res.result.data.verifyStatus || 'none';
      rejectReason.value = res.result.data.rejectReason || '';
      // 同步全局身份状态（管理员刚审核通过时，用户无需重进即可生效）
      globalData.verifyStatus = status.value;
      if (status.value === 'approved' && globalData.userInfo) {
        globalData.userInfo.verifyStatus = 'approved';
        wx.setStorageSync('userInfo', globalData.userInfo);
      }
      if (res.result.data.verifyStatus !== 'approved' && res.result.data.proofImage) {
        await setProof(res.result.data.proofImage);
      }
    }
  } catch (e) { /* 状态加载失败用全局状态兜底 */ }
}

function chooseProof() {
  wx.chooseMedia({ count: 1 }).then(res => {
    proofImage.value = res.tempFiles[0].tempFilePath;
    proofDisplay.value = res.tempFiles[0].tempFilePath;
  }).catch(() => { /* 取消选择 */ });
}

function previewProof() {
  wx.previewImage({ current: proofDisplay.value, urls: [proofDisplay.value] });
}

// 清除当前截图（旧图删掉后才会露出「＋ 点击上传」）。
// 只清前端选择，不动服务端 —— 提交时会用新图覆盖 verifications.proofImage。
function removeProof() {
  proofImage.value = '';
  proofDisplay.value = '';
}

async function submitVerification() {
  if (!proofImage.value || submitting.value) return;
  submitting.value = true;
  wx.showLoading({ title: '提交中…', mask: true });
  try {
    let proofUrl = proofImage.value;
    // 本地图片先上传（私有存储，仅本人与管理员可见）
    if (proofImage.value.startsWith('data:')) {
      const uploadRes = await wx.cloud.uploadFile({ filePath: proofImage.value, type: 'proof' });
      if (!uploadRes.fileID) throw new Error(uploadRes.message || '截图上传失败，请重试');
      proofUrl = uploadRes.fileID;
    }
    const res = await wx.cloud.callFunction({ name: 'submitVerification', data: { proofImage: proofUrl } });
    wx.hideLoading();
    if (res.result && res.result.success) {
      await refreshUserProfile();
      status.value = 'pending';
      wx.showToast({ title: '已提交，等待审核', icon: 'success' });
    } else {
      throw new Error((res.result && res.result.message) || '提交失败');
    }
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: (e && e.message) || '提交失败，请重试', icon: 'none', duration: 2500 });
  } finally {
    submitting.value = false;
  }
}

function goBack() { wx.navigateBack(); }

async function copyWechat() { await copyAdminWechat(wx); }
</script>

<style scoped>
.page-container { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(40 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.verify-card { display: flex; flex-direction: column; align-items: center; margin-bottom: calc(18 * var(--rpx)); padding: calc(40 * var(--rpx)) calc(28 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; text-align: center; }
.status-icon { display: flex; align-items: center; justify-content: center; width: calc(96 * var(--rpx)); height: calc(96 * var(--rpx)); margin-bottom: calc(20 * var(--rpx)); border-radius: 50%; font-size: calc(44 * var(--rpx)); font-weight: 750; }
.status-icon.approved { background: #e8f3ec; color: #166a3f; }
.status-icon.pending { background: #f0f6fa; color: #4a6b8a; }
.status-icon.rejected { background: #fef0f0; color: #b35353; }
.status-title { color: #29443a; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.status-desc { margin-top: calc(12 * var(--rpx)); color: #83998d; font-size: calc(23 * var(--rpx)); line-height: 1.6; }
.reject-reason-box { display: flex; flex-direction: column; align-items: flex-start; width: 100%; margin-top: calc(18 * var(--rpx)); padding: calc(20 * var(--rpx)) calc(22 * var(--rpx)); border-left: calc(6 * var(--rpx)) solid #d0685f; border-radius: calc(12 * var(--rpx)); background: #fdf1f0; box-sizing: border-box; text-align: left; }
.reject-reason-label { color: #b35353; font-size: calc(21 * var(--rpx)); font-weight: 700; }
.reject-reason-text { margin-top: calc(8 * var(--rpx)); color: #7d3f3f; font-size: calc(25 * var(--rpx)); line-height: 1.6; font-weight: 600; }
.contact-card { display: flex; align-items: center; justify-content: space-between; margin-bottom: calc(18 * var(--rpx)); padding: calc(22 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e3e7e0; border-radius: calc(18 * var(--rpx)); background: #fbfdfa; cursor: pointer; }
.contact-copy { display: flex; flex-direction: column; }
.contact-title { color: #29443a; font-size: calc(25 * var(--rpx)); font-weight: 700; }
.contact-sub { margin-top: calc(6 * var(--rpx)); color: #71877b; font-size: calc(22 * var(--rpx)); }
.contact-action { padding: calc(10 * var(--rpx)) calc(22 * var(--rpx)); border-radius: calc(24 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(22 * var(--rpx)); font-weight: 700; white-space: nowrap; }
.section { padding: calc(26 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; }
.section-title { color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.section-desc { margin-top: calc(14 * var(--rpx)); color: #62786c; font-size: calc(23 * var(--rpx)); line-height: 1.7; }
.upload-area { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: calc(320 * var(--rpx)); margin-top: calc(22 * var(--rpx)); border: calc(2 * var(--rpx)) dashed #c8d8cc; border-radius: calc(18 * var(--rpx)); background: #fafbfc; cursor: pointer; overflow: hidden; }
.upload-icon { color: #527861; font-size: calc(60 * var(--rpx)); line-height: 1; }
.upload-text { margin-top: calc(12 * var(--rpx)); color: #83998d; font-size: calc(24 * var(--rpx)); }
.proof-preview { width: 100%; max-height: calc(500 * var(--rpx)); margin-top: calc(16 * var(--rpx)); border-radius: calc(12 * var(--rpx)); object-fit: contain; }
.upload-area .proof-preview { margin-top: 0; }
.proof-wrap { position: relative; width: 100%; }
.delete-icon { position: absolute; top: 0; right: 0; display: flex; align-items: center; justify-content: center; width: calc(40 * var(--rpx)); height: calc(40 * var(--rpx)); border-radius: 0 calc(12 * var(--rpx)) 0 calc(14 * var(--rpx)); background: rgba(22, 106, 63,.78); color: #fff; font-size: calc(28 * var(--rpx)); font-weight: 700; cursor: pointer; }
.proof-actions { display: flex; align-items: center; justify-content: center; gap: calc(20 * var(--rpx)); margin-top: calc(16 * var(--rpx)); }
.proof-action { padding: calc(12 * var(--rpx)) calc(26 * var(--rpx)); border: calc(1 * var(--rpx)) solid #c8d8cc; border-radius: calc(26 * var(--rpx)); background: #fff; color: #527861; font-size: calc(23 * var(--rpx)); font-weight: 700; cursor: pointer; }
.proof-action.danger { border-color: #e6c3c3; color: #b35353; }
.upload-tip { margin-top: calc(14 * var(--rpx)); color: #a4b0a7; font-size: calc(20 * var(--rpx)); text-align: center; }
.submit-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(84 * var(--rpx)); margin-top: calc(24 * var(--rpx)); border: 0; border-radius: calc(17 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(28 * var(--rpx)); font-weight: 700; cursor: pointer; }
.submit-btn[disabled] { background: #c7cdd5; }
</style>
