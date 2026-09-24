<template>
  <view class="container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">{{ requestId ? '编辑求购' : '发布求购' }}</text></view>
    <form @submit.prevent="submitRequestForm">
      <view class="form-intro"><view class="intro-title">告诉同学，你正在寻找什么</view><view class="intro-desc">清楚的课程信息和预算，会让回应更快。</view></view>
      <view class="section info-input-section">
        <view class="section-title">求购信息</view>
        <view class="input-row image-upload-row">
          <view class="label">参考封面</view>
          <view class="image-uploader-container">
            <view class="image-preview-wrapper" v-if="formData.coverImageUrl">
              <img class="preview-image" :src="formData.coverImageUrl" @click="previewUploadedImage" />
              <view class="remove-image-btn" @click="removeCoverImage">×</view>
            </view>
            <view class="upload-btn-wrapper" v-else @click="chooseCoverImage"><text class="upload-icon">＋</text><text class="upload-text">添加封面</text></view>
          </view>
        </view>
        <view class="input-row"><view class="label">期望价格</view><input class="input-field price-input" name="expectedPrice" type="text" inputmode="decimal" v-model="formData.expectedPrice" placeholder="请输入预算" /></view>
        <view class="input-row"><view class="label">课程编号</view><input class="input-field" name="courseCode" type="text" v-model="formData.courseCode" placeholder="选填" /></view>
        <view class="input-row">
          <view class="label">专业</view>
          <select class="input-field major-select" name="major" :value="selectedMajorIndex === null ? '' : selectedMajorIndex" @change="onMajorChange">
            <option value="" disabled>{{ selectedMajorName || '请选择专业（选填）' }}</option>
            <option v-for="(major, i) in majorOptions" :key="major" :value="i">{{ major }}</option>
          </select>
        </view>
        <view class="input-row">
          <view class="label">年级</view>
          <select class="input-field major-select" name="grade" :value="selectedGradeIndex === null ? '' : selectedGradeIndex" @change="onGradeChange">
            <option value="" disabled>{{ selectedGradeName || '请选择年级（选填）' }}</option>
            <option v-for="(grade, i) in gradeOptions" :key="grade" :value="i">{{ grade }}</option>
          </select>
        </view>
        <view class="input-row"><view class="label">书名</view><input class="input-field" name="title" type="text" v-model="formData.title" placeholder="请输入书名" /></view>
        <view class="input-row"><view class="label">作者</view><input class="input-field" name="author" type="text" v-model="formData.author" placeholder="选填" /></view>
        <view class="textarea-row">
          <view class="label">补充说明</view>
          <textarea class="description-input" name="description" v-model="formData.description" placeholder="版本、品相、时间等要求" maxlength="200"></textarea>
        </view>
      </view>
      <!-- 交易信息：默认从个人资料带出，改过的值回写资料 -->
      <view class="section trade-contact-section">
        <view class="section-title-row">
          <view class="section-title">交易信息</view>
          <view class="section-tag auto-tag">已按个人资料带出</view>
        </view>
        <view class="section-tip">填一次，以后发布自动带出，不用重复输入；留空也不影响发布，下次可以再补。</view>
        <view class="input-row"><view class="label">微信号</view><input class="input-field" type="text" maxlength="20" v-model="tradeContact.contactWechat" placeholder="选填" /></view>
        <view class="input-row"><view class="label">QQ 号</view><input class="input-field" type="text" inputmode="numeric" maxlength="12" v-model="tradeContact.contactQq" placeholder="选填" /></view>
        <view class="input-row"><view class="label">手机号</view><input class="input-field" type="tel" inputmode="numeric" maxlength="11" v-model="tradeContact.contactPhone" placeholder="选填" /></view>
        <view class="input-row"><view class="label">面交地点</view><input class="input-field" type="text" maxlength="60" v-model="tradeContact.defaultMeetPoint" placeholder="选填，如：狮子山校区·图书馆门口" /></view>
        <view class="visibility-hint" :class="'vis-' + contactVisible">{{ visibilityHint }}</view>
      </view>

      <view class="submit-button-container">
        <button class="submit-button" type="submit" :disabled="submitting">{{ requestId ? '保存修改' : '发布求购需求' }}</button>
        <button class="delete-button" v-if="requestId" type="button" @click="deleteRequest" :disabled="submitting">删除此求购</button>
      </view>
    </form>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';
import { globalData, requireApproved } from '../store';
import { MAJORS, GRADES } from '../services/catalog';
import { emptyTradeContact, loadTradeContact, syncTradeContact, validateTradeContact, tradeVisibilityHint } from '../services/tradeContact';

