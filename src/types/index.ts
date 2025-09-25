export interface InvoiceData {
  invoiceNo: string;
  date: string;
  supplier: {
    name: string;
    address: string;
    taxId: string;
  };
  client: {
    name: string;
    address: string;
    taxId: string;
  };
  items: InvoiceItem[];
  total: number;
  currency: string;
}

export interface InvoiceItem {
  name: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}

export interface ProcessedInvoices {
  supplierInvoice: InvoiceData;
  clientInvoice: InvoiceData;
}

export interface FileBuffer {
  buffer: Buffer;
  filename: string;
  mimeType: string;
} 