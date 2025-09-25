import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { InvoiceData, FileBuffer } from '../types';
import { HumanMessage } from '@langchain/core/messages';
import * as XLSX from 'xlsx';
import { ChatPromptTemplate } from "@langchain/core/prompts";

interface Invoice {
  invoice_number: string;
  invoice_date: string;
  buyer: string;
  seller: string;
  payment_term: string;
  packing: string;
  items: InvoiceItem[];
  total_quantity: number;
  total_amount: number;
}

interface InvoiceItem {
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export class LangChainService {
  private static model: ChatOpenAI;

  /**
   * Инициализация сервиса
   */
  static initialize() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be provided!');
    }

    this.model = new ChatOpenAI({
      model: "gpt-4o", // или gpt-4-turbo-preview
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0.3,
    });
  }

  /**
   * Конвертирует Excel файл в текстовый формат
   */
  private static convertExcelToText(fileBuffer: FileBuffer): string {
    try {
      const workbook = XLSX.read(fileBuffer.buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Конвертируем в JSON для лучшей читаемости
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Форматируем JSON в читаемый текст
      return JSON.stringify(jsonData, null, 2);
    } catch (error) {
      console.error('Error converting Excel to text:', error);
      throw new Error('Ошибка при конвертации Excel файла');
    }
  }

  /**
   * Преобразует текстовые данные инвойса в структурированный JSON
   */
  static async parseInvoice(fileBuffer: FileBuffer) {
    const excelText = this.convertExcelToText(fileBuffer);
    
    const formatInstructions = `
Ответь только валидным JSON по следующей схеме:
{
  "invoice_number": string,
  "invoice_date": string,
  "buyer": string,
  "seller": string,
  "payment_term": string,
  "packing": string,
  "items": [
    {
      "sku": string,
      "description": string,
      "quantity": number,
      "unit_price": number,
      "total": number
    }
  ],
  "total_quantity": number,
  "total_amount": number
}
`;

    const parser = new JsonOutputParser<Invoice>();

    const prompt = ChatPromptTemplate.fromTemplate(
      "Ты — эксперт по структуре коммерческих инвойсов.\n{format_instructions}\nВот табличные данные инвойса:\n{excelText}"
    );

    const partialedPrompt = await prompt.partial({
      format_instructions: formatInstructions,
    });

    const chain = partialedPrompt.pipe(this.model).pipe(parser);

    return await chain.invoke({ excelText });
  }

  static async parseSupplierInvoice(fileBuffer: FileBuffer) {
    const excelText = this.convertExcelToText(fileBuffer);

    const promptText = `
Ты — помощник, который извлекает структурированные данные из коммерческих инвойсов поставщиков.

Твоя задача:
1. Определи колонку, содержащую **уникальный артикул** товара (SKU). Обычно она называется "Part No", "Fenox No", "Код", "Артикул" или похожим образом.
2. Построй JSON по следующей схеме:

{{
  "invoice_number": string,              // из поля Invoice No.
  "invoice_date": string,                // из поля Date (формат YYYY-MM-DD)
  "contract": string,                    // значение из поля Contract (если есть)
  "buyer": string,                       // кому выставлен счёт
  "seller": string,                      // от кого счёт
  "items": [
    {{
      "sku": string,                     // артикул
      "description": string,            // описание товара (английское + русское, если есть)
      "quantity": number,               // количество
      "unit_price": number,             // цена за единицу (FCA или FOB USD)
      "total": number                   // общая сумма (USD)
    }}
  ],
  "total_quantity": number,             // общее количество
  "total_amount": number                // итоговая сумма
}}

❗ Указания:
- Определи "sku" по смыслу — это может быть колонка с названием "Fenox No.", "Part No." и т.д.
- Объединяй описание из всех колонок, если оно разделено (например: "Brake pads Тормозные колодки барабанные").
- Убери валютные символы ($, €, ₽), пробелы, и запятые в числах.
- Если в документе встречается несколько дат, используй ту, которая идёт первой после номера инвойса (Invoice No.).
- Пример:
  Invoice No.   M04 ADR0301
  Date:         3/18/25
  Contract:     2B20082024
  Date:         8/20/24
  // В этом случае invoice_date = 3/18/25
- Возвращай только **валидный JSON**, без дополнительных комментариев.

Вот таблица:
${excelText}
`;

    const parser = new JsonOutputParser<any>();
    const prompt = ChatPromptTemplate.fromTemplate("{promptText}");
    const partialedPrompt = await prompt.partial({ promptText });
    const chain = partialedPrompt.pipe(this.model).pipe(parser);
    return await chain.invoke({});
  }

static async normalizeDate(rawDate: string): Promise<string> {
  const promptText = `
Ты — конвертер дат. Преобразуй входную строку с датой в формат: **DD/MM/YYYY**.

Примеры:
- "DEC.10TH, 2024" → "10/12/2024"
- "Jan 3, 2023" → "03/01/2023"
- "2024/07/01" → "01/07/2024"
- "10 August 2025" → "10/08/2025"

Внимание:
- Сохраняй нули перед днями и месяцами: 3 → 03, 7 → 07
- Месяц должен быть числом
- Верни только дату, без пояснений

Вот дата:
${rawDate}
`;

    const prompt = ChatPromptTemplate.fromTemplate("{promptText}");
    const partialedPrompt = await prompt.partial({ promptText });
    const response = await this.model.invoke(await partialedPrompt.format({}));
    // Ответ — просто строка с датой
    return typeof response.content === 'string' ? response.content.trim() : '';
  }
}