const route = useRoute();
const requestId = ref(null);
const formData = reactive({
  coverImageUrl: '', expectedPrice: '', courseCode: '', major: '', grade: '', title: '', author: '', description: ''
});
const majorOptions = MAJORS;
const gradeOptions = GRADES;
const selectedMajorIndex = ref(null);
const selectedMajorName = ref('');
const selectedGradeIndex = ref(null);
const selectedGradeName = ref('');
const tempFileForUpload = ref(null);
const submitting = ref(false);

// 交易信息：默认从个人资料带出，用户改过的值在提交时回写资料
const tradeContact = reactive(emptyTradeContact());
const tradeBaseline = ref(emptyTradeContact());
const contactVisible = ref('order_only');
const visibilityHint = ref('');

onMounted(async () => {
  const options = route.query;
  if (options.id) {
    requestId.value = options.id;
    wx.setNavigationBarTitle({ title: '编辑求购' });
    await loadRequestDataFromServer(options.id);
  } else {
    wx.setNavigationBarTitle({ title: '发布求购' });
    Object.assign(formData, { coverImageUrl: '', expectedPrice: '', courseCode: '', major: '', grade: '', title: '', author: '', description: '' });
    selectedMajorIndex.value = null;
    selectedMajorName.value = '';
    selectedGradeIndex.value = null;
    selectedGradeName.value = '';
    tempFileForUpload.value = null;
    requestId.value = null;
  }
  await loadTradeContactDefaults();
});

// 交易信息默认带出：填过就不用再敲一遍
async function loadTradeContactDefaults() {
  try {
    const { fields, contactVisible: mode } = await loadTradeContact();
    Object.assign(tradeContact, fields);
    tradeBaseline.value = { ...fields };
    contactVisible.value = mode;
    visibilityHint.value = tradeVisibilityHint(mode);
    // 面交地点顺手写进补充说明，回应你的同学一眼看到在哪交付
    if (!requestId.value && !formData.description.trim() && fields.defaultMeetPoint) {
      formData.description = `期望面交地点：${fields.defaultMeetPoint}。`;
    }
  } catch (error) {
    console.warn('[PublishRequest] load trade contact failed:', error);
  }
}

function goBack() { wx.navigateBack(); }

function onMajorChange(e) {
  const index = e.target.value === '' ? null : Number(e.target.value);
  if (index !== null && majorOptions[index]) {
    selectedMajorIndex.value = index;
    selectedMajorName.value = majorOptions[index];
    formData.major = majorOptions[index];
  } else {
    selectedMajorIndex.value = null;
    selectedMajorName.value = '';
    formData.major = '';
  }
}

function onGradeChange(e) {
  const index = e.target.value === '' ? null : Number(e.target.value);
  if (index !== null && gradeOptions[index]) {
    selectedGradeIndex.value = index;
    selectedGradeName.value = gradeOptions[index];
    formData.grade = gradeOptions[index];
  } else {
    selectedGradeIndex.value = null;
    selectedGradeName.value = '';
    formData.grade = '';
  }
}

async function loadRequestDataFromServer(id) {
  if (!id) return;
  wx.showLoading({ title: '加载中...' });
  try {
    const res = await wx.cloud.callFunction({ name: 'getPurchaseRequestDetail', data: { requestId: id } });
    wx.hideLoading();
    if (res.result && res.result.success && res.result.data) {
      Object.assign(formData, {
        coverImageUrl: res.result.data.coverImageUrl || '',
        expectedPrice: res.result.data.expectedPrice || '',
        courseCode: res.result.data.courseCode || '',
        major: res.result.data.major || '',
        grade: res.result.data.grade || '',
        title: res.result.data.title || '',
        author: res.result.data.author || '',
        description: res.result.data.description || ''
      });
      const majorIndex = formData.major ? MAJORS.indexOf(formData.major) : -1;
      selectedMajorIndex.value = majorIndex >= 0 ? majorIndex : null;
      selectedMajorName.value = majorIndex >= 0 ? MAJORS[majorIndex] : (formData.major || '');
      const gradeIndex = formData.grade ? GRADES.indexOf(formData.grade) : -1;
      selectedGradeIndex.value = gradeIndex >= 0 ? gradeIndex : null;
      selectedGradeName.value = gradeIndex >= 0 ? GRADES[gradeIndex] : (formData.grade || '');
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载求购信息失败', icon: 'none' });
    }
  } catch (err) {
    wx.hideLoading();
    console.error('加载求购信息失败:', err);
    wx.showToast({ title: '加载失败，请重试', icon: 'none' });
  }
}

function chooseCoverImage() {
  wx.chooseMedia({ count: 1 }).then(res => {
    const tempFilePath = res.tempFiles[0].tempFilePath;
    formData.coverImageUrl = tempFilePath;
    tempFileForUpload.value = tempFilePath;
  }).catch(err => {
    if (err && err.errMsg !== 'chooseMedia:fail cancel') {
      wx.showToast({ title: '选择图片失败', icon: 'none' });
    }
  });
}

