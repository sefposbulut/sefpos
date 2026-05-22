import {
  buildKitchenHtml,
  buildReceiptHtml,
  buildTakeawayHtml,
  type PrintSettings,
} from '../../lib/printService';

export function previewKitchenHtml(settings: PrintSettings): string {
  return buildKitchenHtml({
    restaurantName: settings.restaurantName || 'ŞefPOS',
    tableLabel: 'Masa 5',
    orderNumber: 'ON-042',
    waiterName: 'Ali',
    items: [
      { productName: 'Adana Kebap', quantity: 2, variantName: 'Acılı' },
      { productName: 'Ayran', quantity: 1, notes: 'Soğuk' },
    ],
    note: 'Acele — önizleme',
    printStyle: settings.printStyle,
  });
}

export function previewAdisyonHtml(settings: PrintSettings): string {
  return buildReceiptHtml({
    restaurantName: settings.restaurantName || 'ŞefPOS',
    restaurantPhone: settings.restaurantPhone,
    restaurantAddress: settings.restaurantAddress,
    tableLabel: 'Masa 5',
    orderNumber: 'ON-042',
    waiterName: 'Ali',
    items: [
      { productName: 'Adana Kebap', quantity: 2, unitPrice: 180, totalAmount: 360 },
      { productName: 'Ayran', quantity: 1, unitPrice: 35, totalAmount: 35 },
    ],
    subtotal: 395,
    taxAmount: 0,
    discountAmount: 0,
    total: 395,
    paymentMethod: 'cash',
    footer: settings.receiptFooter,
    printStyle: settings.printStyle,
  });
}

export function previewPaketHtml(settings: PrintSettings): string {
  return buildTakeawayHtml({
    restaurantName: settings.restaurantName || 'ŞefPOS',
    restaurantPhone: settings.restaurantPhone,
    restaurantAddress: settings.restaurantAddress,
    orderNumber: 'P-128',
    orderType: 'delivery',
    customerName: 'Ayşe Yılmaz',
    customerPhone: '0532 000 00 00',
    deliveryAddress: 'Atatürk Cad. No:12 D:3 Kadıköy / İstanbul',
    deliveryNote: 'Zili çalmayın',
    courierName: 'Mehmet K.',
    estimatedMinutes: 35,
    items: [
      { productName: 'Lahmacun', quantity: 2, unitPrice: 65, totalAmount: 130 },
      { productName: 'Ayran', quantity: 2, unitPrice: 35, totalAmount: 70 },
    ],
    subtotal: 200,
    total: 200,
    footer: settings.receiptFooter,
    printStyle: settings.printStyle,
  });
}
