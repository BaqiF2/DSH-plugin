# 提示词库 · Prompt Gallery

一个 DeepSeek Harness（DSH）的「提示词」插件，提供三件事：

1. **按类别管理提示词，并记录每条提示词的作用描述** —— 自定义分类（可增删改），每条提示词包含标题、作用描述、正文、标签；支持搜索、编辑、删除、使用次数统计。
2. **在历史聊天消息中一键收藏** —— 在每条「用户消息」底部的操作区（复制按钮旁）会出现一个书签按钮，点一下即可把这条消息存进提示词库；提示「编辑详情」可立即补充分类、标题与作用描述。
3. **在输入框中优化提示词** —— 输入框工具栏新增 ✨ 按钮，点击后用当前会话所使用的模型把输入框里的提示词改写成更高质量的结构化提示词，直接替换输入框内容，并提供「撤销」。

界面跟随 Harness 主题与中英文界面语言；数据在本机持久化，重启不丢失。

---

## 界面入口

| 位置 | 控件 | 行为 |
| --- | --- | --- |
| 输入框工具行（左侧） | 📑 书签图标 | 打开提示词库浮层：左侧分类栏 + 搜索 + 提示词卡片（标题 / 作用描述 / 正文预览 / 标签 / 使用统计），支持插入、编辑、删除、新建提示词、管理分类 |
| 输入框工具行（左侧） | ✨ 星芒图标 | 调用模型优化输入框中的提示词；完成后直接替换输入框内容，右下角 toast 提供「撤销」；输入框为空时提示 |
| 用户消息底部操作区 | 书签加号图标 | 一键把该条用户消息保存为提示词（默认分类「未分类」），toast 提供「编辑详情」 |

提示词库浮层中「插入」的行为：输入框为空时填入；否则插入到当前光标位置。

## 数据存储

- 位置：`$DSH_HOME/prompt-gallery/library.json`（未设置 `DSH_HOME` 时为 `~/.dsh/prompt-gallery/library.json`）。
- 结构：`{ version, categories: [{ id, name, description, order, builtin, createdAt }], prompts: [{ id, title, description, body, categoryId, tags, origin, createdAt, updatedAt, useCount, lastUsedAt }] }`。
- 写入为原子写（临时文件 + rename）并串行化；读到损坏文件时会保留 `.broken-<timestamp>` 备份后重建。
- 首次运行时按当前界面语言生成 6 个预置分类：写作 / 编程 / 翻译 / 分析 / 办公 / 未分类；全部可改名、可删除（「未分类」受保护，删除分类时其下提示词移入未分类）。

## HTTP API（Host 半，前缀 `/prompt-gallery/api`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state?locale=zh\|en` | 读取完整词库（首次运行时按 locale 生成预置分类） |
| GET | `/health` | 运行状态与客户端自检（组件是否挂载、注入的收藏按钮数量） |
| POST | `/prompts` | 新建提示词；正文重复时返回 `duplicate: true` 与已有记录 |
| PATCH | `/prompts/:id` | 修改提示词 |
| DELETE | `/prompts/:id` | 删除提示词 |
| POST | `/prompts/:id/use` | 记录一次使用（插入输入框时调用） |
| POST | `/categories` | 新建分类 |
| PATCH | `/categories/:id` | 重命名/修改分类 |
| DELETE | `/categories/:id` | 删除分类（其下提示词移入未分类） |
| POST | `/optimize` | `{ text, provider?, model?, reasoningEffort?, locale? }` → `{ optimized }`；缺省模型时回退到部署默认模型 |
| POST | `/presence` | 客户端自检上报（仅内存，供 `/health` 诊断） |

所有接口先经过同源/loopback 信任校验（拒绝跨站请求）。优化接口通过 Host 的 `llm` 服务流式调用模型，120s 超时，输出上限按输入长度在 3072–8192 token 之间自适应。

## 架构

