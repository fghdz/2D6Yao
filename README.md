> **Fork 说明**
>
> 本仓库是 [kth2/2D6Yao](https://github.com/kth2/2D6Yao) 的复刻副本，用于个人学习与私有部署。
> 上游原始文档保留在下文「上游原始文档」一节，未作删改。
> 本人的部署方式（宝塔面板 + Nginx）见下文「宝塔面板部署指南」一节，与上游默认的 GitHub Pages 部署路径不同，请勿混用。
>
> 维护分支：`main`（仅跟踪上游，不做功能修改）。
>
> **License / 版权**：上游仓库未声明开源许可证，版权归原作者 [kth2](https://github.com/kth2) 所有。
> 本 fork 仅作个人学习与自用部署，不用于分发或商业用途。若上游后续补充许可证，以原作者声明为准。

---

# 一、上游原始文档

以下内容原样保留自 [kth2/2D6Yao](https://github.com/kth2/2D6Yao)，未作任何删改。

## 六爻预测 PWA

传统六爻起卦、排盘、断卦的 Progressive Web App。

线上地址：<https://kth2.github.io/2D6Yao/>（手机浏览器打开，「添加到主屏幕」即可当 App 用，装完可离线）

### 运行

```bash
npm install
npm run dev      # 本地开发，http://localhost:5173
npm run build    # 生产构建（含 PWA/Service Worker）
npm run lint      # oxlint 检查
```

推到 `main` 或 `claude/**` 分支会自动构建并发布到 GitHub Pages
（`.github/workflows/deploy.yml`；子目录部署靠 `BASE_PATH=/2D6Yao/`）。

### AI 断卦设置

「设置」页填接口地址与 API key，点「测试连接并读取模型」，应用会拉取该服务商的模型清单
让你从中选择；能从价格字段判断出免费模型的（如 OpenRouter 的 `:free`）会标【免费】并排在前面。
支持两种接口格式：OpenAI 兼容（OpenRouter / Groq / Gemini / 硅基流动 / DeepSeek / 本机 Ollama 等）
与 Anthropic 原生。密钥只存在本机浏览器，浏览器直连服务商，不经中转；不填也能用，
去「解卦」复制提示词自己去问。

### 技术栈与结构

- Vite + React 19 + TypeScript + Tailwind CSS v4
- **mingyu-core** 作为六爻排盘 / 神煞 / 历法的计算引擎（`src/engine/` 是唯一调用入口，UI 不直接碰底层库）
- zustand 做状态、Dexie（IndexedDB）做本地历史记录、vite-plugin-pwa 提供离线/安装能力
- 断卦支持任意 OpenAI 兼容服务商与 Anthropic 原生接口，流式返回，见上「AI 断卦设置」。

```
src/
  engine/       起卦与排盘的纯计算层（不依赖 React）
  store/        zustand：当前卦盘 / 历史记录 / 主题设置
  db/           Dexie 本地历史记录 schema
  components/
    setup/      卦盘设置：按时间/投币/手动/选卦 起卦，动爻勾选
    chart/      卦盘详情：本卦/变卦 并排或标签视图，逐爻可点开详情
    interpretation/  取用神 → 卦象标签 → 命中条文 → 相似书例 → 提示词/调用 Claude 断卦
    history/    历史记录列表
    layout/     应用外壳、导航、主题切换
    ui/         基础 UI 组件
data/           六爻800例 语料库（见下）
```

### 语料库（六爻800例）

从《六爻800例—高级技法解析》（淮源子，782 页 PDF）提取的结构化语料 + 规则表，现放在 `data/` 下
（`book-1.txt` `cases.jsonl` `rules.jsonl` `gua64.json` `index.json`），供未来的断卦规则匹配/书例检索使用。

```
corpus/
  book.txt        782 页全文（带页标记，可读）
  pages.jsonl     782 页，阅读顺序原文（案例头不被换行切断）
  cases.jsonl     603 个卦例，结构化
  rules.jsonl     748 条断法条文
reference/
  gua64.json      64 卦纳甲/六亲/世应完整基础表
pipeline/
  build_gidmap.py 从 PDF 收割字形→Unicode 映射
  gid2uni_final.json  1809 个字形的最终映射（已人工校对）
  extract.py      带字形修复的文本提取
  flat.py         阅读顺序平铺提取
  segment.py      案例切分
  rules.py        规则条文抽取
  gua64.py        64 卦表生成器（京房纳甲）
  gua_ocr.py      卦盘图片识别（半成品，见下）
```

#### 一、这个 PDF 的坑，以及怎么填的

calibre 把 CJK 字体拆成 **2179 个 Type3 子集**，并给大量字形写了 `ToUnicode → U+0000`。
直接 `pdftotext` 会丢 **36% 的字符**，而且丢的正好是最关键的那些：
世、应、官、父、母、兄、弟、卦、酉、亥、空、冲、合……

四步修复：

| 步骤 | 恢复 | 方法 |
|---|---|---|
| 跨子集收割 | 962 字形 | 同一 GID 在别的子集有正确 ToUnicode，全局对齐（0 冲突） |
| 锚点偏移 | 161 字形 | 用系统 Noto CJK 的 CID 顺序 + 已知锚点推算区间偏移 |
| 位图模板匹配 | 610 字形 | 渲染候选字与 PDF 字形做高斯模糊余弦比对 |
| 人工目视校对 | 全部 | 逐张对照图核对，共改正 **91 个**误判 |

外加：康熙部首折叠（⽘→爻、⻤→鬼、⺒→巳 等 21 个）。

**验证**：修复后的第 21 页与页面渲染图**逐字一致**。全书 0 个残留 NUL，
1831 个不同字符，罕用字清单人工扫过一遍，无乱码。

#### 二、卦盘是图片 —— 已解决

每页的卦盘表格是**嵌入的 JPEG**（约 250ppi），不在文字层里。
全书 757 张图（519 页各 1 张、119 页各 2 张）。

但卦盘几乎全部可以算出来：只要认出**本卦名**和**变卦名**，
六亲、纳甲、世应、动爻、六神、伏神全部由 `gua64.json` + 四柱推导。

`gua_ocr.py` 走的就是这条路：按墨迹投影切列 → 逐列 OCR →
用 64 卦的「地支 / 天干 / 六亲」指纹加权打分。
**不要求 OCR 认对每个字**，错三四个字排名依然稳。
变卦的六亲仍以本卦卦宫论，所以先定本卦，再拿本卦宫去认变卦。

结果：**识别出 670 张卦盘，502 张带变卦**。

挂接用版面顺序（`positions.py` 记录每页卦例头与卦盘图的 y 坐标，
按 y 归并成一条流走一遍），541 / 603 个卦例拿到了卦。

##### 两条独立校验

| 校验 | 结果 |
|---|---|
| OCR 读到的动爻标记（`0`/`x`）个数 vs 本卦变卦逐爻比对得出的动爻数 | **502 例全一致，0 冲突** |
| 解析正文点名的爻（「官鬼申金」「五爻亥水」）vs 认出的卦的六亲纳支 | 见下表 |

置信度分布：`high` 160、`medium` 281、`low` 64、`review` 36（附候选卦）、无卦盘 62。

#### 三、断语标签体系 —— 已完成

41 个标签，覆盖用神体系 / 旺衰状态 / 爻间关系 / 格局与外部四组。
标签只标事实（出现没出现），不做吉凶判断。

**规则条文用同一套标签**，于是两边互查：
`cases[].related_rules`（同章优先）↔ `rules[].example_cases`。
597 / 603 个卦例挂上了依据条文。

`corpus/index.json` 提供 `case_by_tag` / `rule_by_tag` / `case_by_gua` / `case_by_chapter` 四张倒排表。

#### 四、规则抽取 —— 已修正

原来 748 条里混进了大量正文（终身卦一章就吞进 320 条，多是年份和大限表的数字）。

现在按两条约束抽：条目必须构成**单调递增的连号串**（跳序即断），
串可以在同一节里从 1 重新起（书里用散文小标题分组，如「未婚同居断法」
「结婚应期断法」），重起时把小标题记为该串的 `topic`。

结果 **365 条**，终身卦从 320 降到 87，婚姻情缘保住 62 条并带上了小标题。

#### 五、字形二次校对

发现并修正了 29 个**同形字**误判 —— 这类错误 OCR 看不出来，
只能靠语料统计发现：某个罕用字出现上百次，而它的常用同形字出现 0 次。

例：藏 0 次 / 藘 150 次、参 0 次 / 叁 132 次、勾 0 次 / 勻 84 次（勾陈！）、
市 0 次 / 巿 17 次。另有 款/歁、商/啇、痊/痋、每/毎、曾/曽、薪/薼、堵/堶、
麻/蔴、刺/剌、裹/裛、坟/坆、啡/啛、探/採、萨/薩、襄/褢、趟/趥、敏/敂、
鉴/瓾、揭/掲、媳/媲、姐/媹、殖/殝、另/叧、尔/尓 等。

#### 六、还剩什么

1. 62 个卦例没找到卦盘图（多为静卦页或图未被识别），36 个标了 `review` 待人工定卦
2. 事类归一化：`question_raw` → `question_type` + `yongshen`（问什么取什么用神）
3. 向量索引（语义检索相似卦例）
4. 规则条文里还有少量末尾粘连的小标题残留

#### 七、复跑

```bash
pip install pdfplumber pypdfium2 pytesseract fonttools scipy pillow numpy
apt-get install -y tesseract-ocr-chi-sim fonts-noto-cjk poppler-utils

python build_gidmap.py          # 生成 gid2uni.json
# （字形校对已固化在 gid2uni_final.json，无需重跑）
python flat.py 0 784 flat_0.jsonl   # 全文
python segment.py                   # 切卦例
python tags.py                      # 打标签
python rules.py                     # 抽条文
python batch_gua.py 1 785 gua_all.jsonl   # 认卦盘（单核约 40 分钟）
python batch_gua2.py 1 800 ge.jsonl       # 双图页的第二张
python positions.py                 # 记版面位置
python link_gua2.py                 # 挂卦盘 + 校验
python link_rules.py                # 规则/卦例互链 + 索引
```

#### 八、数据来源与用途

原书受版权保护。这里的 `corpus/` 是从用户自有 PDF 提取的私有工作副本，
仅供个人研究与自用 app 的规则/检索底稿，不应再分发。

---

# 二、宝塔面板部署指南（Fork 私有部署）

本节记录在 **宝塔面板 + Nginx** 环境下运行本项目的完整步骤。
上游默认使用 GitHub Pages 托管构建产物，本 Fork 提供两种宝塔部署方式：

| 模式 | 适用场景 | 特点 |
|---|---|---|
| **模式 A：Node 项目（开发/预览）** | 需要在服务器上直接跑 Vite dev server，保留 HMR | 资源路径含 `/node_modules/.vite/`，需额外放行 |
| **模式 B：静态 `dist`（生产）** | 只部署 `npm run build` 的产物 | 无 Node 进程常驻，资源路径为 `/assets/`，更接近上游行为 |

**推荐生产环境使用模式 B**；如果需要在服务器上直接开发/调试，再用模式 A。

## 通用前置条件

### 1. 安装官方 Node.js 版本管理器

宝塔左侧 → **软件商店** → 搜索 `Node.js` → 认准**作者为「宝塔」**的那个插件安装（不是第三方 “PM2管理器”）。没装这个插件，「网站」里不会出现「Node 项目」选项，`npm` 也会报 `command not found`。

建议选 **LTS 版本**（如 v18.x 或 v20.x），避免非 LTS 版本与依赖的兼容问题。

安装后在插件「设置」→「环境变量」里确认 `node` 和 `npm` 路径已加入 PATH。

### 2. 上传项目文件

将项目目录打包为 `.zip`（**不要**包含 `node_modules`，否则上传极慢），通过宝塔 **文件** 管理器上传到 `/www/wwwroot/` 下并解压。

解压后**必须修正权限**：右键项目根目录 → **权限** → 所有者改为 `www`，勾选「递归设置子文件」→ 目录 `755`、文件 `644`。宝塔解压后有时所有者会变成 `root`，会导致后续 `npm install` 或 Nginx 读取文件时出现权限错误。

---

### 3. 准备一个站点

宝塔 → **网站** →**node项目** →  **添加项目**，域名填你的项目目录如：/www/wwwroot/6yao，启动方式默认“dev:vite“”即可，然后打开**外网映射** →  **添加域名** →  **SSL**

| 字段 | 填写 |
|---|---|
| 项目名称 | 小写字母+短横线，如 `liuyao-dev` |
| 项目路径 | 你的项目根目录（含 `package.json` 的那一层） |
| 启动命令 | `“dev:vite`（或自定义为 `npm run dev -- --host 0.0.0.0 --port 5173`） |
| 项目端口 | `5173`（必须与 Vite 实际监听端口一致） |
| Node 版本 | 选择你安装的 LTS 版本 |
| 包管理器 | `npm`（或你实际使用的） |
| 域名 | 可选，绑定你的域名（如果不在站点层面配反向代理） |

宝塔的 Node 项目会自动用 PM2 或内置守护进程管理，启动后在项目列表里看到「运行中」即为成功。



## 模式 A：Node 项目（开发/预览，保留 HMR）

### 第一步：修改 `vite.config.js`

在 `defineConfig` 中增加 `server` 块。**`base` 的原有逻辑不动**（`process.env.BASE_PATH ?? '/'` 服务于上游的 GitHub Pages 子目录部署）。

```js
export default defineConfig({
  base,
  server: {
    host: '0.0.0.0',
    allowedHosts: ['你的域名，例如 6yao.reimudao.top'],
    hmr: {
      host: '你的域名',
      protocol: 'wss',
      clientPort: 443,
    },
  },
  // ...其余不变
})
```

| 配置 | 作用 |
|---|---|
| `host: '0.0.0.0'` | 必须改，否则 Vite 只监听 `127.0.0.1`，Nginx 或外部无法连入 |
| `allowedHosts` | Vite 默认只允许 `localhost`，你的域名必须显式加入，否则 `Blocked request` |
| `hmr` | 反向代理后 HMR 的 WebSocket 需要指向公网域名和 `wss://:443` |

> `allowedHosts` 不要设为 `true`，官方建议使用显式列表。



> **启动命令的坑**：宝塔的进程守护不会自动加载你的 shell 环境。如果 `npm run dev` 秒退，把启动命令改成**绝对路径**，例如：
>
> ```
> /www/server/nvm/versions/node/v18.19.1/bin/npm run dev
> ```
>
> 路径中的版本号替换成你实际安装的版本。

### 第三步：修改宝塔站点的 Nginx 配置

宝塔 → **网站** → 你的站点 → **设置** → **配置文件**。

需要改四处：

**① 从敏感目录规则中移除 `node_modules`**

找到类似下面这一条（宝塔默认生成的安全规则）：

```nginx
location ~* /(\.git|...|node_modules|runtime)/ {
    return 404;
}
```

**删掉列表中的 `node_modules`**。这条规则会直接拦截 Vite dev server 的依赖请求（`/node_modules/.vite/deps/...`），是 404 的根因。其余敏感目录保持拦截不变。

**② 修正 `Host` 头**

在 `location /` 的 `proxy_pass` 块中：

```nginx
# 改前
proxy_set_header Host $host:$server_port;
proxy_set_header X-Host $host:$server_port;

# 改后
proxy_set_header Host $host;
proxy_set_header X-Host $host;
```

带端口的 Host 无法通过 Vite `allowedHosts` 的严格匹配。

**③ 注释掉伪静态 include**

```nginx
#include /www/server/panel/vhost/rewrite/node_你的站点名.conf;
```

伪静态里的 `try_files` 或 `rewrite` 会干扰 Vite dev server 对模块路径的处理。

**④ 确保 WebSocket 升级头存在**

宝塔的反向代理界面**默认不带** WebSocket 所需的头，必须手动确认 `location /` 块内有以下三行（且 `Connection "upgrade"` 的引号不能漏）：

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

同时建议调长读超时，避免 HMR 连接空闲时被 Nginx 默认的 60 秒切断：

```nginx
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

### 第四步：验证

在服务器本机执行：

```bash
curl -I https://你的域名/node_modules/vite/dist/client/env.mjs
curl -I https://你的域名/node_modules/.vite/deps/react.js
```

两条都应返回 `HTTP/2 200`。如果仍是 404，回到第三步确认 `node_modules` 已从屏蔽列表中移除。

浏览器首次打开前，DevTools → Application → Service Workers → **Unregister** 一次，清掉旧的 404 缓存。

---

## 模式 B：静态 `dist`（生产，推荐）

### 第一步：在服务器上构建

进入项目目录，安装依赖并构建：

```bash
cd /www/wwwroot/你的项目目录
npm install
npm run build
```

构建产物在 `dist/` 目录下。**不需要设置 `BASE_PATH`**——那是上游 GitHub Pages 子目录部署用的，自建域名走根路径时 `base` 回落到 `'/'` 即可。

> 如果服务器 Node 版本或内存有限，也可以在**本地**执行 `npm run build`，然后把 `dist/` 单独上传到服务器，跳过服务器端构建。

### 第二步：把站点根目录指向 `dist`

宝塔 → **网站** → 你的站点 → **设置** → **网站目录**，把「网站目录」改为：

```
/www/wwwroot/你的项目目录/dist
```

并确保「运行目录」为空或 `/`。

### 第三步：配置 SPA 路由回退

如果应用使用了前端路由（React Router 等），刷新非根路径会 404。在站点「配置文件」的 `location /` 块中加入：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

如果 `dist` 放在站点根目录之外（通过 `root` 指向），确认 `root` 路径正确：

```nginx
root /www/wwwroot/你的项目目录/dist;
```

### 第四步：验证

直接访问域名即可。静态模式下**不存在** `/node_modules/` 请求，因此宝塔的敏感目录拦截规则**不会影响它**，无需像模式 A 那样删除 `node_modules`。

---

## 进程守护与开机自启（仅模式 A）

宝塔 Node 项目自带基础的进程守护，但如果需要更稳定的崩溃自动恢复和开机自启，建议补充 PM2：

```bash
# 全局安装 PM2（用绝对路径避免 PATH 问题）
/www/server/nvm/versions/node/v18.19.1/bin/npm install -g pm2

# 在项目目录启动，并命名
cd /www/wwwroot/你的项目目录
/www/server/nvm/versions/node/v18.19.1/bin/pm2 start npm --name liuyao-dev -- run dev

# 保存当前进程列表并设置开机自启
/www/server/nvm/versions/node/v18.19.1/bin/pm2 save
/www/server/nvm/versions/node/v18.19.1/bin/pm2 startup
```

`pm2 save` 和 `pm2 startup` 的顺序不能颠倒，否则开机自启会读取到空列表。

---

## 常见问题速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `Blocked request. This host is not allowed` | Vite `allowedHosts` 未包含域名 | 在 `vite.config.js` 中显式加入域名 |
| `/node_modules/...` 全部 404 | 宝塔安全规则拦截，或伪静态改写 | 从敏感目录列表移除 `node_modules`，注释伪静态 include |
| `Host` 匹配失败 | `$host:$server_port` 带了端口 | 改为 `$host` |
| HMR 不工作 / WebSocket 断开 | Nginx 缺少 Upgrade/Connection 头，或超时太短 | 补全三行 WebSocket 头，设置 `proxy_read_timeout 3600s` |
| 启动命令秒退 | 宝塔守护未加载 shell 环境 | 启动命令改用 npm 的**绝对路径** |
| 页面空白但 curl 正常 | Service Worker 缓存了旧的 404 | DevTools → Application → Unregister SW，强刷 |
| 静态模式刷新路由 404 | 缺少 SPA 回退 | `location / { try_files $uri $uri/ /index.html; }` |

---

## 与上游部署方式的差异

| 项目 | 上游（kth2/2D6Yao） | 本 Fork（宝塔） |
|---|---|---|
| 运行方式 | GitHub Pages 托管 `dist` | 模式 A：Node 项目跑 dev；模式 B：Nginx 托管 `dist` |
| 子路径 | `BASE_PATH=/2D6Yao/` | 根路径 `/`，不设 `BASE_PATH` |
| 依赖路径 | 构建后为 `/assets/` | 模式 A 需放行 `/node_modules/.vite/` |
| HMR | 托管环境无需关心 | 模式 A 需显式配置 `server.hmr` + Nginx WebSocket 头 |
