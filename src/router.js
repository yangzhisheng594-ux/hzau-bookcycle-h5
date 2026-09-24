// 路由表与 app.json pages 一一对应（hash 模式保证静态托管可直接刷新）
import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/pages/index/index' },
  { path: '/pages/index/index', component: () => import('./pages/Index.vue'), meta: { tab: true } },
  { path: '/pages/sell/sell', component: () => import('./pages/Sell.vue'), meta: { tab: true } },
  { path: '/pages/request/request', component: () => import('./pages/Request.vue'), meta: { tab: true } },
  { path: '/pages/cart/cart', component: () => import('./pages/Cart.vue'), meta: { tab: true } },
  { path: '/pages/profile/profile', component: () => import('./pages/Profile.vue'), meta: { tab: true } },
  { path: '/pages/bookDetail/bookDetail', component: () => import('./pages/BookDetail.vue') },
  { path: '/pages/publish/publish', component: () => import('./pages/Publish.vue') },
  { path: '/pages/publishRequest/publishRequest', component: () => import('./pages/PublishRequest.vue') },
  { path: '/pages/checkout/checkout', component: () => import('./pages/Checkout.vue') },
  { path: '/pages/editProfile/editProfile', component: () => import('./pages/EditProfile.vue') },
  { path: '/pages/changePassword/changePassword', component: () => import('./pages/ChangePassword.vue') },
  { path: '/pages/settings/settings', component: () => import('./pages/Settings.vue') },
  { path: '/pages/orderList/orderList', component: () => import('./pages/OrderList.vue') },
  { path: '/pages/search/search', component: () => import('./pages/Search.vue') },
  { path: '/pages/soldOrders/soldOrders', component: () => import('./pages/SoldOrders.vue') },
  { path: '/pages/logs/logs', component: () => import('./pages/Logs.vue') },
  { path: '/pages/verify/verify', component: () => import('./pages/Verify.vue') },
  { path: '/pages/auth/auth', component: () => import('./pages/Auth.vue') },
  { path: '/pages/resetPassword/resetPassword', component: () => import('./pages/ResetPassword.vue') },
  { path: '/pages/emailVerify/emailVerify', component: () => import('./pages/EmailVerify.vue') },
  { path: '/pages/admin/admin', component: () => import('./pages/Admin.vue') },
  { path: '/pages/admin/userDetail', component: () => import('./pages/UserDetail.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/pages/index/index' }
];

export default createRouter({
  history: createWebHashHistory(),
  routes
});
