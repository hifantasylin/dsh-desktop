# DeepSeek Harness 工具与落盘手册

> 生产链路（05 资产库 / 06 视频生成 / 07 后期配乐）的 Harness 适配单源：工具映射、公网 URL 规则、资产落盘约定、成本纪律。**工具参数/上限/默认值/单价不在本文维护，单源是 dsh 注册的工具 schema**（见 §2）；各模块的具体生成与落盘动作，以各自 reference 的「输出与落盘」节为准。

---

## 1. 工具映射（阶段 → Harness 工具）

| 阶段 | Harness 工具 | 用途 |
|---|---|---|
| 05 资产库 | `generate_image` | 生成角色/场景/道具/参考图 |
| 05 | `media_asset_save` | 落盘图片资产（目录/类别规范见 05-core-assets.md 第三节） |
| 05 / 06 | `media_reference_url` | 本地/内网图 → 公网 https URL（生成工具只收公网 URL） |
| 06 视频生成 | `generate_video` | 图生/文生视频；`prompt` 即 06 纯净提示词 |
| 06 | `media_asset_save` | 落盘视频成片（铁律见 05-core-assets.md 第三节） |
| 06 | `media_extract_frame` | 抽尾帧做续拍衔接（可选，见 §2.3） |
| 07 后期配乐 | `generate_music` | 生成 BGM 并落盘（见 §2.2；目录见 05-core-assets.md 第三节） |
| 全链路 | `media_cost_summary` + `cost-tracker.md` | 成本记账与汇总（纪律见 §5） |

---

## 2. 工具业务增量（参数细节以 dsh 工具 schema 为单源）

> 工具的参数、枚举、上限、默认值、单价、背景任务语义（立即返回 jobId → `job_output {wait:true}` 读结果）**以 dsh 注册的工具 schema/description 为准**，调用时模型可见，本节不再重复枚举。这里只写 schema 装不下的 skill 层内容：编排顺序、命名纪律、provider 行为取舍；无增量的工具一行带过。

| 工具 | skill 层增量 |
|---|---|
| `generate_video` | `generateAudio` 取舍（↓2.1） |
| `generate_music` | 候选落盘命名与时长（↓2.2） |
| `media_extract_frame` | 关键帧命名规范（↓2.3） |
| `media_asset_save` | 纪律增量：生成后立即落盘（细则 §3） |
| `write` | 落盘路径映射见 §3.1；修改已有文件先 `read` 再 `edit`，`write` 整体覆盖 |

`generate_image` / `media_reference_url` / `media_cost_summary` 无业务增量（规则分别见 §4 / §4 / §5）。

### 2.1 `generate_video` 的 `generateAudio` 取舍
音频是模型内生的——对白/音效随画面一起合成，不是分离音轨；对白内容靠 prompt 描述（语气/语速/情绪），需要生成。 → 保持 `true`，视频导出后外部处理。画外音和BGM无需生成。

### 2.2 `generate_music` 落盘增量
- 两首候选都到手后挑好的落盘，命名加 `_A`/`_B` 后缀区分
- 单次生成约 2-5 分钟；成片 BGM 需求 = 分镜累计总时长，偏长外部裁剪，不足等 `extend`（后续版本）
- mxapi 积分制不返回美元——成本账记发生次数（costUsd=0），金额按积分自行折算
- 配乐方案怎么决策、description/lyrics 怎么写 → `references/07-music-prompt.md`（Cue Sheet/搜索词/版权检查仍见 `references/07-post-music-sound-design.md`）

### 2.3 `media_extract_frame` 关键帧命名
- 续拍尾帧 → `EPxx_尾帧`；指定时刻 → `<视频标识>_<秒>s_<内容>`；均匀抽帧 → `<视频标识>_<内容>`（工具自动追加 `_1..N`）
- 内容词用名词短语（姿态/动作峰值/场景时刻/特效峰值），避免"参考/备用"泛词；可选子路径 `continue/` `pose/` `scene/`
- 跨集衔接：优先对上一集尾镜抽帧（`time` 取最后一镜结束点，可任意时刻、可多帧）作下一集首镜参考图；`returnLastFrame` 仅备选

