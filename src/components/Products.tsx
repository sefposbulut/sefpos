import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Search, Printer, Ban, Save, X, Download, Barcode, Upload, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { loadPrintSettings, savePrintSettings } from '../lib/printService';
import { queryCache } from '../lib/queryCache';
import * as XLSX from 'xlsx';

function ean13Checksum(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function generateScaleBarcode(pluCode: string, prefix: string = '27'): string {
  const plu = pluCode.replace(/[^0-9]/g, '').padStart(5, '0').slice(-5);
  const base12 = `${prefix}${plu}00000`;
  const check = ean13Checksum(base12);
  return `${base12}${check}`;
}

function turkishToAscii(text: string): string {
  return text
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c');
}

function encodeWindows1254(str: string): Uint8Array {
  const map: Record<number, number> = {
    0x011E: 0xD0, 0x011F: 0xF0,
    0x015E: 0xDE, 0x015F: 0xFE,
    0x0130: 0xDD, 0x0131: 0xFD,
    0x00DC: 0xDC, 0x00FC: 0xFC,
    0x00D6: 0xD6, 0x00F6: 0xF6,
    0x00C7: 0xC7, 0x00E7: 0xE7,
  };
  const bytes: number[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0x3F;
    bytes.push(map[cp] ?? (cp <= 0xFF ? cp : 0x3F));
  }
  return new Uint8Array(bytes);
}

function exportCasScaleCSV(products: Product[]): void {
  const scaleProducts = products.filter(p => p.barcode && p.is_active);
  if (scaleProducts.length === 0) {
    alert('Barkod atanmış aktif ürün bulunamadı.');
    return;
  }
  const lines = scaleProducts.map(p => {
    const plu = p.barcode!.replace(/[^0-9]/g, '').slice(2, 7);
    const barcode = generateScaleBarcode(plu, p.barcode!.slice(0, 2));
    const price = (p.price * 100).toFixed(0);
    const name = p.name.substring(0, 28).toUpperCase();
    return `${plu};${name};${price};${barcode};${p.unit === 'kg' ? '1' : '0'}`;
  });
  const csv = `PLU;ADI;FIYAT;BARKOD;TARTILI\r\n${lines.join('\r\n')}`;
  const encoded = encodeWindows1254(csv);
  const blob = new Blob([encoded], { type: 'text/csv;charset=windows-1254;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cas_terazi_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü').replace(/Ş/g, 'ş')
    .replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç')
    .trim();
}

interface Category {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  vat_rate?: number | null;
  hugin_department_id?: number | null;
}

interface Product {
  id: string;
  category_id: string;
  name: string;
  price: number;
  cost: number;
  stock_quantity: number;
  unit: string;
  tax_rate: number;
  is_active: boolean;
  barcode?: string | null;
  printer_name?: string | null;
  scale_enabled?: boolean | null;
}

interface ProductVariant {
  id?: string;
  name: string;
  price_modifier: number;
}

interface ImportRow {
  name: string;
  category: string;
  price: number;
  cost: number;
  unit: string;
  barcode?: string;
  status: 'pending' | 'matched' | 'new_category' | 'error';
  matchedCategoryId?: string;
  matchedCategoryName?: string;
}

export function Products() {
  const { tenant } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importCategoryMap, setImportCategoryMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newProduct, setNewProduct] = useState({
    name: '',
    category_id: '',
    price: '',
    cost: '',
    stock_quantity: '',
    unit: 'adet',
    tax_rate: '20',
    image_url: '',
    barcode: '',
    plu_code: '',
    scale_prefix: '27',
    printer_name: '',
    scale_enabled: false,
    variants: [] as ProductVariant[],
  });

  const handlePluCodeChange = (plu: string) => {
    const clean = plu.replace(/[^0-9]/g, '').slice(0, 5);
    const barcode = clean ? generateScaleBarcode(clean, newProduct.scale_prefix) : '';
    setNewProduct(prev => ({ ...prev, plu_code: clean, barcode }));
  };

  const handleScalePrefixChange = (prefix: string) => {
    const barcode = newProduct.plu_code ? generateScaleBarcode(newProduct.plu_code, prefix) : '';
    setNewProduct(prev => ({ ...prev, scale_prefix: prefix, barcode }));
  };

  const [variantName, setVariantName] = useState('');
  const [variantPrice, setVariantPrice] = useState('');
  const [variantMultiplier, setVariantMultiplier] = useState('');
  const [variantMode, setVariantMode] = useState<'multiplier' | 'fixed'>('multiplier');

  const [newCategory, setNewCategory] = useState({
    name: '',
    color: '#F97316',
    vat_rate: null as number | null,
    hugin_department_id: null as number | null,
  });

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryForm, setEditCategoryForm] = useState<Category | null>(null);
  const [showCategoryPrinter, setShowCategoryPrinter] = useState<string | null>(null);
  const [categoryPrinterMap, setCategoryPrinterMap] = useState<Record<string, string>>({});
  const [disabledCategoryIds, setDisabledCategoryIds] = useState<string[]>([]);
  const [availablePrinters, setAvailablePrinters] = useState<{ name: string; label: string }[]>([]);

  useEffect(() => {
    const ps = loadPrintSettings();
    const map: Record<string, string> = {};
    ps.printers.forEach(p => {
      p.categoryIds.forEach(cid => {
        if (!map[cid]) map[cid] = p.printerName;
      });
    });
    setCategoryPrinterMap(map);
    setDisabledCategoryIds(ps.disabledCategoryIds || []);
    const configured = ps.printers.filter(p => p.printerName).map(p => ({ name: p.printerName, label: p.label || p.printerName }));
    setAvailablePrinters(configured);

    if ((window as any).electronAPI?.getPrinters) {
      (window as any).electronAPI.getPrinters().then((printers: any[]) => {
        if (printers && printers.length > 0) {
          setAvailablePrinters(prev => {
            const existingNames = new Set(prev.map(p => p.name));
            const extras = printers
              .filter((p: any) => p.name && !existingNames.has(p.name))
              .map((p: any) => ({ name: p.name, label: p.name }));
            return [...prev, ...extras];
          });
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    loadCategories();
    loadProducts();

    if (!tenant) return;

    const menuChannel = supabase
      .channel(`products-menu-${tenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `tenant_id=eq.${tenant.id}` }, () => {
        loadCategories(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `tenant_id=eq.${tenant.id}` }, () => {
        loadProducts(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(menuChannel);
    };
  }, [tenant]);

  const loadCategories = async (forceRefresh = false) => {
    if (!tenant) return;
    const { categories: prefetchedCategories } = await queryCache.getProductsAndCategories(tenant.id, undefined, forceRefresh);
    setCategories((prefetchedCategories || []) as Category[]);
  };

  const loadProducts = async (forceRefresh = false) => {
    if (!tenant) return;
    const { products: prefetchedProducts } = await queryCache.getProductsAndCategories(tenant.id, undefined, forceRefresh);
    const sortedProducts = ([...(prefetchedProducts || [])] as Product[]).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    setProducts(sortedProducts);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: 'array', codepage: 1254 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const getField = (row: any, ...keys: string[]): string => {
        for (const k of keys) {
          const val = row[k];
          if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
        }
        const lowerKeys = keys.map(k => k.toLowerCase());
        for (const [k, v] of Object.entries(row)) {
          if (lowerKeys.includes(k.toLowerCase().trim())) {
            const val = String(v).trim();
            if (val !== '') return val;
          }
        }
        return '';
      };

      const parsed: ImportRow[] = rows.map(row => {
        const rawName = getField(row,
          'Ürün Adı', 'Urun Adi', 'urun_adi', 'name', 'ADI', 'ÜRÜN ADI', 'Ürün adı', 'Ürün Ad\u0131'
        );
        const rawCat = getField(row,
          'Stok Tipi', 'Kategori', 'kategori', 'category', 'KATEGORI', 'STOK TİPİ', 'Stok tipi'
        );
        const salisfiyati = getField(row,
          'Satış Fiyatı', 'Satis Fiyati', 'Satış Fiy', 'SatisFiyati', 'Satış fiyatı',
          'Fiyat', 'fiyat', 'price', 'FIYAT', 'Satış Fiy ▼'
        );
        const alisfiyati = getField(row,
          'Alış Fiyatı', 'Alis Fiyati', 'Alış Fiy', 'AlisFiyati', 'Alış fiyatı',
          'Maliyet', 'maliyet', 'cost', 'Alış Fiy ▼'
        );
        const price = parseFloat(salisfiyati.replace(',', '.')) || 0;
        const cost = parseFloat(alisfiyati.replace(',', '.')) || 0;
        const rawUnit = getField(row, 'Birim', 'birim', 'unit', 'BIRIM');
        const unit = rawUnit.toLowerCase();
        const barcode = getField(row, 'Barkodu', 'Barkod', 'barkod', 'barcode', 'BARKOD', 'Barkod No') || undefined;

        if (!rawName) return null;

        const normCat = normalizeForMatch(rawCat);
        const matched = categories.find(c => normalizeForMatch(c.name) === normCat);

        return {
          name: rawName,
          category: rawCat,
          price,
          cost,
          unit: ['kg', 'lt', 'gr', 'adet'].includes(unit) ? unit : 'adet',
          barcode,
          status: matched ? 'matched' : rawCat ? 'new_category' : 'error',
          matchedCategoryId: matched?.id,
          matchedCategoryName: matched?.name,
        } as ImportRow;
      }).filter(Boolean) as ImportRow[];

      const catMap: Record<string, string> = {};
      parsed.forEach(r => {
        if (r.matchedCategoryId) catMap[r.category] = r.matchedCategoryId;
      });
      setImportCategoryMap(catMap);
      setImportRows(parsed);
      setImportDone(false);
      setShowImport(true);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (!tenant) return;
    setImporting(true);

    const catCache: Record<string, string> = { ...importCategoryMap };

    for (const row of importRows) {
      if (row.status === 'error' && !catCache[row.category]) continue;

      let catId = catCache[row.category] || row.matchedCategoryId;

      if (!catId && row.category) {
        const { data: newCat } = await supabase.from('categories').insert({
          tenant_id: tenant.id,
          name: row.category,
          color: '#64748B',
          sort_order: 999,
        }).select().single();
        if (newCat) {
          catId = newCat.id;
          catCache[row.category] = newCat.id;
        }
      }

      if (!catId) continue;

      await supabase.from('products').insert({
        tenant_id: tenant.id,
        category_id: catId,
        name: row.name,
        price: row.price,
        cost: row.cost,
        stock_quantity: 0,
        unit: row.unit,
        tax_rate: 20,
        barcode: row.barcode || null,
        is_active: true,
      });
    }

    await loadCategories(true);
    await loadProducts(true);
    setImporting(false);
    setImportDone(true);
  };

  const handleAddCategory = async () => {
    if (!tenant || !newCategory.name) return;

    // Optimistic update
    const tempId = crypto.randomUUID();
    const optimisticCategory: Category = {
      id: tempId,
      name: newCategory.name,
      color: newCategory.color,
      sort_order: categories.length,
    };
    setCategories(prev => [...prev, optimisticCategory]);

    const { error } = await supabase.from('categories').insert({
      tenant_id: tenant.id,
      name: newCategory.name,
      color: newCategory.color,
      sort_order: categories.length,
      vat_rate: newCategory.vat_rate,
      hugin_department_id: newCategory.hugin_department_id,
    });

    if (error) {
      setCategories(prev => prev.filter(c => c.id !== tempId));
    }

    setNewCategory({ name: '', color: '#F97316', vat_rate: null, hugin_department_id: null });
    setShowAddCategory(false);
  };

  const handleAddVariant = () => {
    if (!variantName) return;
    const basePrice = parseFloat(newProduct.price) || 0;
    let modifier = 0;
    if (variantMode === 'multiplier' && variantMultiplier) {
      const multiplier = parseFloat(variantMultiplier);
      modifier = parseFloat((basePrice * multiplier - basePrice).toFixed(2));
    } else if (variantMode === 'fixed' && variantPrice) {
      modifier = parseFloat(variantPrice);
    } else {
      return;
    }
    setNewProduct({
      ...newProduct,
      variants: [...newProduct.variants, { name: variantName, price_modifier: modifier }]
    });
    setVariantName('');
    setVariantPrice('');
    setVariantMultiplier('');
  };

  const handleRemoveVariant = (index: number) => {
    setNewProduct({
      ...newProduct,
      variants: newProduct.variants.filter((_, i) => i !== index)
    });
  };

  const handleAddProduct = async () => {
    if (!tenant || !newProduct.name || !newProduct.category_id) return;

    const { data: productData, error: productError } = await supabase
      .from('products')
      .insert({
        tenant_id: tenant.id,
        category_id: newProduct.category_id,
        name: newProduct.name,
        price: parseFloat(newProduct.price) || 0,
        cost: parseFloat(newProduct.cost) || 0,
        stock_quantity: parseFloat(newProduct.stock_quantity) || 0,
        unit: newProduct.unit,
        tax_rate: parseFloat(newProduct.tax_rate) || 20,
        image_url: newProduct.image_url || null,
        barcode: newProduct.barcode.trim() || null,
        printer_name: newProduct.printer_name.trim() || null,
        scale_enabled: newProduct.scale_enabled || false,
        is_active: true,
      })
      .select()
      .single();

    if (productError) return;

    if (productData && newProduct.variants.length > 0) {
      await supabase.from('product_variants').insert(
        newProduct.variants.map(v => ({
          tenant_id: tenant.id,
          product_id: productData.id,
          name: v.name,
          price_modifier: v.price_modifier,
        }))
      );
    }

    await loadProducts(true);
    setNewProduct({
      name: '',
      category_id: '',
      price: '',
      cost: '',
      stock_quantity: '',
      unit: 'adet',
      tax_rate: '20',
      image_url: '',
      barcode: '',
      plu_code: '',
      scale_prefix: '27',
      printer_name: '',
      scale_enabled: false,
      variants: [],
    });
    setVariantName('');
    setVariantPrice('');
    setShowAddProduct(false);
  };

  const startEdit = async (product: Product) => {
    const { data: variants } = await supabase
      .from('product_variants')
      .select('*')
      .eq('product_id', product.id);

    setEditForm({
      ...product,
      variants: variants || [],
    });
    setEditingProduct(product.id);
  };

  const handleUpdateProduct = async () => {
    if (!tenant || !editForm) return;

    await supabase
      .from('products')
      .update({
        category_id: editForm.category_id,
        name: editForm.name,
        price: editForm.price,
        cost: editForm.cost,
        stock_quantity: editForm.stock_quantity,
        unit: editForm.unit,
        tax_rate: editForm.tax_rate,
        image_url: editForm.image_url || null,
        barcode: editForm.barcode?.trim() || null,
        printer_name: editForm.printer_name?.trim() || null,
        scale_enabled: editForm.scale_enabled || false,
      })
      .eq('id', editForm.id);

    await supabase
      .from('product_variants')
      .delete()
      .eq('product_id', editForm.id);

    if (editForm.variants.length > 0) {
      await supabase.from('product_variants').insert(
        editForm.variants.map((v: ProductVariant) => ({
          tenant_id: tenant.id,
          product_id: editForm.id,
          name: v.name,
          price_modifier: v.price_modifier,
        }))
      );
    }

    await loadProducts(true);
    setEditingProduct(null);
    setEditForm(null);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Bu ürünü silmek istediğinizden emin misiniz?')) return;

    await supabase.from('product_variants').delete().eq('product_id', productId);
    await supabase.from('products').delete().eq('id', productId);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const count = products.filter(p => p.category_id === categoryId).length;
    if (count > 0) {
      if (!confirm(`Bu kategoride ${count} ürün var. Kategoriyi silmek istediğinizden emin misiniz? Ürünler kategorisiz kalacak.`)) return;
    } else {
      if (!confirm('Bu kategoriyi silmek istediğinizden emin misiniz?')) return;
    }
    await supabase.from('categories').delete().eq('id', categoryId);
  };

  const startEditCategory = (cat: Category) => {
    setEditingCategory(cat.id);
    setEditCategoryForm({ ...cat });
  };

  const handleUpdateCategory = async () => {
    if (!editCategoryForm) return;
    await supabase.from('categories').update({
      name: editCategoryForm.name,
      color: editCategoryForm.color,
      vat_rate: editCategoryForm.vat_rate ?? null,
      hugin_department_id: editCategoryForm.hugin_department_id ?? null,
    }).eq('id', editCategoryForm.id);
    setEditingCategory(null);
    setEditCategoryForm(null);
  };

  const saveCategoryPrinter = (categoryId: string, printerName: string) => {
    const newMap = { ...categoryPrinterMap };
    if (printerName) {
      newMap[categoryId] = printerName;
    } else {
      delete newMap[categoryId];
    }
    setCategoryPrinterMap(newMap);

    const ps = loadPrintSettings();
    const updatedPrinters = ps.printers.map(p => ({
      ...p,
      categoryIds: p.categoryIds.filter(cid => cid !== categoryId),
    }));
    if (printerName) {
      const targetPrinter = updatedPrinters.find(p => p.printerName === printerName);
      if (targetPrinter) {
        targetPrinter.categoryIds = [...targetPrinter.categoryIds, categoryId];
      }
    }
    savePrintSettings({ ...ps, printers: updatedPrinters });
    setShowCategoryPrinter(null);
  };

  const toggleCategoryPrintDisabled = (categoryId: string) => {
    const ps = loadPrintSettings();
    const current = ps.disabledCategoryIds || [];
    const isDisabled = current.includes(categoryId);
    const updated = isDisabled ? current.filter(id => id !== categoryId) : [...current, categoryId];
    setDisabledCategoryIds(updated);
    savePrintSettings({ ...ps, disabledCategoryIds: updated });
  };

  const searchLower = useMemo(() => search.toLowerCase(), [search]);
  const filteredProducts = useMemo(() =>
    products.filter(p =>
      (selectedCategory === 'all' || p.category_id === selectedCategory) &&
      (searchLower === '' || p.name.toLowerCase().includes(searchLower))
    ),
    [products, selectedCategory, searchLower]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-4 md:mb-8">
          <h1 className="text-xl md:text-3xl font-bold text-slate-800">Stok Yönetimi</h1>
          <div className="flex gap-2 md:gap-3 flex-wrap justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 md:px-4 md:py-3 bg-white border-2 border-green-200 text-green-700 rounded-lg md:rounded-xl hover:shadow-lg hover:border-green-300 transition-all active:scale-95 text-sm md:text-base flex items-center gap-1.5"
              title="Excel'den ürün içe aktar"
            >
              <Upload size={15} />
              <span className="hidden md:inline text-sm">Excel Import</span>
            </button>
            <button
              onClick={() => exportCasScaleCSV(products)}
              className="px-3 py-2 md:px-4 md:py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-lg md:rounded-xl hover:shadow-lg hover:border-slate-300 transition-all active:scale-95 text-sm md:text-base flex items-center gap-1.5"
              title="CAS Terazi için CSV dışa aktar"
            >
              <Download size={15} />
              <span className="hidden md:inline text-sm">CAS Terazi Export</span>
            </button>
            <button
              onClick={() => setShowAddCategory(true)}
              className="px-3 py-2 md:px-6 md:py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg md:rounded-xl hover:shadow-lg transition-all active:scale-95 text-sm md:text-base"
            >
              <Plus size={16} className="inline mr-1 md:mr-2 md:w-5 md:h-5" />
              <span className="hidden md:inline">Kategori</span>
            </button>
            <button
              onClick={() => setShowAddProduct(true)}
              className="px-3 py-2 md:px-6 md:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg md:rounded-xl hover:shadow-lg transition-all active:scale-95 text-sm md:text-base"
            >
              <Plus size={16} className="inline mr-1 md:mr-2 md:w-5 md:h-5" />
              <span className="hidden md:inline">Ürün</span>
            </button>
          </div>
        </div>

        <div className="mb-4 md:mb-6 flex gap-2 md:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Ürün ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 md:pl-12 pr-3 md:pr-4 py-2.5 md:py-3 bg-white border-2 border-slate-200 rounded-lg md:rounded-xl focus:border-blue-500 focus:outline-none text-sm md:text-lg"
            />
          </div>
        </div>

        <div className="flex gap-2 md:gap-3 mb-4 md:mb-6 overflow-x-auto pb-3 items-start scroll-smooth" style={{scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9'}}>
          <style>{`
            .scroll-smooth::-webkit-scrollbar {
              height: 6px;
            }
            .scroll-smooth::-webkit-scrollbar-track {
              background: #f1f5f9;
              border-radius: 3px;
            }
            .scroll-smooth::-webkit-scrollbar-thumb {
              background: #cbd5e1;
              border-radius: 3px;
            }
            .scroll-smooth::-webkit-scrollbar-thumb:hover {
              background: #94a3b8;
            }
          `}</style>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`flex-shrink-0 px-4 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl font-medium whitespace-nowrap transition-all text-sm md:text-base ${
              selectedCategory === 'all'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                : 'bg-white text-slate-600 hover:shadow-md'
            }`}
          >
            Tümü
          </button>
          {categories.map(cat => (
            <div key={cat.id} className="flex-shrink-0 group relative">
              {editingCategory === cat.id && editCategoryForm ? (
                <div className="flex flex-col gap-1.5 bg-white rounded-xl shadow-lg border border-slate-200 p-2 min-w-[320px]">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editCategoryForm.name}
                      onChange={e => setEditCategoryForm({ ...editCategoryForm, name: e.target.value })}
                      className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                      onKeyDown={e => e.key === 'Enter' && handleUpdateCategory()}
                      autoFocus
                    />
                    <div className="flex gap-1">
                      {['#F97316','#EF4444','#F59E0B','#10B981','#3B82F6','#06B6D4','#EC4899','#64748B'].map(c => (
                        <button
                          key={c}
                          onClick={() => setEditCategoryForm({ ...editCategoryForm, color: c })}
                          className="w-5 h-5 rounded-full border-2 transition-all"
                          style={{ backgroundColor: c, borderColor: editCategoryForm.color === c ? '#1e293b' : 'transparent' }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={editCategoryForm.vat_rate ?? ''}
                      onChange={e => setEditCategoryForm({ ...editCategoryForm, vat_rate: e.target.value === '' ? null : parseInt(e.target.value) })}
                      className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                      title="KDV Oranı"
                    >
                      <option value="">KDV: Global</option>
                      <option value="0">KDV: %0</option>
                      <option value="1">KDV: %1</option>
                      <option value="8">KDV: %8</option>
                      <option value="10">KDV: %10</option>
                      <option value="18">KDV: %18</option>
                      <option value="20">KDV: %20</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      placeholder="Dept. No"
                      value={editCategoryForm.hugin_department_id ?? ''}
                      onChange={e => setEditCategoryForm({ ...editCategoryForm, hugin_department_id: e.target.value === '' ? null : parseInt(e.target.value) })}
                      className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:border-blue-500 outline-none"
                      title="Hugin Departman No"
                    />
                    <button onClick={handleUpdateCategory} className="p-1 text-green-600 hover:bg-green-50 rounded">
                      <Save size={14} />
                    </button>
                    <button onClick={() => { setEditingCategory(null); setEditCategoryForm(null); }} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-2 md:px-5 md:py-3 rounded-lg md:rounded-xl font-medium whitespace-nowrap transition-all text-sm md:text-base pr-16 ${
                      selectedCategory === cat.id ? 'text-white shadow-lg' : 'bg-white text-slate-600 hover:shadow-md'
                    }`}
                    style={{ backgroundColor: selectedCategory === cat.id ? cat.color : undefined }}
                  >
                    {cat.name}
                    {disabledCategoryIds.includes(cat.id) ? (
                      <span className="ml-1.5 text-xs opacity-60">
                        <Ban size={10} className="inline" />
                      </span>
                    ) : categoryPrinterMap[cat.id] ? (
                      <span className="ml-1.5 text-xs opacity-70 inline-flex items-center gap-0.5">
                        <Printer size={9} className="inline" />
                        <span className="text-[10px]">{availablePrinters.find(p => p.name === categoryPrinterMap[cat.id])?.label || categoryPrinterMap[cat.id]}</span>
                      </span>
                    ) : null}
                  </button>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 bg-white/90 rounded-lg px-1 py-0.5 shadow opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); setShowCategoryPrinter(showCategoryPrinter === cat.id ? null : cat.id); }}
                      className={`p-1 rounded transition ${disabledCategoryIds.includes(cat.id) ? 'text-slate-400 hover:bg-slate-100' : 'text-orange-500 hover:bg-orange-50'}`}
                      title="Yazıcı ayarları"
                    >
                      <Printer size={12} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); startEditCategory(cat); }}
                      className="p-1 text-blue-500 hover:bg-blue-50 rounded transition"
                      title="Düzenle"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                      className="p-1 text-red-500 hover:bg-red-50 rounded transition"
                      title="Sil"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {showCategoryPrinter === cat.id && (
                    <>
                      <div className="fixed inset-0 z-30 bg-black/10" onClick={() => setShowCategoryPrinter(null)} />
                      <div className="fixed z-40 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 w-72" style={{
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)'
                      }}>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                            <Printer size={12} className="text-orange-500" /> {cat.name}
                          </p>
                          <button onClick={() => setShowCategoryPrinter(null)} className="p-0.5 text-slate-400 hover:text-slate-600 rounded">
                            <X size={12} />
                          </button>
                        </div>
                        <div className="space-y-1 mb-2">
                          <button
                            onClick={() => { toggleCategoryPrintDisabled(cat.id); setShowCategoryPrinter(null); }}
                            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 ${disabledCategoryIds.includes(cat.id) ? 'bg-red-50 text-red-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                          >
                            <Ban size={11} />
                            {disabledCategoryIds.includes(cat.id) ? 'Yazdirmay Etkinlestir' : 'Yazdirmay Kapat (Kagit Cikmasin)'}
                          </button>
                        </div>
                        {!disabledCategoryIds.includes(cat.id) && (
                          <div className="border-t border-slate-100 pt-2">
                            <p className="text-xs text-slate-400 mb-1.5">Yazici Yonlendirmesi</p>
                            {availablePrinters.length === 0 ? (
                              <button
                                onClick={() => {
                                  setShowCategoryPrinter(null);
                                  (window as any).dispatchEvent(new CustomEvent('openPrinterSettings'));
                                }}
                                className="w-full text-left px-2 py-1.5 rounded-lg text-xs transition text-blue-600 hover:bg-blue-50 font-medium"
                              >
                                Yazici Ayarlari Gozat →
                              </button>
                            ) : (
                              <div className="space-y-1">
                                <button
                                  onClick={() => saveCategoryPrinter(cat.id, '')}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 ${!categoryPrinterMap[cat.id] ? 'bg-orange-50 text-orange-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                                >
                                  <Printer size={10} /> Tum yazicilara gonder
                                </button>
                                {availablePrinters.map(p => (
                                  <button
                                    key={p.name}
                                    onClick={() => saveCategoryPrinter(cat.id, p.name)}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition ${categoryPrinterMap[cat.id] === p.name ? 'bg-orange-50 text-orange-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                                  >
                                    <span className="font-semibold">{p.label}</span>
                                    {p.label !== p.name && <span className="text-slate-400 ml-1">({p.name})</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2 md:space-y-3">
          {filteredProducts.map(product => {
            const category = categories.find(c => c.id === product.category_id);
            const isEditing = editingProduct === product.id;

            return (
              <div key={product.id} className="bg-white rounded-lg md:rounded-xl shadow-md p-3 md:p-4 hover:shadow-lg transition-all">
                {isEditing ? (
                  <div className="space-y-2 md:space-y-3">
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      placeholder="Ürün Adı"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={editForm.category_id}
                        onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                        className="px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      >
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={editForm.image_url || ''}
                        onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })}
                        className="px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Resim URL"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <input
                        type="number"
                        value={editForm.price}
                        onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) })}
                        className="px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Fiyat"
                      />
                      <input
                        type="number"
                        value={editForm.cost}
                        onChange={(e) => setEditForm({ ...editForm, cost: parseFloat(e.target.value) })}
                        className="px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Maliyet"
                      />
                      <input
                        type="number"
                        value={editForm.stock_quantity}
                        onChange={(e) => setEditForm({ ...editForm, stock_quantity: parseFloat(e.target.value) })}
                        className="px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                        placeholder="Stok"
                      />
                      <select
                        value={editForm.unit}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        className="px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      >
                        <option value="adet">Adet</option>
                        <option value="kg">Kg</option>
                        <option value="lt">Lt</option>
                        <option value="gr">Gr</option>
                      </select>
                    </div>
                    {availablePrinters.length > 0 && (
                      <div className="border border-orange-200 rounded-lg p-3 bg-orange-50/40">
                        <div className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                          <Printer className="w-3 h-3 text-orange-500" /> Yazıcı Yönlendirmesi
                        </div>
                        <select
                          value={editForm.printer_name || ''}
                          onChange={e => setEditForm({ ...editForm, printer_name: e.target.value || null })}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-orange-400 focus:outline-none"
                        >
                          <option value="">Kategori/Varsayılan yazıcı kullan</option>
                          {availablePrinters.map(p => (
                            <option key={p.name} value={p.name}>{p.label || p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                      <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                        <Barcode className="w-3 h-3" /> Terazi Barkod
                      </div>
                      <div className="flex gap-2 mb-2">
                        <select
                          value={editForm.barcode ? editForm.barcode.slice(0, 2) : '27'}
                          onChange={e => {
                            const prefix = e.target.value;
                            const plu = editForm.barcode ? editForm.barcode.slice(2, 7) : '';
                            const barcode = plu ? generateScaleBarcode(plu, prefix) : '';
                            setEditForm({ ...editForm, barcode: barcode || null });
                          }}
                          className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                        >
                          <option value="27">27</option>
                          <option value="28">28</option>
                          <option value="29">29</option>
                        </select>
                        <input
                          type="text"
                          value={editForm.barcode ? editForm.barcode.slice(2, 7) : ''}
                          onChange={e => {
                            const plu = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                            const prefix = editForm.barcode ? editForm.barcode.slice(0, 2) : '27';
                            const barcode = plu ? generateScaleBarcode(plu, prefix) : '';
                            setEditForm({ ...editForm, barcode: barcode || null });
                          }}
                          className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white"
                          placeholder="PLU/Stok Kodu (5 hane)"
                          maxLength={5}
                        />
                      </div>
                      {editForm.barcode && (
                        <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded px-2 py-1">
                          <Barcode className="w-3 h-3 text-green-600" />
                          <span className="font-mono text-xs font-bold text-slate-700 tracking-widest">{editForm.barcode}</span>
                          <button
                            onClick={() => setEditForm({ ...editForm, barcode: null })}
                            className="ml-auto text-gray-400 hover:text-red-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="border border-emerald-100 rounded-lg p-3 bg-emerald-50/40">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editForm.scale_enabled || false}
                          onChange={(e) => setEditForm({ ...editForm, scale_enabled: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-700">Bilgisayar Bağlantılı Terazi</div>
                          <div className="text-[10px] text-slate-500">CAS ERJ gibi canlı tartı sistemi</div>
                        </div>
                      </label>
                    </div>

                    <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/40">
                      <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                        KDV Oranı
                        <span className="text-slate-400 font-normal">(Bu ürüne özel)</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {[0, 1, 10, 20].map(rate => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => setEditForm({ ...editForm, tax_rate: rate })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                              editForm.tax_rate === rate
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                            }`}
                          >
                            %{rate}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editForm.variants.length > 0 && (
                      <div className="border-t pt-2">
                        <div className="text-xs font-medium text-slate-600 mb-2">Porsiyon Seçenekleri:</div>
                        <div className="flex flex-wrap gap-2">
                          {editForm.variants.map((v: ProductVariant, i: number) => (
                            <div key={i} className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg text-sm">
                              <span>{v.name}: {v.price_modifier > 0 ? '+' : ''}{v.price_modifier}₺</span>
                              <button
                                onClick={() => setEditForm({
                                  ...editForm,
                                  variants: editForm.variants.filter((_: any, idx: number) => idx !== i)
                                })}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingProduct(null);
                          setEditForm(null);
                        }}
                        className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handleUpdateProduct}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="md:hidden">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-bold text-slate-800 text-sm">{product.name}</div>
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white mt-1"
                            style={{ backgroundColor: category?.color }}
                          >
                            {category?.name}
                          </span>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={() => startEdit(product)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-green-50 p-2 rounded">
                          <div className="text-slate-500">Fiyat</div>
                          <div className="font-bold text-green-600">{product.price.toFixed(0)} ₺</div>
                        </div>
                        <div className="bg-slate-50 p-2 rounded">
                          <div className="text-slate-500">Stok</div>
                          <div className="font-medium text-slate-700">{product.stock_quantity} {product.unit}</div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-slate-500">Kar</div>
                          <div className="font-bold text-blue-600">
                            {((product.price - product.cost) / product.price * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="hidden md:flex items-center gap-4">
                      <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                        <div>
                          <div className="font-bold text-slate-800 text-lg">{product.name}</div>
                          <div className="flex items-center gap-1 flex-wrap mt-1">
                            <span
                              className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: category?.color }}
                            >
                              {category?.name}
                            </span>
                            {product.barcode && (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-600">
                                {product.barcode}
                              </span>
                            )}
                            {product.printer_name ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                                <Printer size={9} /> {product.printer_name}
                              </span>
                            ) : categoryPrinterMap[product.category_id] ? (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                                <Printer size={9} /> {categoryPrinterMap[product.category_id]}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Fiyat</div>
                          <div className="font-bold text-green-600 text-base">{product.price.toFixed(2)} ₺</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Maliyet</div>
                          <div className="font-medium text-slate-700 text-base">{product.cost.toFixed(2)} ₺</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Stok</div>
                          <div className="font-medium text-slate-700 text-base">{product.stock_quantity} {product.unit}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Fiyat</div>
                          <div className="font-medium text-slate-700 text-xs">KDV Dahil</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-slate-500">Kar</div>
                          <div className="font-bold text-blue-600 text-base">
                            {((product.price - product.cost) / product.price * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(product)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showAddCategory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6">Yeni Kategori</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Kategori Adı"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Renk</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {['#F97316','#EF4444','#F59E0B','#10B981','#3B82F6','#06B6D4','#8B5CF6','#EC4899','#64748B','#1D4ED8'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewCategory({ ...newCategory, color })}
                      className="w-9 h-9 rounded-lg border-4 transition-all"
                      style={{
                        backgroundColor: color,
                        borderColor: newCategory.color === color ? '#1e293b' : 'transparent',
                        transform: newCategory.color === color ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  value={newCategory.color}
                  onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                  className="w-full h-10 rounded-xl cursor-pointer border-2 border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">KDV Oranı</label>
                  <select
                    value={newCategory.vat_rate ?? ''}
                    onChange={(e) => setNewCategory({ ...newCategory, vat_rate: e.target.value === '' ? null : parseInt(e.target.value) })}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                  >
                    <option value="">Global ayar</option>
                    <option value="0">%0</option>
                    <option value="1">%1</option>
                    <option value="8">%8</option>
                    <option value="10">%10</option>
                    <option value="18">%18</option>
                    <option value="20">%20</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Hugin Departman No</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Dept. No"
                    value={newCategory.hugin_department_id ?? ''}
                    onChange={(e) => setNewCategory({ ...newCategory, hugin_department_id: e.target.value === '' ? null : parseInt(e.target.value) })}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddCategory(false)}
                  className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-all"
                >
                  İptal
                </button>
                <button
                  onClick={handleAddCategory}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:shadow-lg transition-all"
                >
                  Ekle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">Yeni Ürün</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Ürün Adı"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
              />
              <select
                value={newProduct.category_id}
                onChange={(e) => {
                  const catId = e.target.value;
                  const cat = categories.find(c => c.id === catId);
                  const updates: Partial<typeof newProduct> = { category_id: catId };
                  if (cat && cat.vat_rate != null) {
                    updates.tax_rate = String(cat.vat_rate);
                  }
                  setNewProduct(prev => ({ ...prev, ...updates }));
                }}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
              >
                <option value="">Kategori Seçin</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}{cat.vat_rate != null ? ` (KDV %${cat.vat_rate})` : ''}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Fiyat (₺)"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  className="px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
                />
                <input
                  type="number"
                  placeholder="Maliyet (₺)"
                  value={newProduct.cost}
                  onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })}
                  className="px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Stok Miktarı"
                  value={newProduct.stock_quantity}
                  onChange={(e) => setNewProduct({ ...newProduct, stock_quantity: e.target.value })}
                  className="px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
                />
                <select
                  value={newProduct.unit}
                  onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                  className="px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
                >
                  <option value="adet">Adet</option>
                  <option value="kg">Kilogram</option>
                  <option value="lt">Litre</option>
                  <option value="gr">Gram</option>
                </select>
              </div>
              <div className="border-2 border-blue-100 rounded-xl p-4 bg-blue-50/40">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-bold text-slate-700">KDV Oranı</span>
                  <span className="text-xs text-slate-400">(Bu ürüne özel)</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[0, 1, 8, 10, 18, 20].map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setNewProduct({ ...newProduct, tax_rate: String(rate) })}
                      className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        newProduct.tax_rate === String(rate)
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                      }`}
                    >
                      %{rate}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                placeholder="Resim URL (isteğe bağlı)"
                value={newProduct.image_url}
                onChange={(e) => setNewProduct({ ...newProduct, image_url: e.target.value })}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-lg"
              />
              <div className="border-2 border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="flex items-center gap-2 mb-3">
                  <Barcode className="w-4 h-4 text-slate-500" />
                  <span className="font-bold text-sm text-slate-700">Terazi Barkod Entegrasyonu</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="col-span-1">
                    <label className="block text-xs text-slate-500 mb-1">Prefix</label>
                    <select
                      value={newProduct.scale_prefix}
                      onChange={e => handleScalePrefixChange(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm bg-white"
                    >
                      <option value="27">27 - Tartı (gram)</option>
                      <option value="28">28 - Tartı (gram)</option>
                      <option value="29">29 - Fiyat</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-500 mb-1">PLU / Stok Kodu (5 hane)</label>
                    <input
                      type="text"
                      placeholder="Örn: 06564"
                      value={newProduct.plu_code}
                      onChange={e => handlePluCodeChange(e.target.value)}
                      className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm font-mono bg-white"
                      maxLength={5}
                    />
                  </div>
                </div>
                {newProduct.barcode ? (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <Barcode className="w-4 h-4 text-green-600 shrink-0" />
                    <div>
                      <div className="text-xs text-green-600 font-medium">Otomatik oluşturulan barkod</div>
                      <div className="font-mono font-bold text-slate-700 text-sm tracking-widest">{newProduct.barcode}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">PLU kodu girildiğinde EAN-13 barkod otomatik oluşturulur.</p>
                )}
              </div>

              <div className="border-2 border-emerald-100 rounded-xl p-4 bg-emerald-50/40">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newProduct.scale_enabled}
                    onChange={(e) => setNewProduct({ ...newProduct, scale_enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <div>
                    <div className="text-sm font-bold text-slate-700">Bilgisayar Bağlantılı Terazi</div>
                    <div className="text-xs text-slate-500">CAS ERJ gibi canlı tartı sistemi</div>
                  </div>
                </label>
              </div>

              {availablePrinters.length > 0 && (
                <div className="border-2 border-orange-100 rounded-xl p-4 bg-orange-50/40">
                  <div className="flex items-center gap-2 mb-2">
                    <Printer className="w-4 h-4 text-orange-500" />
                    <span className="font-bold text-sm text-slate-700">Yazıcı Yönlendirmesi (İsteğe Bağlı)</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-2">Boş bırakılırsa kategori yazıcısı veya varsayılan yazıcı kullanılır.</p>
                  <select
                    value={newProduct.printer_name}
                    onChange={e => setNewProduct({ ...newProduct, printer_name: e.target.value })}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm bg-white"
                  >
                    <option value="">Kategori/Varsayılan yazıcı kullan</option>
                    {availablePrinters.map(p => (
                      <option key={p.name} value={p.name}>{p.label || p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="border-t-2 border-slate-200 pt-4 mt-4">
                <h3 className="font-bold text-lg mb-1 text-slate-700">Porsiyon Seçenekleri (İsteğe Bağlı)</h3>
                {newProduct.price && (
                  <p className="text-sm text-slate-500 mb-3">Ana fiyat: <span className="font-semibold text-slate-700">{parseFloat(newProduct.price).toFixed(2)} ₺</span></p>
                )}

                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setVariantMode('multiplier')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${variantMode === 'multiplier' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    Carpan ile (Az / Tam / 1.5x)
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariantMode('fixed')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${variantMode === 'fixed' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    Sabit Fiyat Farkı (₺)
                  </button>
                </div>

                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Porsiyon adı (Az, Tam, 1.5x...)"
                    value={variantName}
                    onChange={(e) => setVariantName(e.target.value)}
                    className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                  />
                  {variantMode === 'multiplier' ? (
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Carpan"
                        value={variantMultiplier}
                        onChange={(e) => setVariantMultiplier(e.target.value)}
                        className="w-28 px-3 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                      />
                      {variantMultiplier && newProduct.price && (
                        <div className="absolute -bottom-5 left-0 right-0 text-center text-xs text-orange-600 font-medium">
                          = {(parseFloat(newProduct.price) * parseFloat(variantMultiplier)).toFixed(2)} ₺
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Fark (₺)"
                      value={variantPrice}
                      onChange={(e) => setVariantPrice(e.target.value)}
                      className="w-28 px-3 py-3 border-2 border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none"
                    />
                  )}
                  <button
                    onClick={handleAddVariant}
                    className="px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all active:scale-95"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {[{label:'Az (0.5x)', val:'0.5'},{label:'Tam (1x)', val:'1'},{label:'1.5x', val:'1.5'},{label:'2x', val:'2'}].map(preset => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => { setVariantMode('multiplier'); setVariantMultiplier(preset.val); }}
                      className={`px-3 py-1.5 text-sm rounded-lg border-2 transition-all ${variantMultiplier === preset.val && variantMode === 'multiplier' ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {newProduct.variants.length > 0 && (
                  <div className="space-y-2">
                    {newProduct.variants.map((variant, index) => {
                      const basePrice = parseFloat(newProduct.price) || 0;
                      const finalPrice = basePrice + variant.price_modifier;
                      return (
                      <div key={index} className="flex justify-between items-center bg-slate-50 px-4 py-3 rounded-xl">
                        <span className="font-medium text-slate-700">{variant.name}</span>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs text-slate-500">
                              {variant.price_modifier > 0 ? '+' : ''}{variant.price_modifier.toFixed(2)} ₺ fark
                            </div>
                            <div className="text-green-600 font-bold text-sm">{finalPrice.toFixed(2)} ₺</div>
                          </div>
                          <button
                            onClick={() => handleRemoveVariant(index)}
                            className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddProduct(false)}
                  className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-all"
                >
                  İptal
                </button>
                <button
                  onClick={handleAddProduct}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:shadow-lg transition-all"
                >
                  Ekle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <FileSpreadsheet size={20} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Excel Ürün Aktarımı</h2>
                  <p className="text-sm text-slate-500">{importRows.length} ürün bulundu</p>
                </div>
              </div>
              <button onClick={() => { setShowImport(false); setImportRows([]); setImportDone(false); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition">
                <X size={20} />
              </button>
            </div>

            {importDone ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 gap-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-800">Aktarım Tamamlandı</h3>
                <p className="text-slate-500 text-center">{importRows.filter(r => r.status !== 'error').length} ürün başarıyla eklendi.</p>
                <button
                  onClick={() => { setShowImport(false); setImportRows([]); setImportDone(false); }}
                  className="mt-2 px-8 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium"
                >
                  Tamam
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                    <strong>Desteklenen sütunlar:</strong> Ürün Adı / Urun Adi &nbsp;·&nbsp; Stok Tipi / Kategori &nbsp;·&nbsp; Satış Fiyatı &nbsp;·&nbsp; Alış Fiyatı / Maliyet &nbsp;·&nbsp; Birim (adet/kg/lt/gr) &nbsp;·&nbsp; Barkodu / Barkod
                  </div>
                  <div className="space-y-2">
                    {importRows.map((row, i) => (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
                        row.status === 'matched' ? 'bg-green-50 border-green-200' :
                        row.status === 'new_category' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-red-50 border-red-200'
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-800 truncate">{row.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {row.price.toFixed(2)} ₺
                            {row.cost > 0 && ` · Maliyet: ${row.cost.toFixed(2)} ₺`}
                            {row.unit && ` · ${row.unit}`}
                            {row.barcode && ` · ${row.barcode}`}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right min-w-[160px]">
                          {row.status === 'matched' ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <CheckCircle size={14} className="text-green-600" />
                              <span className="text-green-700 text-xs font-medium">{row.matchedCategoryName}</span>
                            </div>
                          ) : row.status === 'new_category' ? (
                            <div>
                              <div className="flex items-center gap-1.5 justify-end mb-1">
                                <AlertCircle size={14} className="text-yellow-600" />
                                <span className="text-yellow-700 text-xs">Yeni kategori oluşturulacak</span>
                              </div>
                              <select
                                className="text-xs border border-yellow-300 rounded-lg px-2 py-1 bg-white w-full"
                                value={importCategoryMap[row.category] || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setImportCategoryMap(prev => ({ ...prev, [row.category]: val }));
                                  setImportRows(prev => prev.map((r, ri) =>
                                    r.category === row.category
                                      ? { ...r, status: val ? 'matched' : 'new_category', matchedCategoryId: val || undefined, matchedCategoryName: categories.find(c => c.id === val)?.name }
                                      : r
                                  ));
                                }}
                              >
                                <option value="">-- Yeni: {row.category} --</option>
                                {categories.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 justify-end">
                              <AlertCircle size={14} className="text-red-500" />
                              <span className="text-red-600 text-xs">Kategori yok, atlanacak</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div className="text-sm text-slate-500">
                    <span className="text-green-600 font-semibold">{importRows.filter(r => r.status === 'matched').length} eşleşti</span>
                    {importRows.filter(r => r.status === 'new_category').length > 0 && (
                      <span className="ml-3 text-yellow-600 font-semibold">{importRows.filter(r => r.status === 'new_category').length} yeni kategori</span>
                    )}
                    {importRows.filter(r => r.status === 'error').length > 0 && (
                      <span className="ml-3 text-red-500 font-semibold">{importRows.filter(r => r.status === 'error').length} atlanacak</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowImport(false); setImportRows([]); }}
                      className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition font-medium"
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleImportConfirm}
                      disabled={importing || importRows.filter(r => r.status !== 'error').length === 0}
                      className="px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {importing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Aktarılıyor...
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          {importRows.filter(r => r.status !== 'error').length} Ürünü Aktar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
