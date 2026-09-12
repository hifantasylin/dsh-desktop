# 07 配乐方案决策与生成提示词（generate_music 配套）

> 在 07 后期声音设计中，**用户明确要求实生成 BGM** 时读取本文件。把「配乐方案」落成 `generate_music` 的一段自然语言描述（或歌词+标签）。核心原则：**所有控制信息写进一段自然语言描述，不拆成多个参数**——但"一段描述"落在 `description` 还是 `lyrics`，由是否需要歌词决定（见 §二 映射表）。Cue Sheet / 音乐搜索词 / 版权检查仍见 `07-post-music-sound-design.md`。

---

## 一、什么时候读本文件

- 用户明确要求**生成 BGM / 音乐**（不是只要搜索词或 Cue Sheet）
- 07 C 模式（AI 音乐生成版）落成可执行的 `generate_music` 调用
- 生成后需要落盘的 BGM 音频

---

## 二、决策 → API 参数映射（先读这个）

| 你要表达的 | 落到哪 | 说明 |
|---|---|---|
| 情绪+曲风+乐器+速度+结构的**一段话描述**（纯音乐首选） | `description` | 灵感模式；模型自动作曲，**BGM 首选路径** |
| 完整歌词（带结构标签） | `lyrics` | 自定义模式；只在需要具体歌词时用 |
| 曲风标签（自定义模式时与 lyrics 搭配） | `tags` | 如 `"pop, cinematic, piano"` |
| 排除的风格 | `negativeTags` | 如 `"heavy drums, distorted guitar"` |
| 纯音乐开关 | `instrumental: true` | **BGM 场景必须 true**（无人声） |
| 歌名 | `title` | 建议 `EPxx_BGM_<风格>` |
| 人声性别 / 风格度 / 怪异度 | `vocalGender` / `styleWeight` / `weirdnessConstraint` | 可选微调 |

**模式选择决策**：
- BGM / 纯配乐（绝大多数场景）→ **灵感模式**：只写 `description`（按 §六 公式）+ `instrumental: true`
- 带歌词的歌（主题曲等）→ **自定义模式**：`lyrics`（§七 结构标签写法）+ `tags` + `instrumental: false`

---

## 三、输入收集（缺了先问）

| 参数 | 必填 | 缺省推导 |
|---|---|---|
| **全局导演基调**（config 导演定调块） | ✅ | 从 `<项目名>_config.md` 读取 |
| **全片情感走向**（各段情绪曲线） | ✅ | 从 01b 情绪曲线 / 07 全片声音策略继承 |
| 视频内容/场景 | ✅ | 从分镜/故事推断 |
| 情绪基调 | ✅ | 从 07 声音策略的情绪基线推断 |
| 成片时长 | ✅ | 分镜累计总时长（不用问） |
| 节奏偏好 | 否 | 按 §六 情绪映射表推导 |
| 乐器偏好 | 否 | 按 §六 乐器推荐表推导 |

---

## 四、与剧情对齐（不能突兀的核心约束）

BGM 是全片的情绪底座，**必须服务叙事弧，不是孤立氛围件**：

- **基调一致性**：音乐的整体色调服从全局导演基调（config 定调）——全片悲伤的故事不因某个欢快片段就把 BGM 写欢快；局部情绪用配器/动态微调表达，不推翻整体调性
- **结构映射剧情弧**：description 里的结构描述（A-B-A'、climax 位置）要**对齐剧情节奏**——开场钩子 → 音乐即刻建立基调；中段转折 → 和声/配器变化点；高潮段 → 情绪峰值（climax 的小节位置 ≈ 剧情高潮在成片中的时间占比位置）；收尾 → resolution/fade 对应故事收束
- **动态跟随双轨节奏**：各段标注的目标情绪（松/中/紧、轻/中/重）决定音乐的动态走向描述（gentle → building → massive climax → resolve），写进 description 的 `[动态走向]` 部分
- **反例（禁止）**：全片情感有起有伏但 description 只写 "gentle, calm" 一平到底；结构描述与剧情高潮位置脱节；调性与导演基调冲突

---

## 五、呼吸与留白（防疲劳 + 对白适配）

**铺满 ≠ 好配乐**：全程满配 BGM 会听觉疲劳且抢对白——安静本身是配乐的一部分。

- **生成层**（让曲子自带呼吸感）：
  - description 的 `[动态走向]` 写入呼吸段：如 `gentle dynamics with breathing space, sparse and intimate passages, building only at the emotional peak`
  - 结构上安排留白：climax 之外的段落用 `sparse, minimal, quiet` 措辞；带词曲用 `[Break]`/`[Breakdown]`/`[Interlude]` 标签制造留白段
