# AP Chemistry 自适应学习平台

AP Chemistry 的本地优先学习编排器，把 Khan Academy、OpenStax、PhET、AP Central 四个平台上的学习资源整合成有序、可追踪的完整学习体验。

## 当前状态

- Week 1（Unit 1: 原子结构与性质）— 完整内容，可学习
- Weeks 2-9 — 内容待补充（代码已就绪，占位符已放置）

## 技术栈

- **框架**: Next.js (App Router, `output: 'export'` 纯静态)
- **数据库**: Dexie.js 4.4.2 (IndexedDB, ChemistryLearningDB)
- **AI**: Anthropic Claude API (浏览器直调，Key 存 localStorage)
- **样式**: Tailwind CSS
- **部署**: Cloudflare Pages / GitHub Pages

## 快速开始

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 生成 out/ 静态产物
npx vitest run   # 运行单元测试
```

## 项目结构

```
ap-chem-app/
├── app/
│   ├── page.tsx                    # 首页（重定向到当前进度）
│   ├── week/[w]/day/[d]/           # 每日学习页（63个静态页，9周×7天）
│   ├── dashboard/                  # 进度仪表盘（含每日综合得分 badge）
│   └── settings/                  # Claude API Key 配置 + 数据导出
│
├── components/
│   ├── AppInitializer.tsx          # DB 初始化 + storage.persist
│   └── day/
│       ├── DayListView.tsx         # 学习主界面（资源列表 + 挑战题 + FRQ）
│       ├── ResourceRow.tsx         # A/B/C 层资源行（含评分）
│       ├── QuizPanel.tsx           # 每日挑战题（MCQ/fill/short/feynman + AI 追问）
│       └── RelatedFRQCard.tsx      # FRQ 推荐 + 分数回填
│
├── lib/
│   ├── types.ts / constants.ts     # Foundation 层（WEEKS=9）
│   ├── infra/                      # db / storage / ai / seed（Infrastructure 层）
│   ├── repository/                 # IRepository + DexieRepository
│   ├── domain/                     # flow / scoring / frq / adaptive（纯函数）
│   └── app/                        # session / useDayResources / quiz（Application 层）
│
├── data/
│   ├── content_library.json        # Week 1: 44条资源+8个知识点；Weeks 2-9: 占位符
│   └── frq_map.json                # AP Chemistry FRQ映射（待手动填充）
│
└── public/
    ├── quiz-bank.json              # 24道概念题库（MCQ/fill/feynman，Week 1，无计算题）
    └── frq/                        # AP Chemistry 历年 FRQ PDF（待添加）
```

## 内容状态

| 周 | AP 单元 | 内容状态 |
|----|---------|---------|
| 1 | Unit 1: 原子结构与性质 | 完整（8个知识点，44条资源，24道题） |
| 2 | Unit 2: 分子结构与键 | 待补充（占位符已放置） |
| 3 | Unit 3: 分子间作用力 | 待补充（占位符已放置） |
| 4 | Unit 4: 化学反应 | 待补充（占位符已放置） |
| 5 | Unit 5: 动力学 | 待补充（占位符已放置） |
| 6 | Unit 6: 热力学 | 待补充（占位符已放置） |
| 7 | Unit 7: 平衡 | 待补充（占位符已放置） |
| 8 | Unit 8: 酸碱化学 | 待补充（占位符已放置） |
| 9 | Unit 9: 电化学 | 待补充（占位符已放置） |

## 核心功能

- **9 周学习路径**：Week 1–9，顺序解锁，每日 A/B/C 三层任务
- **自适应补救**：通过率 < 75% 时自动推荐 B 层相关资源（按薄弱知识点概念重合度排序）
- **每日挑战题**：3 道客观题 + 1 道费曼反思，AI 评分主观题，AI 追问
- **每日综合得分**：0–100 分（A层完成+质量 55 分 + B/C/FRQ 加成 15 分 + Quiz 30 分）
- **历年 FRQ 推荐**：根据当天知识点匹配相关真题（FRQ库待填充）
- **每日 AI 反馈**：当天完成后自动生成学习总结（需配置 Claude API Key）

## 添加新内容

添加 Weeks 2-9 的内容，编辑 `data/content_library.json`：

1. 在 `concepts` 数组中添加新知识点（按照Week 1的格式）
2. 在 `resources` 数组中添加对应资源（Tier A: 必做，B: 补救，C: 拓展）
3. 删除对应周的占位符概念和资源
4. 修改 `lib/constants.ts` 中的 `LIBRARY_VERSION`（触发客户端重新 seed）

### 题库说明

`public/quiz-bank.json` 仅包含概念性题目（MCQ、填空、费曼），**不包含计算题**。原因：
- fill 类型采用字符串精确匹配，无法处理化学符号（下标、上标）的等价形式
- 计算答案的数值精度和有效数字难以通过字符串比较验证
- 未经验证的计算答案可能误导学生

如需添加计算题，需先改进 `lib/infra/ai.ts` 中 `gradeAnswer` 的 fill 类型处理逻辑。

### FRQ 映射说明

`data/frq_map.json` 当前为空。填充方式：
1. 下载 AP Chemistry 历年 FRQ PDF（AP Central）
2. 将 PDF 放入 `public/frq/` 目录
3. 按照 FRQEntry 类型格式在 frq_map.json 中添加条目
4. FRQ 类型：`long_answer`（Section II Part A）或 `short_answer`（Section II Part B）

## 数据说明

- 用户进度存 IndexedDB（Dexie ChemistryLearningDB v4），设备绑定
- API Key 存 localStorage，不上传任何服务器
- `LIBRARY_VERSION` / `QUIZ_BANK_VERSION` 变更时客户端自动重新 seed
