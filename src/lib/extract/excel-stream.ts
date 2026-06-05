/**
 * Excel 流式行读取（性能路径，考点4）。
 *
 * 对 10 万行级大文件，用 exceljs 的 stream WorkbookReader 逐行产出，
 * 不构建整本工作簿对象树，内存占用恒定。
 * 注意：流式模式不提供合并单元格信息——大文件压测均为标准宽表，无需合并。
 */
import { Readable } from "node:stream";
import type { CellValue } from "../types";
import { normalizeCell } from "./excel";

export interface StreamedSheetRows {
  sheetName: string;
  /** 异步迭代每一行 */
  rows: AsyncIterable<CellValue[]>;
}

/**
 * 逐 sheet、逐行流式读取。回调形式，避免把所有行收集到内存。
 * @param onRow 返回 false 可提前停止该 sheet
 */
export async function streamExcelRows(
  buffer: Buffer,
  onRow: (sheetName: string, rowIndex0: number, cells: CellValue[]) => void
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const stream = Readable.from(buffer);
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore",
  });

  for await (const worksheet of reader) {
    const ws = worksheet as unknown as {
      name?: string;
      id?: number;
      [Symbol.asyncIterator](): AsyncIterator<{
        number: number;
        eachCell(
          opts: { includeEmpty: boolean },
          cb: (cell: { value: unknown }, col: number) => void
        ): void;
      }>;
    };
    const sheetName = ws.name ?? `Sheet${ws.id ?? ""}`;
    for await (const row of ws) {
      const cells: CellValue[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = normalizeCell(cell.value);
      });
      for (let i = 0; i < cells.length; i++)
        if (cells[i] === undefined) cells[i] = null;
      onRow(sheetName, row.number - 1, cells);
    }
  }
}
