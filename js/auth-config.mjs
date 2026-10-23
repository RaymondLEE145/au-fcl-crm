/* ============================================================================
 * auth-config.mjs —— 登录凭据与策略
 *   静态部署（GitHub Pages 等）时，直接改这里即可；服务端部署时以服务端
 *   环境变量 CRM_USER / CRM_PASS / CRM_CAPTCHA 为准（本文件仅作前端预校验）。
 *   注意：静态站点上的口令是"使用门槛"，不是真正的安全边界——真正的鉴权在
 *   服务端模式（httpOnly 会话 + /api 鉴权）。
 * ==========================================================================*/
window.CRM_AUTH = {
  /* 版本门禁：build 变了 → 旧登录状态作废、旧页面强制刷新到最新版 */
  build: '20261215a',
  epoch: '20261215a',
  /* ===== 每日动态密码 =====
     dynSecret：你的私钥（决定每天密码序列，改一次全序列都变；不要外传）
     dynEnabled：true=开启动态密码 */
  dynEnabled: false,
  dynLen: 8,
  user: '784654946',
  passHash: 'mrO5NNlTj+kIk/+eb18DCf9ygT3oWz/YYwPGky7U2rE=',      /* PBKDF2-SHA256(密码, salt, 210000 次) —— 不再存明文 */
  passSalt: '0e75d1a2d704ff13f85eec106a3bb8df',
  passIter: 210000,
  captcha: '543324682',
  hours: 12,          /* 记住登录时长（小时） */
  maxFails: 5,        /* 连续失败几次锁定 */
  lockSeconds: 60     /* 锁定时长（秒） */
};