- **对白段的压低/静音 → 后期混音解决，不在生成层**：Suno 无法精确控制"第 N 秒静音"；正解是用户在剪辑软件做 **ducking**（对白出现时音乐压 -6~-12dB）或音量自动化 keyframe。生成的曲子只需"有可压的持续底 + 自带呼吸段落"
- **一首 vs 多首**：**默认一首到底**——调性/速度/音色连续，情感弧不断裂；剧情起伏靠生成层结构对位 + 后期音量自动化适配。**只有调性级转变**（时空大跳转、类型切换，如喜剧→悲剧）才换曲：每首独立走本流程（`EPxx_BGM1`/`EPxx_BGM2`，各自落盘），接缝靠转场设计；60-90s 短视频几乎永远不需要多首
- **skill 边界**：ducking/混音/成片嵌入由用户在剪辑软件完成，skill 只交付"有呼吸感、可闪避"的音频底轨

---

## 六、单段式描述公式（灵感模式 / 纯音乐）

```
[情绪形容词] [曲风] instrumental for [场景], featuring [主乐器] and [辅乐器], [BPM] tempo, [动态走向], [时长/小节结构], [调性], evoking [预期感受].
```

### 按情绪选词（情绪 → 音乐词 / 速度）

| 情绪 | 音乐词 | 速度 |
|---|---|---|
| 温馨治愈 | Warm, Tender | 65-80 |
| 浪漫甜蜜 | Romantic, Sweet | 70-85 |
| 伤感怀念 | Melancholic, Nostalgic | 60-75 |
| 激昂热血 | Uplifting, Epic | 120-140 |
| 紧张悬疑 | Dark, Mysterious | 70-90 |
| 欢快轻松 | Happy, Bright | 110-130 |
| 梦幻空灵 | Dreamy, Ethereal | 65-80 |
| 史诗宏大 | Cinematic, Orchestral | 80-120 |
| 安静冥想 | Calm, Peaceful | 50-65 |
| 希望/晨曦 | Hopeful, Rising | 90-120 |
| 夜感/城市 | Night, Atmospheric | 70-90 |
| 怀旧复古 | Nostalgic, Vintage | 80-90 |
| 俏皮可爱 | Playful, Cheerful | 120-130 |
| 科技/未来 | Modern, Synth | 100-115 |

### 按视频类型选曲风

| 类型 | 曲风 |
|---|---|
| 城市/航拍 | Cinematic, Ambient |
| 旅行/人文 | Folk, Indie pop, Acoustic |
| 美食/生活 | Jazz, Bossa nova, Light pop |
| 运动/燃向 | Rock, EDM, Epic orchestral |
| 科技/数码 | Synth-pop, Electronic, Synthwave |
| 广告/品牌 | Orchestral, Pop rock, Cinematic |
| 治愈/萌宠 | Music box, Ukulele, Acoustic |
| 古风/国潮 | Ancient Chinese, Chinese traditional |
| 教育/解说 | Lo-fi, Minimal piano, Ambient |
| 悬疑/惊悚 | Dark ambient, Cinematic suspense |
| 科幻/赛博 | Synthwave, Dark ambient |
| 自然/风景 | Ambient, Neo-classical, Folk |

### 按乐器配情绪（主推 → 避免）

| 情绪 | 主推乐器 | 避免 |
|---|---|---|
| 温馨治愈 | Piano, Acoustic guitar | Distorted guitar |
| 浪漫深情 | Piano, Violin | Brass, 808 |
| 伤感忧郁 | Piano, Cello | Bright synth |
| 激昂热血 | Drums, Distorted guitar, Strings | Soft piano |
| 悬疑紧张 | Low strings, Synth pad | Bright sounds |
| 轻松愉快 | Acoustic guitar, Piano, Flute | Heavy bass |
| 梦幻空灵 | Synth pad, Harp | Drums |
| 史诗宏大 | Full orchestra | Solo instruments |
| 安静冥想 | Piano, Cello, Ambient pad | Drums |
| 怀旧复古 | Rhodes, Saxophone | Heavy synth |
| 俏皮可爱 | Xylophone, Ukulele | Heavy bass |
| 夜感城市 | Rhodes, Electric bass, Sax | Acoustic guitar |
| 科技未来 | Synth lead, Synth bass | Acoustic instruments |
| 古风 | Guzheng, Erhu, Orchestral strings | Electronic drums |

