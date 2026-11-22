import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import writeXlsxFile, { type Cell, type Row } from 'write-excel-file/browser';

export interface ExportReportPayload {
  businessName: string;
  businessLocation?: string;
  logoDataUrl?: string;
  reportTitle: string;
  periodLabel: string;
  preparedBy: string;
  approvedBy: string;
  columns: string[];
  rows: (string | number)[][];
  summaryMetrics: { label: string; value: string }[];
}

export function exportReportAsCSV(payload: ExportReportPayload) {
  const headerLines = [
    [payload.businessName, payload.reportTitle],
    ['Period', payload.periodLabel],
    ['Generated', new Date().toLocaleString()],
    ['Prepared By', payload.preparedBy],
    ['Approved By', payload.approvedBy],
    [],
    payload.columns,
    ...payload.rows,
  ];
  const csv = headerLines
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${payload.reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const toXlsxRow = (row: (string | number)[]): Row =>
  row.map((val): Cell =>
    typeof val === 'number'
      ? { type: Number, value: val }
      : { type: String, value: String(val ?? '') }
  );

export async function exportReportAsXLSX(payload: ExportReportPayload) {
  const summarySheetData: Row[] = [
    toXlsxRow(['Business', payload.businessName]),
    toXlsxRow(['Report', payload.reportTitle]),
    toXlsxRow(['Period', payload.periodLabel]),
    toXlsxRow(['Generated', new Date().toLocaleString()]),
    toXlsxRow(['Prepared By', payload.preparedBy]),
    toXlsxRow(['Approved By', payload.approvedBy]),
    [],
    [
      { type: String, value: 'Key Summary Metric', fontWeight: 'bold' },
      { type: String, value: 'Value', fontWeight: 'bold' },
    ],
    ...payload.summaryMetrics.map((m) => toXlsxRow([m.label, m.value])),
  ];

  const detailsSheetData: Row[] = [
    payload.columns.map((c) => ({ type: String, value: c, fontWeight: 'bold' as const })),
    ...payload.rows.map((r) => toXlsxRow(r)),
  ];

  await writeXlsxFile([
    { sheet: 'Summary', data: summarySheetData },
    { sheet: 'Inventory Ledger', data: detailsSheetData },
  ]).toFile(`${payload.reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`);
}

export function exportReportAsPDF(payload: ExportReportPayload) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 74, 'F');

  let textLeft = 36;
  if (payload.logoDataUrl && payload.logoDataUrl.startsWith('data:image/')) {
    try {
      doc.addImage(payload.logoDataUrl, 'PNG', 32, 15, 44, 44);
      textLeft = 88;
    } catch {
      // Ignore invalid logo image format
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(payload.businessName, textLeft, 34);
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(`${payload.reportTitle}  |  Period: ${payload.periodLabel}`, textLeft, 52);

  doc.setTextColor(203, 213, 225);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 36, 36, { align: 'right' });

  // Summary metrics bar
  let yPos = 96;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  const cols = Math.min(4, Math.max(1, payload.summaryMetrics.length));
  const boxW = (pageWidth - 72 - (cols - 1) * 10) / cols;
  payload.summaryMetrics.slice(0, 8).forEach((m, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = 36 + col * (boxW + 10);
    const y = yPos + row * 42;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, boxW, 34, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(m.label, x + 8, y + 13);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(m.value, x + 8, y + 27);
  });

  const rowsCount = Math.ceil(Math.min(8, payload.summaryMetrics.length) / cols);
  const tableStartY = yPos + rowsCount * 42 + 16;

  autoTable(doc, {
    startY: tableStartY,
    head: [payload.columns],
    body: payload.rows,
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 36, right: 36 },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || tableStartY + 80) + 28;
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Prepared By: ${payload.preparedBy}   ______________________`, 36, finalY);
  doc.text(`Approved By: ${payload.approvedBy}   ______________________`, pageWidth / 2, finalY);

  doc.save(`${payload.reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
}