### 2.4 `generate_video` 的 `model` 必填
`model` 工具已必填（required），显式传参。**无 config 的默认档兜底在工具描述**（不依赖 skill）：无配置 → `doubao-seedance-2.0-mini`（最省成本）。skill 的增量：
- 有项目 config（`<项目名>_config.md`「生成模型」）→ 从 config 读 model 传入
- 用户明确指定档位 → 按用户指定
含 `seedance-2.5` 的 model 走 30s 大分镜规则（`06-seedance25-adapter.md`）；否则 2.0 现状。

---

## 3. 资产落盘约定（`.assets/<项目名>/`）

> 本节单源：**落盘动作与纪律**——文本资产用 `write`，生成物（图/视频/音频）生成后立即 `media_asset_save`（防 24h URL 过期）。落盘根 `<workspace>/.assets/<项目名>/`，一项目一目录；媒体目录/编号/命名的单源见 `references/05-core-assets.md` 第三节。用户继续推进时从这里读最新版本，跨对话/跨阶段不丢上下文；非 dsh 环境回退为人工保存。

### 3.1 文本资产落盘映射（哪个模块写哪个文件）

| 模块 | 主要文本产出 | `write` 落盘路径（`.assets/<项目名>/`） |
|---|---|---|
| 01 项目开发 | 项目档案、平台节奏档案、对标 DNA 报告 | `<项目名>_项目档案.md`（节奏档案并入同文件或 `<项目名>_节奏档案.md`；DNA 报告 `<项目名>_DNA报告.md`） |
| 01b 完整剧本 | 完整剧本 / 单集 / 单场 / 续写改稿 | `<项目名>_剧本.md`（多集按 `EPxx/EPxx_剧本.md`） |
| 02 剧本医生 | 会诊问题清单、优先级、平台节奏体检 | `<项目名>_会诊.md` |
| 03 台词精修 | 台词诊断、逐句精修、角色语言指纹 | `<项目名>_台词.md`（或回填 `_剧本.md` 对应场） |
| 04 AI 视频分镜 | 大分镜、镜头字段、跨段衔接、下游建议 | `<项目名>_分镜.md`（多集 `EPxx/EPxx_分镜.md`） |
| 05 资产库 | 资产总表、`@图N` 映射、风格锁 | `<项目名>_资产库.md` |
| 06 视频生成 | C/A/B 模板提示词包、参数、Must Keep/Avoid | `prompts/`（逐单元 `.md` + `_index.md`；多集文件名带 EP 前缀） |
| 07 后期声音 | BGM 曲线、Cue Sheet、音乐搜索词、AI 音乐 prompt | `<项目名>_声音设计.md` |
| 01b（分集=是） | 分集规划表 | `<项目名>_分集规划.md`（系列级） |
| 全局 | 项目配置 | `<项目名>_config.md`（**由 01 项目开发随项目档案一起创建**；04/06/07 从这里读画幅/时长/风格，不重复设定） |
| 全链路 | 预期成本框架 | `cost-tracker.md`（与 `media-cost.jsonl` 同目录；**由 01 创建骨架，04 分镜定稿后追加预期视频成本，05/06/07 进入生成前补齐各阶段预期**） |

### 3.2 废弃与覆盖纪律

- 重做某资产前，若原位置已有同名旧资产 → **先把旧资产移入所在编号目录的 `99_废弃/` 子目录，并改名 `<原名>_废弃_<时间戳>`**（如 `01_角色/CH001_花十/02_定稿图/CH001_花十_本体.png` → `01_角色/CH001_花十/99_废弃/CH001_花十_本体_废弃_20260831_1430.png`；时间戳 `YYYYMMDD_HHMMSS`，多次重试互不覆盖）→ 新版本用原名落盘。旧版留档、不覆盖、assets-index 不产生同名覆盖（视频/图片通用）。
- 所在目录没有 `99_废弃/` 层级的（`09_首帧图/`、`10_导演工作图/`、`11_视频成片/`、`12_BGM/`、`keyframe/` 等）：在原目录内改名 `<原名>_废弃_<时间戳>` 留档。

