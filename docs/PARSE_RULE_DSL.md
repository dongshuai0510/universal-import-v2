# ParseRule DSL 说明

ParseRule 是一份声明式 JSON，描述「如何把某类文件的统一网格转换为下单明细行」。
由 Claude 生成，可人工编辑、保存复用、试运行。

## 顶层结构

```jsonc
{
  "version": 1,
  "name": "配送发货单",          // 人读名称
  "kind": "excel",              // excel | word | pdf
  "sheets": "all",              // all | first | {"names":["银泰店"]}
  "perSheetOrder": false,       // true=每个 sheet 独立成一单
  "aggregateBy": "externalCode",// 聚合键字段
  "blocks": [ ... ],            // 数据块（按顺序执行）
  "fieldMappings": [ ... ]      // 统一字段 ← 值来源
}
```

## 统一字段

`externalCode`(外部编码/聚合键) `receiverStore`(收货门店) `receiverName`/`receiverPhone`/
`receiverAddress`(收件人三件套) `skuCode` `skuName`(必填) `quantity`(正数) `spec` `remark`

## 值来源 source

| from | 说明 | 示例 |
|------|------|------|
| `column` | 当前数据行第 col 列（0-based） | `{"from":"column","col":2}` |
| `const` | 常量 | `{"from":"const","value":"武汉仓"}` |
| `sheetName` | 当前 sheet 名 | `{"from":"sheetName"}` |
| `shared` | keyValue/卡片块抽取的命名共享值 | `{"from":"shared","key":"收货人"}` |
| `transposeHeader` | transpose 块当前门店列的列头 | `{"from":"transposeHeader"}` |
| `transposeValue` | transpose 块当前门店列的单元格值 | `{"from":"transposeValue"}` |

## 数据块 blocks

### table — 标准/宽表
```jsonc
{
  "type": "table",
  "headerRow": 3,              // 表头行(0-based)
  "dataStartRow": 4,          // 数据起始行(默认 headerRow+1)
  "dataEndRow": 6,            // 数据结束行(不含，默认到末尾；用于排除底部合计/收货行)
  "rowFilterCol": 2,          // 该列为空则跳过(默认用 skuName 映射列)
  "skipRowIfContains": ["合计","小计"]
}
```

### keyValue — 横向键值对（抽取头部/底部单值）
```jsonc
{
  "type": "keyValue",
  "extracts": [
    {"key":"externalCode","labels":["单据号"],"valueAt":"right"},
    {"key":"收货人","labels":["收货人","收件人"],"valueAt":"right"}
  ]
}
```
- `labels` 包含匹配（精确优先，避免「收货人」误命中「收货人手机号」）
- `valueAt`：`right`(右侧) | `below`(下方) | `inline`(同格，如 PDF「收货人：荣丽收货电话：...」)

### transpose — 门店列转置
```jsonc
{
  "type": "transpose",
  "headerRow": 0,
  "dataStartRow": 1,
  "storeColStart": 13,        // 门店列范围(列头是门店名，单元格是数量)
  "storeColEnd": 17,
  "skipEmptyOrZero": true     // 单元格为空/0 则不产生行
}
```
每个门店列 × 每个数据行的正数单元格 → 一行（externalCode 通常映射 transposeHeader）。

### cardRepeat — 卡片式重复
```jsonc
{
  "type": "cardRepeat",
  "cardDelimiterContains": "▶",        // 卡片分隔标志
  "extracts": [                         // 每张卡内的 keyValue
    {"key":"门店","labels":["调入门店"]},
    {"key":"收货人","labels":["收货人"]}
  ],
  "itemHeaderContains": ["物品编码","物品名称"]  // 卡内明细表头关键词
}
```
卡内 extracts 的共享值只对本卡明细行可见。

### pdfRow — PDF 纯文本明细行
```jsonc
{
  "type": "pdfRow",
  "skuCodePattern": "ZBWP\\d+",     // 物品编码正则(命中即明细行)
  "skipRowIfContains": ["物品类别","第","合计"]
}
```
针对 pdf-parse 抽取后「CJK 被粘连、无列分隔」的行，用编码正则锚点定位，
行尾连续数字作数量，自动合并折行（续行无新编码时并入），跳过页眉页脚。

## 完整示例

见 `test-fixtures/rules/` 下 6 个真实规则：`peisong.json`(配送发货单)、
`duomendian.json`(多门店分sheet)、`kapian.json`(卡片式)、`huanle.json`(转置)、
`hunan.json`(大宽表)、`qianzhai.json`(PDF)。这些同时作为引擎回归测试基准。