// H5 演示模式：dataURL 直接作为 fileID 返回（等价原 uploadFile 拦截逻辑）
async function uploadImageToCloudStorage(filePath) {
  if (!filePath || (!filePath.startsWith('data:') && !filePath.startsWith('blob:'))) {
    if (formData.coverImageUrl === filePath) return filePath;
    return null;
  }
  try {
    const uploadResult = await wx.cloud.uploadFile({
      cloudPath: `purchase_request_covers/${Date.now()}.jpg`,
      filePath
    });
    return uploadResult.fileID;
  } catch (err) {
    console.error('上传图片到云存储失败:', err);
    wx.showToast({ title: '封面上传失败', icon: 'none' });
    throw err;
  }
}

function removeCoverImage() {
  formData.coverImageUrl = '';
  tempFileForUpload.value = null;
}

function previewUploadedImage() {
  const previewUrl = formData.coverImageUrl;
  if (previewUrl) wx.previewImage({ current: previewUrl, urls: [previewUrl] });
}

async function submitRequestForm() {
  const values = formData;

  if (!(await requireApproved('发布求购'))) return;
  if (!values.title.trim()) { wx.showToast({ title: '请输入书名', icon: 'none' }); return; }
  if (!String(values.expectedPrice).trim() || isNaN(parseFloat(values.expectedPrice)) || parseFloat(values.expectedPrice) <= 0) {
    wx.showToast({ title: '请输入有效的期望价格', icon: 'none' }); return;
  }
  const contactProblem = validateTradeContact(tradeContact);
  if (contactProblem) { wx.showToast({ title: contactProblem, icon: 'none', duration: 2500 }); return; }

  submitting.value = true;
  wx.showLoading({ title: requestId.value ? '修改中...' : '发布中...', mask: true });

  let uploadedCoverFileID = values.coverImageUrl;

  if (tempFileForUpload.value) {
    try {
      uploadedCoverFileID = await uploadImageToCloudStorage(tempFileForUpload.value);
      if (!uploadedCoverFileID) {
        wx.hideLoading();
        submitting.value = false;
        return;
      }
    } catch (uploadError) {
      wx.hideLoading();
      submitting.value = false;
      return;
    }
  } else if (!values.coverImageUrl && requestId.value) {
    uploadedCoverFileID = '';
  }

  const requestPayload = {
    requestId: requestId.value || null,
    requestData: { ...values, coverImageUrl: uploadedCoverFileID }
  };

  try {
    // 交易信息被改过就回写个人资料 —— 下次发布自动带出，不用再打字
    const contactSync = await syncTradeContact(tradeContact, tradeBaseline.value);
    if (contactSync.changed) tradeBaseline.value = { ...tradeContact };

    const res = await wx.cloud.callFunction({ name: 'publishOrUpdateRequest', data: requestPayload });
    wx.hideLoading();
    if (res.result && res.result.success) {
      wx.showToast({ title: res.result.message || (requestId.value ? '修改成功' : '发布成功'), icon: 'success' });
      globalData.requestListNeedRefresh = true;
      setTimeout(() => { wx.navigateBack(); }, 1500);
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
    }
  } catch (err) {
    wx.hideLoading();
    console.error('调用 publishOrUpdateRequest 云函数失败:', err);
    wx.showToast({ title: '请求失败，请重试', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

function deleteRequest() {
  if (!requestId.value) return;
  wx.showModal({
    title: '确认删除',
    content: '确定要删除这条求购信息吗？',
    success: async res => {
      if (!res.confirm) return;
      submitting.value = true;
      wx.showLoading({ title: '删除中...', mask: true });
      try {
        const delRes = await wx.cloud.callFunction({ name: 'deletePurchaseRequest', data: { requestId: requestId.value } });
        wx.hideLoading();
        if (delRes.result && delRes.result.success) {
          wx.showToast({ title: '删除成功', icon: 'success' });
          globalData.requestListNeedRefresh = true;
          setTimeout(() => { wx.navigateBack(); }, 1500);
        } else {
          wx.showToast({ title: (delRes.result && delRes.result.message) || '删除失败', icon: 'none' });
        }
      } catch (err) {
        wx.hideLoading();
        console.error('调用 deletePurchaseRequest 云函数失败:', err);
        wx.showToast({ title: '删除请求失败', icon: 'none' });
      } finally {
        submitting.value = false;
      }
    }
  });
}
</script>

<style scoped>
.container { padding: 0 calc(24 * var(--rpx)) calc(180 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(104 * var(--rpx)); }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(26 * var(--rpx)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.form-intro { margin-bottom: calc(18 * var(--rpx)); padding: calc(24 * var(--rpx)); border-radius: calc(20 * var(--rpx)); background: #edf5ee; }
.intro-title { color: #1d5c38; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.intro-desc { margin-top: calc(8 * var(--rpx)); color: #6e8c7c; font-size: calc(22 * var(--rpx)); }
.section { padding: calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.03); }
.section-title { color: #166a3f; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.section-title-row { display: flex; align-items: center; justify-content: space-between; }
.section-tag { padding: calc(6 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(10 * var(--rpx)); font-size: calc(19 * var(--rpx)); }
.auto-tag { background: #e8f3ec; color: #166a3f; }
.section-tip { margin-top: calc(10 * var(--rpx)); color: #94a09a; font-size: calc(20 * var(--rpx)); line-height: 1.5; }
.trade-contact-section { margin-bottom: calc(18 * var(--rpx)); }
.visibility-hint { margin-top: calc(14 * var(--rpx)); padding: calc(14 * var(--rpx)) calc(16 * var(--rpx)); border-radius: calc(12 * var(--rpx)); font-size: calc(20 * var(--rpx)); line-height: 1.5; }
.visibility-hint.vis-order_only { background: #edf5ee; color: #166a3f; }
.visibility-hint.vis-public { background: #fdf6e3; color: #9a7a38; }
.visibility-hint.vis-private { background: #fdf0ef; color: #a8483f; }
.input-row, .textarea-row { display: flex; align-items: center; min-height: calc(88 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f0eeea; }
.input-row:first-of-type { margin-top: calc(10 * var(--rpx)); }
.input-row:last-of-type { border-bottom: 0; }
.textarea-row { align-items: flex-start; padding: calc(18 * var(--rpx)) 0; border-bottom: 0; }
.label { width: calc(150 * var(--rpx)); color: #3d594c; font-size: calc(25 * var(--rpx)); font-weight: 600; flex: none; }
.input-field { flex: 1; color: #566f62; font-size: calc(24 * var(--rpx)); text-align: right; min-width: 0; }
.major-select { cursor: pointer; appearance: none; direction: rtl; }
.major-select option { direction: ltr; color: #566f62; }
.price-input { color: #3e8067; font-size: calc(28 * var(--rpx)); font-weight: 750; }
.image-upload-row { min-height: calc(148 * var(--rpx)); }
.image-uploader-container { display: flex; flex: 1; justify-content: flex-end; }
.image-preview-wrapper, .upload-btn-wrapper { position: relative; display: flex; align-items: center; justify-content: center; width: calc(116 * var(--rpx)); height: calc(116 * var(--rpx)); border: calc(1 * var(--rpx)) dashed #bdc9c0; border-radius: calc(12 * var(--rpx)); background: #fafbfc; overflow: hidden; }
.preview-image { width: 100%; height: 100%; object-fit: contain; cursor: pointer; }
.remove-image-btn { position: absolute; top: 0; right: 0; display: flex; align-items: center; justify-content: center; width: calc(34 * var(--rpx)); height: calc(34 * var(--rpx)); border-radius: 0 0 0 calc(10 * var(--rpx)); background: rgba(22, 106, 63,.65); color: #fff; font-size: calc(25 * var(--rpx)); cursor: pointer; }
.upload-btn-wrapper { flex-direction: column; color: #83988d; font-size: calc(21 * var(--rpx)); cursor: pointer; }
.upload-icon { color: #527861; font-size: calc(45 * var(--rpx)); line-height: 1; }
.upload-text { margin-top: calc(4 * var(--rpx)); }
.description-input { display: block; flex: 1; width: 100%; min-height: calc(120 * var(--rpx)); padding: calc(16 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e7eee8; border-radius: calc(12 * var(--rpx)); background: #fafbfc; color: #3d594c; font-size: calc(24 * var(--rpx)); line-height: 1.6; box-sizing: border-box; resize: none; }
.submit-button-container { position: fixed; right: calc(24 * var(--rpx)); bottom: calc(18 * var(--rpx)); left: calc(24 * var(--rpx)); z-index: 100; max-width: calc(var(--app-max-width) - calc(48 * var(--rpx))); margin: 0 auto; }
.submit-button, .delete-button { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(84 * var(--rpx)); margin: 0; border-radius: calc(17 * var(--rpx)); font-size: calc(28 * var(--rpx)); font-weight: 700; line-height: calc(84 * var(--rpx)); }
.submit-button { background: #166a3f !important; color: #fff !important; box-shadow: 0 calc(8 * var(--rpx)) calc(16 * var(--rpx)) rgba(22, 106, 63,.16); }
.submit-button[disabled] { background: #c7cdd5 !important; }
.delete-button { margin-top: calc(12 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ecd9a8; background: #fdf8ea !important; color: #b07f16 !important; }
</style>