**配器厚度**（按视觉密度）：简洁留白 → 1-3 件；常规叙事 → 4-8 件；多线叙事 → 8-15 件；大场面史诗 → 20+ 件。

### 时长 → 结构描述（写进 description 的结构部分，按成片总时长取）

| 成片时长 | 结构描述写法 |
|---|---|
| ≤10s | `Short 4-bar sting, quick and impactful, immediate fade out` |
| 10-30s | `Short loopable piece, 8-16 bars, simple repeating motif, gentle fade in and out` |
| 30-60s | `16-24 bar A-B structure: brief intro, main theme, gentle resolution` |
| 60-90s | `32-bar A-B-A' structure: 8 bars intro, 16 bars development with climax at bar 20, 8 bars resolution` |
| 90-120s | `48-bar arrangement: 8 bars intro, 16 bars verse, 16 bars chorus, 8 bars outro` |
| 120-180s | `64-bar full arrangement with clear sections, build, climax, resolution and fade` |
| 180s+ | `Complete narrative arc with multiple movements, significant dynamic range` |

**BPM 参考锚点**：50-65 深夜冥想 / 65-80 自然治愈慢镜 / 80-100 城市漫步纪录片 / 100-120 Vlog 工作背景 / 120-140 运动广告 / 140-160 比赛游戏 / 160+ 疯狂剪辑。

### 示例（60s 温馨治愈成片）

```
Warm and tender ambient instrumental piece for a healing slice-of-life animation, featuring soft piano and gentle strings, with a slow tempo of 70 BPM, gentle dynamics, 32-bar A-B-A' structure with the emotional peak at bar 20, in F major, evoking peace and comfort.
```

---

## 七、带歌词的歌（自定义模式，主题曲场景）

- `lyrics`：用结构标签 `[Intro]` `[Verse]` `[Chorus]` `[Bridge]` `[Outro]` 等分段；`()` 写段落内控制（编曲/唱法）；歌词纯文字逐行写
- `tags`：曲风+人声+乐器+速度+制作感（如 `"Mandarin pop ballad, sad, female vocal, piano, strings, slow tempo, emotional"`）
- 规则：`[]` 管"这一段是什么"，`()` 管"这一段怎么唱怎么编"，歌词单独写
- 段落控制示例：`[Intro]` + `(rain ambience, soft piano)`；`[Chorus]` + `(full band, vocal harmony)`；`[Outro]` + `(fade out, whispered vocal)`
- 常用结构标签速查：`[Pre-Chorus]` 抬情绪 / `[Hook]` 记忆点 / `[Build-Up]`+`[Drop]` 电子燃曲 / `[Instrumental]` 纯音乐段 / `[Bridge]` 变化段 / `[Final Chorus]` 收尾最强副歌 / `[Fade Out]` / `[End]`
- 带歌词时 `instrumental` 不传或 false；`vocalGender` 指定人声

---

## 八、质量自检

- [ ] **已读 config 导演基调 + 全片情感走向，音乐整体色调与全片一致（不突兀）**
- [ ] **结构/动态描述映射了剧情弧**（climax 小节位置 ≈ 剧情高潮在成片中的位置；转折处有配器/和声变化）
- [ ] 模式选择正确：纯 BGM → 灵感模式（description）+ instrumental:true；带词 → 自定义（lyrics+tags）
- [ ] description 含：情绪形容词 / 曲风 / 场景 / 主乐器 / BPM / 动态 / 结构（小节或段落）/ 预期感受
- [ ] 结构按**成片累计总时长**取（§六 时长表），不是拍脑袋
- [ ] BGM 场景已传 `instrumental: true`
- [ ] 带词歌：结构标签用法正确（[] 段落 / () 控制）
- [ ] 决策与提示词写入 `<项目名>_声音设计.md` 的对应 Cue（不单独建文件）
- [ ] 生成后立即 `media_asset_save` 落盘（`category=prop`，`dir=12_BGM`，`name=EPxx_BGM_简述`，存 `.mp3`）

---

## 输出与落盘（dsh 运行时）

- 实生成时 `generate_music` 调用，`project`+`label` 必传（label 如 `EP01_BGM_轻快`）
- 两首候选都到手后挑好的落盘：`media_asset_save`（`reference` 用返回 `audioUrl`；`category=prop`，`dir=12_BGM`，`name=EPxx_BGM_简述`；多首候选命名加 `_A`/`_B` 区分）
- 方案文本（决策依据 + description）随 07 输出写入 `<项目名>_声音设计.md`，不单独建文件
- 工具参数、单价、背景任务语义以 `deepseek-harness.md` §2.2 / dsh 工具 schema 为单源