```
prompt_plugin/
├── package.json          # bundle 清单：dsh.bundle.patch + dsh.client
├── cordis.patch.yml      # 插入一行 Host 插件（id: prompt-gallery）
├── host/index.js         # Host 半：JSON 存储、CRUD、AI 优化、Web API
├── client.js             # Client 半：composer 按钮、词库浮层、消息收藏按钮
├── icon.svg
├── locale/{zh,en}.json   # 插件管理页显示名与描述
└── scripts/dev-sync.sh   # 开发期热更新辅助脚本（见下）
```

- **Host 半**只依赖 Node 内置模块（`node:fs/promises`、`node:path`、`node:os`、`node:crypto`），可选服务通过 `ctx.get('llm')`、`ctx.get('agentDefaultModel')` 获取；`webServer` 为硬依赖。
- **Client 半**通过 `window.__ModuleLoader__.load` 注册，使用 Harness 的 slot 系统：
  - `conversation.input.left`：输入框工具行按钮（标准 props：`useInput`、`inputActions`、`useProjection`、`sessionId`）。
  - `shell.overlay`：词库浮层、编辑器、分类管理、toast 栈。
  - 用户消息收藏按钮：向 `[data-conversation-scroll] [data-clock="start"]` 操作行注入按钮，用 `MutationObserver` 在 React 重渲染后自动补装，插件卸载时全部清理。
- 主题样式仅使用 `--dsw-alias-*` 主题 token；文案跟随 Harness 语言（zh/en）。

## 安装（在 DSH profile 内）

用 DSH 的插件管理工具安装本目录为 bundle：

```
plugin_manager action=install_bundle target=<本目录绝对路径>
```

- 包名：`@local/dsh-prompt-gallery`（本地 bundle 约定；发布到 npm 前可改成自己的作用域）。
- 插件管理页显示名来自 `locale/*.json`：中文「提示词库」，英文「Prompt Gallery」。
- 安装后无需重启即可生效（Host 行 id 为 `prompt-gallery`，Client 半通过 `dsh.client` 加载）；Host 半代码更新需要重启进程，或按下一节的开发流程生成新的模块路径。

## 开发期热更新

Harness 进程对已导入的模块路径有缓存，因此本仓库附带一套开发工作流：

```bash
# 1. 把工作区同步到被 HMR 监视的 .dev/live2，并赋予一个全新的模块名
./scripts/dev-sync.sh dsh-prompt-gallery-devN    # N 需要递增以强制首次全新导入

# 2. 移除旧 bundle、安装 .dev/live2（首次或需要全新模块名时）
#    plugin_manager remove_bundle <旧包名>
#    plugin_manager install_bundle /…/prompt_plugin/.dev/live2

# 3. 之后修改工作区文件后只需再跑一次 dev-sync.sh，Host 与 Client 会热更新
./scripts/dev-sync.sh
```

`.dev/` 已在 `.gitignore` 中；交付用的正式包始终是本目录（`host/index.js` + `client.js`）。

## 验证状态

- Host API：CRUD、分类增删改（含受保护分类与迁移）、locale 首次初始化、持久化、`/health`、`/presence` 均已实测通过。
- AI 优化：实测 `deepseek-official / deepseek-flash`（显式选择与会话默认回退两种路径），返回完整结构化提示词，无截断。
- Client：在运行中的 Harness 页面实测挂载成功——输入框工具栏按钮、`shell.overlay` 浮层、词库面板、提示词编辑器、分类管理对话框均能渲染；用户消息收藏按钮注入数量经 `/health` 自检确认为 ≥1。
- 未覆盖：真实鼠标点击流程（插入、收藏、AI 替换/撤销）未做浏览器自动化点击验证；样式细节（深色主题下的观感）建议在页面中人工确认一次。

## 已知限制

- 用户消息收藏按钮依赖 Harness Chat 渲染层的两个 DOM 标记：`data-conversation-scroll` 与 `data-clock="start"`。DSH 升级若改动这两个标记，按钮将不出现（其余功能不受影响）。
- 一条提示词的作用描述在「一键收藏」时为空，需要在「编辑详情」中补充。
- 词库为单机全局数据，不随工作区隔离，也不做多端同步。
