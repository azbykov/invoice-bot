import { Context } from 'telegraf';
import { Message } from 'telegraf/types';
import { LangChainService } from '../../services/langchainService';
import { TemplateService } from '../../services/templateService';
import { InvoiceData, InvoiceItem, FileBuffer } from '../../types/index';
import { Buffer } from 'buffer';

// Шаги обработки
enum ProcessingStage {
  WAITING_SUPPLIER_INVOICE = 'WAITING_SUPPLIER_INVOICE',
  WAITING_CLIENT_INVOICE = 'WAITING_CLIENT_INVOICE',
  GENERATING_FILES = 'GENERATING_FILES'
}

// Состояние для хранения данных пользователя
interface UserState {
  stage: ProcessingStage;
  supplierInvoice?: FileBuffer;
  clientInvoice?: FileBuffer;
}

// Хранилище состояний пользователей
const userStates = new Map<number, UserState>();

export const generateCommand = async (ctx: Context) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Не удалось определить пользователя');
      return;
    }
    
    // Инициализируем состояние с первым шагом
    userStates.set(userId, {
      stage: ProcessingStage.WAITING_SUPPLIER_INVOICE
    });

    await ctx.reply('Пожалуйста, загрузите инвойс от поставщика (в формате .xlsx или .xls)');
  } catch (error) {
    console.error('Error in generate command:', error);
    await ctx.reply('Произошла ошибка при обработке команды. Пожалуйста, попробуйте позже.');
  }
};

