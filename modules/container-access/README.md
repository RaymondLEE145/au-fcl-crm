# Container Access AU — 本地部署版

这是 **本地运行** 的完整网站包，不需要 GitHub、不需要服务器、不需要 API Key。

## 一、最简单：双击打开

解压后直接双击 **index.html** 即可使用（建议用 Chrome / Edge）。

地址搜索、道路数据、地图需要电脑能访问外网；如在中国大陆，可先连接 VPN。

## 二、推荐：本地服务器模式

双击 **启动网站.bat**：

- 自动打开浏览器访问 http://127.0.0.1:8787/
- 支持地址搜索、自动预检、卫星图、A4 报告、批量预检、本地保存
- 关闭黑色命令行窗口即可停止服务

如果 Windows 提示“未检测到 Python”，说明本机没有 Python：
可以直接双击 index.html（功能基本完整），或者安装 Python 3 后再次双击 **启动网站.bat**。

## 三、包含的文件

~~~text
Container-Access-AU-local/
├── index.html                 网站入口（双击可用）
├── 启动网站.bat               Windows 一键启动本地服务
├── server.py                  本地服务器（Python 标准库，无第三方依赖）
├── assets/                    样式、脚本、地图、报告
│   ├── css/app.css
│   └── js/                    i18n / rules / api / map / report / modals / app
├── docs/
│   └── Container-Access-AU-Report-2026.docx   判断标准与实施方案报告
├── samples/
│   └── report-sample.html     A4 报告样例（浏览器打开可打印/另存 PDF）
├── shots/                     网站截图
├── LICENSE
└── README.md                  本说明
~~~

## 四、使用流程

1. 输入澳洲地址（或点首页的演示场景）；
2. 地图自动预检路宽、道路等级、限高限重、电线、坡度；
3. 填 11 项关键条件（标“自动”的项来自地图估算，可修改）；
4. 右侧实时显示“能进 / 有条件 / 不能进”、推荐设备和原因；
5. 点“生成报告”打印或另存 PDF；可保存到浏览器本地。

## 五、常见问题

**Q：打开后地图空白？**
A：等待几秒；地图来自 Esri，若网络受限可点“卫星图”切换，或换网络/VPN。

**Q：地址搜索失败？**
A：地址来自 OpenStreetMap Nominatim / Photon，需要外网。可点“手动输入经纬度”。

**Q：报告打不开？**
A：允许浏览器弹出窗口；或直接使用报告样例 / 打印功能。

**Q：数据准不准？**
A：开放数据只做初筛；门宽、车道、落柜区、地面、净空必须现场测量，最终以司机和道路管理方判断为准。

## 六、安全与隐私

- 没有账号系统，核验记录只保存在浏览器本地；
- 地址查询直接发送给 OpenStreetMap 公共 API，不经过本项目服务器；
- 本工具不构成法律、工程或安全建议。

地图数据 © OpenStreetMap contributors · 影像 © Esri · 高程 © Open-Meteo / Copernicus DEM。
