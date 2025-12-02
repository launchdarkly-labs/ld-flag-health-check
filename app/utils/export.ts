import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExportableFlag {
  flagKey: string;
  flagName: string;
  status: string;
  fallbackValue: string;
  environmentDefaultValue: string;
  bcpHealth: string;
  lastEvaluated: string;
  hasMismatch: boolean;
  variationName?: string;
}

export function exportToCSV(flags: ExportableFlag[], filename: string = 'ld-flag-health-check.csv') {
  const csv = Papa.unparse(flags, {
    header: true,
    columns: [
      'flagKey',
      'flagName',
      'status',
      'fallbackValue',
      'environmentDefaultValue',
      'bcpHealth',
      'lastEvaluated',
      'hasMismatch',
      'variationName'
    ]
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(flags: ExportableFlag[], filename: string = 'ld-flag-health-check.json') {
  const json = JSON.stringify(flags, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToPDF(
  flags: ExportableFlag[],
  projectKey: string,
  environment: string,
  summary: { all: number; launched: number; active: number; inactive: number; mismatches: number },
  filename: string = 'ld-flag-health-check.pdf'
) {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text('LaunchDarkly Flag Health Check Report', 14, 20);
  
  // Metadata
  doc.setFontSize(11);
  doc.text(`Project: ${projectKey}`, 14, 30);
  doc.text(`Environment: ${environment}`, 14, 36);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 42);
  
  // Summary
  doc.setFontSize(14);
  doc.text('Summary', 14, 52);
  doc.setFontSize(10);
  doc.text(`Total Flags: ${summary.all}`, 14, 60);
  doc.text(`Launched: ${summary.launched}`, 14, 66);
  doc.text(`Active: ${summary.active}`, 14, 72);
  doc.text(`Inactive: ${summary.inactive}`, 14, 78);
  doc.text(`Mismatches: ${summary.mismatches}`, 14, 84);
  
  // Table
  const tableData = flags.map(flag => [
    flag.flagKey,
    flag.flagName,
    flag.status,
    String(flag.fallbackValue || 'N/A'),
    String(flag.environmentDefaultValue || 'N/A'),
    flag.bcpHealth,
    flag.lastEvaluated,
    flag.hasMismatch ? 'Yes' : 'No'
  ]);
  
  autoTable(doc, {
    startY: 90,
    head: [['Flag Key', 'Flag Name', 'Status', 'Fallback Value', 'Env Default', 'BCP Health', 'Last Evaluated', 'Mismatch']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [64, 91, 255] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 50 },
      2: { cellWidth: 25 },
      3: { cellWidth: 30 },
      4: { cellWidth: 30 },
      5: { cellWidth: 30 },
      6: { cellWidth: 35 },
      7: { cellWidth: 20 }
    }
  });
  
  doc.save(filename);
}