// Обработчик для документов
export const handleDocument = async (ctx: Context & { message: any }) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Не удалось определить пользователя');
      return;
    }

    const userState = userStates.get(userId);
    if (!userState) {
      await ctx.reply('Пожалуйста, начните с команды /generate');
      return;
    }

    const document = ctx.message.document;

    // Проверяем тип файла
    if (!document.file_name?.endsWith('.xlsx') && !document.file_name?.endsWith('.xls')) {
      await ctx.reply('Пожалуйста, загрузите файл в формате Excel (.xlsx или .xls)');
      return;
    }

    // Получаем файл
    const file = await ctx.telegram.getFile(document.file_id);
    const response = await fetch(`https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    const fileBuffer: FileBuffer = {
      buffer,
      filename: document.file_name || 'document.xlsx',
      mimeType: document.mime_type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    switch (userState.stage) {
      case ProcessingStage.WAITING_SUPPLIER_INVOICE:
        // Сохраняем инвойс поставщика и переходим к следующему шагу
        userState.supplierInvoice = fileBuffer;
        userState.stage = ProcessingStage.WAITING_CLIENT_INVOICE;
        userStates.set(userId, userState);
        await ctx.reply('Инвойс от поставщика получен. Теперь загрузите инвойс для покупателя.');
        break;

      case ProcessingStage.WAITING_CLIENT_INVOICE:
        // Сохраняем инвойс покупателя и переходим к генерации файлов
        userState.clientInvoice = fileBuffer;
        userState.stage = ProcessingStage.GENERATING_FILES;
        userStates.set(userId, userState);

        // Отправляем статусное сообщение и сохраняем его message_id
        const statusMsg = await ctx.reply('Оба инвойса получены. Начинаю обработку...');
        let statusMessageId = statusMsg.message_id;
        const chatId = ctx.chat?.id;
        const editStatus = async (text: string) => {
          if (chatId && statusMessageId) {
            try {
              await ctx.telegram.editMessageText(chatId, statusMessageId, undefined, text);
            } catch (e) {
              console.error('Ошибка при обновлении статусного сообщения:', e);
            }
          }
        };
        try {
          await editStatus('🔄 Парсинг инвойса от поставщика...');
          const supplierData = await LangChainService.parseInvoice(userState.supplierInvoice!);

          await editStatus('🔄 Парсинг инвойса для покупателя...');
          const clientData = await LangChainService.parseSupplierInvoice(userState.clientInvoice!);

          await editStatus('✅ Инвойсы распознаны! Отправляю JSON...');
          // Выводим JSON пользователю
          console.log('SupplierData:', supplierData);
          console.log('ClientData:', clientData);
          await ctx.reply(`Supplier JSON:\n<pre>${JSON.stringify(supplierData, null, 2)}</pre>`, { parse_mode: 'HTML' });
          await ctx.reply(`Client JSON:\n<pre>${JSON.stringify(clientData, null, 2)}</pre>`, { parse_mode: 'HTML' });

          await editStatus('🔄 Генерация файла Items...');
          const buffer = await TemplateService.generateItemsXls(supplierData, clientData);
          const folder = (clientData.invoice_number || '').replace(/ /g, '_');
          await ctx.replyWithDocument({
            source: buffer,
            filename: `Items (заполнение для 1С) [${folder}].xlsx`
          });

          await editStatus('🔄 Генерация файла Inv...');
          const invBuffer = await TemplateService.generateInvXls(supplierData, clientData);
          await ctx.replyWithDocument({
            source: invBuffer,
            filename: `Inv (заполнение для 1С) [${folder}].xlsx`
          });

          await editStatus('🔄 Генерация файла Sales Invoice...');
          const salesBuffer = await TemplateService.generateSalesInvoiceXls(supplierData, clientData);
          await ctx.replyWithDocument({
            source: salesBuffer,
            filename: `Sales Invoice (заполнение для 1С) [${folder}].xlsx`
          });

          await editStatus('🔄 Проверка итоговых сумм и количества...');
          
          // Функция для подсчета сумм и количества из items
          const calculateTotals = (data: any) => {
            const calculated = (data.items || []).reduce((acc: any, item: any) => {
              acc.totalQuantity += Number(item.quantity || 0);
              acc.totalAmount += Number(item.unit_price || 0) * Number(item.quantity || 0);
              return acc;
            }, { totalQuantity: 0, totalAmount: 0 });
            
            calculated.totalAmount = Math.round(calculated.totalAmount * 100) / 100;
            return calculated;
          };

          // Проверка supplierData
          const supplierCalculated = calculateTotals(supplierData);
          const supplierTotalAmount = Math.round((supplierData.total_amount || 0) * 100) / 100;
          const supplierTotalQuantity = supplierData.total_quantity || 0;
          
          const supplierAmountCheck = supplierCalculated.totalAmount === supplierTotalAmount;
          const supplierQuantityCheck = supplierCalculated.totalQuantity === supplierTotalQuantity;

          // Проверка clientData
          const clientCalculated = calculateTotals(clientData);
          const clientTotalAmount = Math.round((clientData.total_amount || 0) * 100) / 100;
          const clientTotalQuantity = clientData.total_quantity || 0;
          
          const clientAmountCheck = clientCalculated.totalAmount === clientTotalAmount;
          const clientQuantityCheck = clientCalculated.totalQuantity === clientTotalQuantity;

          // Сравнение между supplierData и clientData
          const quantityMatch = supplierCalculated.totalQuantity === clientCalculated.totalQuantity;
          const amountMatch = supplierCalculated.totalAmount === clientCalculated.totalAmount;

          // Формируем отчет о проверке
          const checkReport = [
            '📊 Результаты проверки:',
            '',
            '🔹 Supplier Invoice:',
            `Total Amount: ${supplierCalculated.totalAmount} vs ${supplierTotalAmount} — ${supplierAmountCheck ? 'ОК ✅' : 'НЕ СОВПАДА ❌'}`,
            `Total Quantity: ${supplierCalculated.totalQuantity} vs ${supplierTotalQuantity} — ${supplierQuantityCheck ? 'ОК ✅' : 'НЕ СОВПАДА ❌'}`,
            '',
            '🔹 Client Invoice:',
            `Total Amount: ${clientCalculated.totalAmount} vs ${clientTotalAmount} — ${clientAmountCheck ? 'ОК ✅' : 'НЕ СОВПАДА ❌'}`,
            `Total Quantity: ${clientCalculated.totalQuantity} vs ${clientTotalQuantity} — ${clientQuantityCheck ? 'ОК ✅' : 'НЕ СОВПАДА ❌'}`,
            '',
            '🔸 Сравнение между инвойсами:',
            `Total Quantity: ${supplierCalculated.totalQuantity} vs ${clientCalculated.totalQuantity} — ${quantityMatch ? 'СОВПАДАЮТ ✅' : 'НЕ СОВПАДАЮТ ❌'}`
          ].join('\n');

          await ctx.reply(checkReport);

          await editStatus('✅ Обработка завершена! Все файлы и результаты отправлены ниже.');
          console.log({supplierData, clientData});
        } catch (error) {
          console.error('Error processing invoices:', error);
          await editStatus('❌ Произошла ошибка при обработке инвойсов. Попробуйте позже.');
          await ctx.reply('Произошла ошибка при обработке инвойсов. Пожалуйста, попробуйте позже.');
        }
        break;

      default:
        await ctx.reply('Неожиданное состояние. Пожалуйста, начните с команды /generate');
        break;
    }
  } catch (error) {
    console.error('Error handling document:', error);
    await ctx.reply('Произошла ошибка при обработке файла. Пожалуйста, попробуйте позже.');
  }
}; 