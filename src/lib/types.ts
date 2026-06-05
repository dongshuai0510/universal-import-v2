/**
 * 统一中间结构与下单领域模型类型定义。
 *
 * 设计要点：所有文件（Excel / Word / PDF）先被"提取层"转换为统一的
 * ExtractedDocument（多个 Sheet，每个 Sheet 是一个二维网格 + 合并单元格信息），
 * 之后规则引擎只面对这个统一结构工作，与具体文件格式解耦。
 */

/** 单元格值：提取层统一为字符串或数字或 null */
export type CellValue = string | number | null;

/** 合并单元格区域（0-based 行列，含端点） */
export interface MergeRegion {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** 一个 Sheet / 一页（PDF 每页或整体视为一个 grid） */
export interface SheetGrid {
  /** sheet 名称（Excel sheet 名 / PDF 文件名 / Word 文档名） */
  name: string;
  /** 行优先的二维网格，rows[r][c] */
  rows: CellValue[][];
  /** 合并单元格区域列表 */
  merges: MergeRegion[];
  /** 行数 / 列数（便于规则引擎边界判断） */
  rowCount: number;
  colCount: number;
}

/** 提取层输出：一个文件 = 若干 SheetGrid */
export interface ExtractedDocument {
  /** 原始文件名 */
  filename: string;
  /** 文件类型 */
  kind: "excel" | "word" | "pdf";
  sheets: SheetGrid[];
}

// ============ 下单领域模型 ============

/**
 * 下单字段定义（来自考试"三、下单字段定义"）。
 * 每条出库单按 externalCode（外部编码）聚合：同一外部编码下的多个 SKU 行
 * 共享一组收货信息，展示为一个出库单。
 *
 * 收货信息二选一：
 *  - 门店模式：只填 receiverStore
 *  - 收件人模式：填 receiverName + receiverPhone + receiverAddress
 * 两组都缺 → 校验不通过。
 */
export interface OrderLine {
  /** 外部编码：订单唯一编号，用于去重和聚合（如配送单号 / 汇总单号） */
  externalCode: string;
  /** 收货门店 / 机构（门店模式） */
  receiverStore?: string;
  /** 收件人姓名（收件人模式） */
  receiverName?: string;
  /** 收件人电话（收件人模式） */
  receiverPhone?: string;
  /** 收件人完整地址（收件人模式） */
  receiverAddress?: string;
  /** SKU 编码 */
  skuCode?: string;
  /** SKU 名称（必填） */
  skuName: string;
  /** 发货数量（必须为正数） */
  quantity: number | null;
  /** 物品规格型号 */
  spec?: string;
  /** 备注 / 附加说明 */
  remark?: string;
  /** 该行在源文件中的位置（用于错误定位与可编辑回写） */
  source?: { sheet: string; row: number };
}

/** 聚合后的出库单：一个外部编码 = 一个出库单 + 多个 SKU 明细 */
export interface AggregatedOrder {
  externalCode: string;
  receiverStore?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  lines: OrderLine[];
  /** 该单总数量 */
  totalQuantity: number;
}