### 3.3 assets-index 与参考图 URL 生命周期

- `media_asset_save` 会把资产的**公网 URL**（如 vultrcdn）写入 `assets-index.md` 的"原始URL"列。**优先用这个 URL 作参考图，无需隧道**；只有当 URL 过期（24h）或没有公网 URL 时，才从磁盘路径走 `media_reference_url` 隧道。

```
① generate_image / generate_video 产出（返回 mediaRef.url 公网 URL）
② media_asset_save 立即落盘 + 记录公网 URL 到 assets-index.md
③ 后续要用资产：
   ③a 优先查 assets-index.md 的"原始URL"列 → 直接用（无需隧道）
   ③b 若 URL 过期/无 → 从磁盘路径 → media_reference_url 转公网 URL
④ 用公网 URL 作为 refImages/imageUrls 传给生成工具
```

---

## 4. 公网 URL 铁律与 @图片引用规则

**参考图用 `@图片1`、`@图片2`... 标记在 prompt 里引用，不是文字描述。**

- `generate_image` / `generate_video` 的参考图**只收公网 https URL**（`refImages` / `imageUrls`）。
- 本地附件、`.assets/` 文件、host 内网路径（`/describe-image/raw/...`）→ 先 `media_reference_url` 转公网，再用返回 URL 传生成工具；已是公网 https 则原样返回，不重复转。
- 参考图 URL 按序放进 `refImages`/`imageUrls` 数组，prompt 用 `@图片N` 引用数组第 N 张图（第 1 个 = `@图片1`）；标记出现顺序控制素材时序/主次，同一标记可多次出现。
- **`@图片N` 是模型侧约定**，工具不做解析——不写也完全可以，参考图按顺序参与生成。
- 上下文里的图片通常是 Markdown 引用 `![图片](/describe-image/raw/...)`，传给 `media_reference_url` 时**原样传入**，工具自动提取 URL。裸 id（`sha256:xxx`）也能传。**绝不要**用文字占位符（如"图片"）代替真实引用——会让参考图失效。

**视频示例**（imageUrls=[角色状态图, 场景状态图] → @图片1=角色状态图, @图片2=场景状态图；**状态图优先**，无状态图才用零件组合）：
```
prompt = "@图片1 小男孩挥动画笔画出发光的鸟飞起。@图片2 在洒满阳光的幼儿园教室，暖黄色逆光。"
imageUrls = [ 角色状态图URL, 场景状态图URL ]
```

**图片示例**：`prompt = "把 @图片1 转为真人写实风格"`，`refImages = [ 图URL ]`

---

## 5. 成本纪律

- 每次 `generate_image` / `generate_video` / `generate_music` **必须传 `project` + `label`**（成本归项目 + 重试识别）。
- `cost-tracker.md`（`.assets/<项目名>/`）只做价格基准 / 预期管理 / 预期外分析；不自记原始数据。
- 用户问成本（"花了多少 / 哪个镜头最贵 / 超预算了吗"）才调 `media_cost_summary` 拉实际 → 对比预期 → 追加写入；没问不主动汇总。

---

## 6. 与既有 reference 的关系

- 05 / 06 / 07 的提示词质量规则、红线、自检、节奏档位、素材编号一致性、衔接可见化**全部保留**，仅交付方式变化。
- 06 的 C/A/B 提示词文本**直接作为 `generate_video` 的 `prompt` 参数**（4-15s/段）；07 的 BGM 曲线 / Cue Sheet 产出文本后用 `generate_music` 实际生成落盘。
- 兼容模式并存：用户要拿去外部模型时，仍可只产出 prompt 文本。
