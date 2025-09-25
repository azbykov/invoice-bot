import ExcelJS from 'exceljs';
import { FileBuffer } from '../types';

interface CreateExcelOptions {
  headers: string[];
  columnWidths: number[];
  columnTypes?: Record<string, string>;
}

export class ExcelService {
  /**
   * Читает Excel-файл из буфера и преобразует его в текстовый формат
   */
  static async excelToText(fileBuffer: FileBuffer): Promise<string> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer.buffer);

      const worksheet = workbook.getWorksheet(1); // Получаем первый лист
      if (!worksheet) {
        throw new Error('Excel файл не содержит рабочих листов');
      }

      // Преобразуем данные в текстовый формат
      const rows: string[] = [];
      worksheet.eachRow((row, rowNumber) => {
        const rowData = row.values as any[];
        // Пропускаем пустые строки
        if (rowData.some(cell => cell !== undefined && cell !== null)) {
          rows.push(rowData.join('\t'));
        }
      });

      return rows.join('\n');
    } catch (error) {
      console.error('Error converting Excel to text:', error);
      throw new Error('Ошибка при чтении Excel файла');
    }
  }

  /**
   * Создает Excel-файл с данными по шаблону
   */
  static async createExcelFile(
    data: any[],
    template: CreateExcelOptions
  ): Promise<Buffer> {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');

      // Устанавливаем заголовки и типы колонок
      worksheet.columns = template.headers.map((header, index) => ({
        header,
        key: header,
        width: template.columnWidths[index],
        style: { numFmt: template.columnTypes?.[header] === 'text' ? '@' : undefined }
      }));

      // Добавляем данные
      worksheet.addRows(data);

      // Стилизация заголовков
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // Генерируем буфер
      return await workbook.xlsx.writeBuffer() as any;
    } catch (error) {
      console.error('Error creating Excel file:', error);
      throw new Error('Ошибка при создании Excel файла');
    }
  }

  /**
   * Проверяет, является ли файл Excel-файлом
   */
  static isValidExcelFile(fileBuffer: FileBuffer): boolean {
    const validMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    
    return validMimeTypes.includes(fileBuffer.mimeType);
  }
} 