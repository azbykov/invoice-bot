import { InvoiceData } from '../types';
import { ExcelService } from './excelService';
import * as dayjs from 'dayjs';
import { LangChainService } from './langchainService';

export class TemplateService {
  /**
   * Форматирует описание товара:
   * 1. Оставляет только латинский текст
   * 2. Делает первую букву заглавной, остальные строчными
   */
  private static formatDescription(description: string): string {
    // Убираем русский текст (оставляем только латиницу)
    const latinOnly = description.replace(/[^a-zA-Z\s]/g, '');
    // Убираем лишние пробелы
    const trimmed = latinOnly.trim().replace(/\s+/g, ' ');
    // Делаем первую букву заглавной, остальные строчными
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  /**
   * Генерирует файл со списком товаров
   */
  static async generateItemsFile(invoice: InvoiceData): Promise<any> {
    const data = invoice.items.map(item => ({
      'Наименование': item.name,
      'Количество': item.quantity,
      'Ед. изм.': item.unit,
      'Цена': item.price,
      'Сумма': item.total
    }));

    return await ExcelService.createExcelFile(data, {
      headers: ['Наименование', 'Количество', 'Ед. изм.', 'Цена', 'Сумма'],
      columnWidths: [40, 15, 15, 15, 15]
    });
  }

  /**
   * Генерирует нормализованный инвойс от поставщика
   */
  static async generateReceivedInvoice(invoice: InvoiceData): Promise<any> {
    const data = [{
      'Номер инвойса': invoice.invoiceNo,
      'Дата': invoice.date,
      'Поставщик': invoice.supplier.name,
      'Адрес поставщика': invoice.supplier.address,
      'ИНН поставщика': invoice.supplier.taxId,
      'Покупатель': invoice.client.name,
      'Адрес покупателя': invoice.client.address,
      'ИНН покупателя': invoice.client.taxId,
      'Валюта': invoice.currency,
      'Итого': invoice.total
    }];

    return await ExcelService.createExcelFile(data, {
      headers: [
        'Номер инвойса', 'Дата', 'Поставщик', 'Адрес поставщика',
        'ИНН поставщика', 'Покупатель', 'Адрес покупателя',
        'ИНН покупателя', 'Валюта', 'Итого'
      ],
      columnWidths: [20, 15, 30, 40, 15, 30, 40, 15, 10, 15]
    });
  }

  /**
   * Генерирует финальный документ по шаблону
   */
  static async generateSalesInvoice(
    supplierInvoice: InvoiceData,
    clientInvoice: InvoiceData
  ): Promise<any> {
    const data = [{
      'Номер инвойса': clientInvoice.invoiceNo,
      'Дата': clientInvoice.date,
      'Поставщик': supplierInvoice.supplier.name,
      'Адрес поставщика': supplierInvoice.supplier.address,
      'ИНН поставщика': supplierInvoice.supplier.taxId,
      'Покупатель': clientInvoice.client.name,
      'Адрес покупателя': clientInvoice.client.address,
      'ИНН покупателя': clientInvoice.client.taxId,
      'Валюта': clientInvoice.currency,
      'Итого': clientInvoice.total
    }];

    return await ExcelService.createExcelFile(data, {
      headers: [
        'Номер инвойса', 'Дата', 'Поставщик', 'Адрес поставщика',
        'ИНН поставщика', 'Покупатель', 'Адрес покупателя',
        'ИНН покупателя', 'Валюта', 'Итого'
      ],
      columnWidths: [20, 15, 30, 40, 15, 30, 40, 15, 10, 15]
    });
  }

  static async generateItemsXls(supplierData: any, clientData: any): Promise<any> {
    // Получаем имя папки и категорию из номера инвойса клиента
    const folder = (clientData.invoice_number || '').replace(/ /g, '_');
    const itemCategory = folder;

    // Формируем массив строк для Excel
    const data = (supplierData.items || []).map((item: any) => ({
      'item name': item.description || '',
      'folder': folder,
      'sku': item.sku || '',
      'uom': '',
      'Item Type': 'Inventory Item',
      'Barcode': '',
      'Item Category': itemCategory,
      'Brand': '',
      'Country of Origin': 'CHINA',
      'HS Code': '',
      'Customs Duty Rate': '',
      'Net Weight': '',
      'Use Serial Numbers?': '',
      'Use Batches?': '',
      'Use Characteristics?': ''
    }));

    // Заголовки и порядок колонок
    const headers = [
      'item name', 'folder', 'sku', 'uom', 'Item Type', 'Barcode',
      'Item Category', 'Brand', 'Country of Origin', 'HS Code',
      'Customs Duty Rate', 'Net Weight', 'Use Serial Numbers?',
      'Use Batches?', 'Use Characteristics?'
    ];

    // Генерируем Excel-файл
    return await ExcelService.createExcelFile(data, {
      headers,
      columnWidths: [40, 30, 20, 10, 20, 20, 30, 20, 20, 15, 20, 15, 20, 20, 20]
    });
  }

  static async generateInvXls(supplierData: any, clientData: any): Promise<any> {
    const folder = (clientData.invoice_number || '').replace(/ /g, '_');

    function formatDate(dateStr: string): string {
      const d = dayjs.default(dateStr, ['YYYY-MM-DD', 'DD.MM.YYYY', 'MMM.DDTH, YYYY', 'MMM.DD, YYYY'], true);
      if (d.isValid()) return d.format('DD/MM/YYYY');
      return dateStr;
    }

    const normalizedDate = await LangChainService.normalizeDate(supplierData.invoice_date);

    const data = (supplierData.items || []).map((item: any) => ({
      'Date': normalizedDate,
      'Invoice Number': supplierData.invoice_number || '',
      'Supplier Name': supplierData.seller || '',
      'Warehouse': '',
      'Item': item.sku || '',
      'Content': TemplateService.formatDescription(item.description || ''),
      'Document Currency': 'USD',
      'Quantity': item.quantity || '',
      'UOM': '',
      'Price': item.unit_price || '',
      'Inclusive of VAT': 'No',
      'VAT, %': 'Out of Scope',
      'VAT Amount': 0,
      'Total Amount': (item.quantity && item.unit_price)
        ? (Math.round(item.quantity * item.unit_price * 100) / 100).toFixed(2)
        : '',
      'Import': '',
      'Inventory.GLAccount_GL': 'Goods'
    }));

    const headers = [
      'Date', 'Invoice Number', 'Supplier Name', 'Warehouse', 'Item', 'Content',
      'Document Currency', 'Quantity', 'UOM', 'Price', 'Inclusive of VAT',
      'VAT, %', 'VAT Amount', 'Total Amount', 'Import', 'Inventory.GLAccount_GL'
    ];

    return await ExcelService.createExcelFile(data, {
      headers,
      columnWidths: [15, 20, 30, 15, 20, 40, 10, 10, 10, 10, 15, 15, 15, 15, 10, 20],
      columnTypes: { 'Date': 'text', 'Invoice Number': 'text' }
    });
  }

  static async generateSalesInvoiceXls(supplierData: any, clientData: any): Promise<any> {
    const folder = (clientData.invoice_number || '').replace(/ /g, '_');

    function formatDate(dateStr: string): string {
      const d = dayjs.default(dateStr, ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD-MM-YYYY', 'DD/MM/YYYY', 'MMM.DDTH, YYYY', 'MMM.DD, YYYY'], true);
      if (d.isValid()) return d.format('DD/MM/YYYY');
      return dateStr;
    }

    const data = (clientData.items || []).map((item: any) => {
      const supplierItem = (supplierData.items || []).find(
        (supItem: any) => supItem.sku === item.sku
      );
      return {
        'Date': formatDate(clientData.invoice_date || ''),
        'Invoice Number': clientData.invoice_number || '',
        'Customer Name': supplierData.buyer || '',
        'Emirate': 'Dubai',
        'Warehouse': '',
        'Item': item.sku || '',
        'Content': TemplateService.formatDescription(
          supplierItem ? supplierItem.description || '' : item.description || ''
        ),
        'Document Currency': 'USD',
        'Quantity': item.quantity || '',
        'UOM': '',
        'Price': item.unit_price || '',
        'Inclusive of VAT': 'No',
        'VAT, %': 'Out of Scope',
        'VAT Amount': 0,
        'Total Amount': (item.unit_price && item.quantity)
          ? (Math.round(item.unit_price * item.quantity * 100) / 100).toFixed(2)
          : ''
      };
    });

    const headers = [
      'Date', 'Invoice Number', 'Customer Name', 'Emirate', 'Warehouse', 'Item', 'Content',
      'Document Currency', 'Quantity', 'UOM', 'Price', 'Inclusive of VAT',
      'VAT, %', 'VAT Amount', 'Total Amount'
    ];

    return await ExcelService.createExcelFile(data, {
      headers,
      columnWidths: [15, 20, 30, 15, 15, 20, 40, 10, 10, 10, 10, 15, 15, 15, 15],
      columnTypes: { 'Date': 'text', 'Invoice Number': 'text' }
    });
  }
} 