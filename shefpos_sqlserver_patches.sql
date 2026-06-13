-- ŞefPOS SQL Server — bulut şeması ile uyum için ek tablolar (mevcut DB'ye güvenli)

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='waiter_calls' AND xtype='U')
CREATE TABLE waiter_calls (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    branch_id UNIQUEIDENTIFIER NOT NULL REFERENCES branches(id) ON DELETE NO ACTION,
    table_label NVARCHAR(255) NOT NULL DEFAULT '',
    call_type NVARCHAR(20) NOT NULL DEFAULT 'service'
        CHECK (call_type IN ('service','bill','water','help')),
    message NVARCHAR(MAX),
    status NVARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','seen','resolved','cancelled')),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    resolved_at DATETIME2 NULL,
    resolved_by UNIQUEIDENTIFIER NULL REFERENCES app_users(id) ON DELETE NO ACTION
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_waiter_calls_branch_status' AND object_id = OBJECT_ID(N'waiter_calls'))
    CREATE INDEX idx_waiter_calls_branch_status ON waiter_calls(branch_id, status, created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_waiter_calls_tenant' AND object_id = OBJECT_ID(N'waiter_calls'))
    CREATE INDEX idx_waiter_calls_tenant ON waiter_calls(tenant_id, created_at DESC);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='print_settings' AND xtype='U')
CREATE TABLE print_settings (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE NO ACTION,
    settings NVARCHAR(MAX) NOT NULL DEFAULT '{}',
    updated_by UNIQUEIDENTIFIER NULL REFERENCES app_users(id) ON DELETE NO ACTION,
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_print_settings_tenant' AND object_id = OBJECT_ID(N'print_settings'))
    CREATE INDEX idx_print_settings_tenant ON print_settings(tenant_id);
GO

IF COL_LENGTH('print_settings', 'branch_key') IS NULL
BEGIN
    ALTER TABLE print_settings ADD branch_key AS
        ISNULL(CONVERT(NVARCHAR(36), branch_id), '00000000-0000-0000-0000-000000000000') PERSISTED;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_print_settings_tenant_branch_unique' AND object_id = OBJECT_ID(N'print_settings'))
    CREATE UNIQUE INDEX idx_print_settings_tenant_branch_unique
        ON print_settings(tenant_id, branch_key);
GO

-- Menü: kategoriler / urunler (eski DB'de tablo veya kolon eksikse urun ekrani calismaz)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='categories' AND xtype='U')
CREATE TABLE categories (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    color NVARCHAR(20) NOT NULL DEFAULT '#3B82F6',
    sort_order INT NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    vat_rate INT NULL,
    hugin_department_id INT NULL,
    hugin_vat_department INT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF COL_LENGTH('categories', 'sort_order') IS NULL
    ALTER TABLE categories ADD sort_order INT NOT NULL DEFAULT 0;
IF COL_LENGTH('categories', 'display_order') IS NULL
    ALTER TABLE categories ADD display_order INT NOT NULL DEFAULT 0;
IF COL_LENGTH('categories', 'vat_rate') IS NULL
    ALTER TABLE categories ADD vat_rate INT NULL;
IF COL_LENGTH('categories', 'hugin_department_id') IS NULL
    ALTER TABLE categories ADD hugin_department_id INT NULL;
IF COL_LENGTH('categories', 'hugin_vat_department') IS NULL
    ALTER TABLE categories ADD hugin_vat_department INT NOT NULL DEFAULT 1;
IF COL_LENGTH('categories', 'created_at') IS NULL
    ALTER TABLE categories ADD created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE();
IF COL_LENGTH('categories', 'image_url') IS NULL
    ALTER TABLE categories ADD image_url NVARCHAR(1000) NULL;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='products' AND xtype='U')
CREATE TABLE products (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UNIQUEIDENTIFIER NULL REFERENCES categories(id) ON DELETE NO ACTION,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NULL,
    barcode NVARCHAR(100) NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    stock_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit NVARCHAR(20) NOT NULL DEFAULT N'adet',
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 20,
    is_active BIT NOT NULL DEFAULT 1,
    is_available BIT NOT NULL DEFAULT 1,
    image_url NVARCHAR(1000) NULL,
    printer_name NVARCHAR(255) NULL,
    scale_enabled BIT NOT NULL DEFAULT 0,
    plu_code NVARCHAR(20) NULL,
    scale_prefix NVARCHAR(10) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF COL_LENGTH('products', 'description') IS NULL
    ALTER TABLE products ADD description NVARCHAR(MAX) NULL;
IF COL_LENGTH('products', 'barcode') IS NULL
    ALTER TABLE products ADD barcode NVARCHAR(100) NULL;
IF COL_LENGTH('products', 'cost') IS NULL
    ALTER TABLE products ADD cost DECIMAL(10,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('products', 'stock_quantity') IS NULL
    ALTER TABLE products ADD stock_quantity DECIMAL(10,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('products', 'unit') IS NULL
    ALTER TABLE products ADD unit NVARCHAR(20) NOT NULL DEFAULT N'adet';
IF COL_LENGTH('products', 'tax_rate') IS NULL
    ALTER TABLE products ADD tax_rate DECIMAL(5,2) NOT NULL DEFAULT 20;
IF COL_LENGTH('products', 'is_active') IS NULL
    ALTER TABLE products ADD is_active BIT NOT NULL DEFAULT 1;
IF COL_LENGTH('products', 'is_available') IS NULL
    ALTER TABLE products ADD is_available BIT NOT NULL DEFAULT 1;
IF COL_LENGTH('products', 'image_url') IS NULL
    ALTER TABLE products ADD image_url NVARCHAR(1000) NULL;
IF COL_LENGTH('products', 'printer_name') IS NULL
    ALTER TABLE products ADD printer_name NVARCHAR(255) NULL;
IF COL_LENGTH('products', 'scale_enabled') IS NULL
    ALTER TABLE products ADD scale_enabled BIT NOT NULL DEFAULT 0;
IF COL_LENGTH('products', 'plu_code') IS NULL
    ALTER TABLE products ADD plu_code NVARCHAR(20) NULL;
IF COL_LENGTH('products', 'scale_prefix') IS NULL
    ALTER TABLE products ADD scale_prefix NVARCHAR(10) NULL;
IF COL_LENGTH('products', 'updated_at') IS NULL
    ALTER TABLE products ADD updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE();
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='product_variants' AND xtype='U')
CREATE TABLE product_variants (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UNIQUEIDENTIFIER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    price_modifier DECIMAL(10,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF COL_LENGTH('product_variants', 'sort_order') IS NULL
    ALTER TABLE product_variants ADD sort_order INT NOT NULL DEFAULT 0;
IF COL_LENGTH('product_variants', 'is_active') IS NULL
    ALTER TABLE product_variants ADD is_active BIT NOT NULL DEFAULT 1;
IF COL_LENGTH('product_variants', 'updated_at') IS NULL
    ALTER TABLE product_variants ADD updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE();
GO

-- order_items: eski kurulumlarda eksik kolonlar (product_id hatasi = masa tutari / urun ekleme bozulur)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='order_items' AND xtype='U')
CREATE TABLE order_items (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    order_id UNIQUEIDENTIFIER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UNIQUEIDENTIFIER NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    product_id UNIQUEIDENTIFIER NULL REFERENCES products(id) ON DELETE NO ACTION,
    variant_id UNIQUEIDENTIFIER NULL REFERENCES product_variants(id) ON DELETE NO ACTION,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5,2) NOT NULL DEFAULT 20,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    notes NVARCHAR(MAX) NULL,
    variant_name NVARCHAR(255) NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',
    cancellation_reason NVARCHAR(MAX) NULL,
    cancelled_by UNIQUEIDENTIFIER NULL,
    cancelled_at DATETIME2 NULL,
    paid_quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    paid_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF COL_LENGTH('order_items', 'tenant_id') IS NULL
    ALTER TABLE order_items ADD tenant_id UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('order_items', 'product_id') IS NULL
    ALTER TABLE order_items ADD product_id UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('order_items', 'variant_id') IS NULL
    ALTER TABLE order_items ADD variant_id UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('order_items', 'tax_rate') IS NULL
    ALTER TABLE order_items ADD tax_rate DECIMAL(5,2) NOT NULL DEFAULT 20;
IF COL_LENGTH('order_items', 'discount_amount') IS NULL
    ALTER TABLE order_items ADD discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('order_items', 'total_amount') IS NULL
    ALTER TABLE order_items ADD total_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('order_items', 'variant_name') IS NULL
    ALTER TABLE order_items ADD variant_name NVARCHAR(255) NULL;
IF COL_LENGTH('order_items', 'status') IS NULL
    ALTER TABLE order_items ADD status NVARCHAR(20) NOT NULL DEFAULT 'pending';
IF COL_LENGTH('order_items', 'cancellation_reason') IS NULL
    ALTER TABLE order_items ADD cancellation_reason NVARCHAR(MAX) NULL;
IF COL_LENGTH('order_items', 'cancelled_by') IS NULL
    ALTER TABLE order_items ADD cancelled_by UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('order_items', 'cancelled_at') IS NULL
    ALTER TABLE order_items ADD cancelled_at DATETIME2 NULL;
IF COL_LENGTH('order_items', 'paid_quantity') IS NULL
    ALTER TABLE order_items ADD paid_quantity DECIMAL(10,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('order_items', 'paid_at') IS NULL
    ALTER TABLE order_items ADD paid_at DATETIME2 NULL;
GO

UPDATE oi SET tenant_id = o.tenant_id
FROM order_items oi
INNER JOIN orders o ON o.id = oi.order_id
WHERE oi.tenant_id IS NULL;
GO

IF COL_LENGTH('order_items', 'total_amount') IS NOT NULL
BEGIN
    UPDATE order_items SET total_amount = unit_price * quantity
    WHERE (total_amount IS NULL OR total_amount = 0) AND unit_price > 0 AND quantity > 0;
END
GO

IF EXISTS (SELECT 1 FROM sys.views WHERE name = 'active_order_items')
    DROP VIEW active_order_items;
GO
IF COL_LENGTH('order_items', 'product_id') IS NOT NULL
BEGIN
    EXEC(N'
    CREATE VIEW active_order_items AS
    SELECT oi.id, oi.order_id, oi.tenant_id, oi.product_id, oi.variant_id, oi.variant_name,
           oi.quantity, oi.unit_price, oi.total_amount, oi.notes, oi.created_at,
           oi.cancellation_reason, oi.cancelled_by, oi.cancelled_at,
           p.name AS product_name, p.price AS product_price, p.image_url AS product_image_url, p.category_id AS product_category_id
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.cancelled_at IS NULL');
END
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='stock_movements' AND xtype='U')
CREATE TABLE stock_movements (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UNIQUEIDENTIFIER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type NVARCHAR(20) NOT NULL CHECK (movement_type IN ('in','out','adjustment')),
    quantity DECIMAL(10,2) NOT NULL,
    unit_cost DECIMAL(10,2) NULL,
    total_cost DECIMAL(12,2) NULL,
    supplier_name NVARCHAR(255) NULL,
    note NVARCHAR(MAX) NULL,
    created_by UNIQUEIDENTIFIER NULL REFERENCES app_users(id) ON DELETE NO ACTION,
    source_branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE NO ACTION,
    target_branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE NO ACTION,
    reference_type NVARCHAR(50) NULL,
    reference_no NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='branch_product_stocks' AND xtype='U')
CREATE TABLE branch_product_stocks (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id UNIQUEIDENTIFIER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_branch_product_stocks_tenant_branch' AND object_id = OBJECT_ID(N'branch_product_stocks'))
    CREATE INDEX idx_branch_product_stocks_tenant_branch ON branch_product_stocks(tenant_id, branch_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_branch_product_stocks_unique' AND object_id = OBJECT_ID(N'branch_product_stocks'))
    CREATE UNIQUE INDEX idx_branch_product_stocks_unique ON branch_product_stocks(tenant_id, branch_id, product_id);
GO

-- Cari hareket: uygulama type=debt kullanir (bulut ile ayni)
DECLARE @ct_chk NVARCHAR(256);
SELECT @ct_chk = cc.name
FROM sys.check_constraints cc
WHERE cc.parent_object_id = OBJECT_ID(N'customer_transactions')
  AND cc.definition LIKE N'%type%';
IF @ct_chk IS NOT NULL
    EXEC(N'ALTER TABLE customer_transactions DROP CONSTRAINT [' + @ct_chk + N']');
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'customer_transactions')
      AND name = N'CK_customer_transactions_type'
)
    ALTER TABLE customer_transactions ADD CONSTRAINT CK_customer_transactions_type
        CHECK (type IN ('sale', 'payment', 'refund', 'debt'));
GO

-- Vardiya tablolari (ShiftManager / Gun sonu)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='shift_definitions' AND xtype='U')
CREATE TABLE shift_definitions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE CASCADE,
    shift_no INT NOT NULL CHECK (shift_no BETWEEN 1 AND 9),
    name NVARCHAR(100) NOT NULL,
    start_time TIME NOT NULL DEFAULT '06:00',
    end_time TIME NOT NULL DEFAULT '14:00',
    color NVARCHAR(20) NOT NULL DEFAULT '#f59e0b',
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='shifts' AND xtype='U')
CREATE TABLE shifts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE NO ACTION,
    shift_definition_id UNIQUEIDENTIFIER NULL REFERENCES shift_definitions(id) ON DELETE NO ACTION,
    shift_no INT NOT NULL,
    shift_name NVARCHAR(100) NOT NULL,
    business_date DATE NOT NULL,
    terminal_id NVARCHAR(100) NULL,
    terminal_name NVARCHAR(255) NULL,
    opened_by UNIQUEIDENTIFIER NULL REFERENCES profiles(id) ON DELETE NO ACTION,
    opened_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    opening_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
    opening_notes NVARCHAR(MAX) NULL,
    closed_by UNIQUEIDENTIFIER NULL REFERENCES profiles(id) ON DELETE NO ACTION,
    closed_at DATETIME2 NULL,
    closing_cash DECIMAL(12,2) NULL,
    closing_notes NVARCHAR(MAX) NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);
GO

-- Lisans kaydi (panel ile uyumlu alanlar; offline kontrol tenants.subscription_expires_at)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tenant_licenses' AND xtype='U')
CREATE TABLE tenant_licenses (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    license_key NVARCHAR(100) NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended')),
    expires_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='daily_closures' AND xtype='U')
CREATE TABLE daily_closures (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE NO ACTION,
    business_date DATE NOT NULL,
    closed_by UNIQUEIDENTIFIER NULL REFERENCES profiles(id) ON DELETE NO ACTION,
    closed_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    notes NVARCHAR(MAX) NULL
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='suppliers' AND xtype='U')
CREATE TABLE suppliers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NULL,
    email NVARCHAR(255) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

-- profiles.is_active (garson/kullanici pasif)
IF COL_LENGTH('profiles', 'is_active') IS NULL
    ALTER TABLE profiles ADD is_active BIT NOT NULL DEFAULT 1;
GO

IF COL_LENGTH('branches', 'menu_enabled') IS NULL
    ALTER TABLE branches ADD menu_enabled BIT NOT NULL DEFAULT 0;
IF COL_LENGTH('branches', 'qr_menu_settings') IS NULL
    ALTER TABLE branches ADD qr_menu_settings NVARCHAR(MAX) NULL;
GO

-- shifts ek kolonlar (vardiya kapatma / Z raporu)
IF COL_LENGTH('shifts', 'opening_cash_breakdown') IS NULL
    ALTER TABLE shifts ADD opening_cash_breakdown NVARCHAR(MAX) NULL;
IF COL_LENGTH('shifts', 'closing_cash_breakdown') IS NULL
    ALTER TABLE shifts ADD closing_cash_breakdown NVARCHAR(MAX) NULL;
IF COL_LENGTH('shifts', 'cash_revenue') IS NULL
    ALTER TABLE shifts ADD cash_revenue DECIMAL(12,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'card_revenue') IS NULL
    ALTER TABLE shifts ADD card_revenue DECIMAL(12,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'open_account_revenue') IS NULL
    ALTER TABLE shifts ADD open_account_revenue DECIMAL(12,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'total_revenue') IS NULL
    ALTER TABLE shifts ADD total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'expense_total') IS NULL
    ALTER TABLE shifts ADD expense_total DECIMAL(12,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'expected_cash') IS NULL
    ALTER TABLE shifts ADD expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'cash_difference') IS NULL
    ALTER TABLE shifts ADD cash_difference DECIMAL(12,2) NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'order_count') IS NULL
    ALTER TABLE shifts ADD order_count INT NOT NULL DEFAULT 0;
IF COL_LENGTH('shifts', 'updated_at') IS NULL
    ALTER TABLE shifts ADD updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE();
GO

IF COL_LENGTH('daily_closures', 'status') IS NULL
    ALTER TABLE daily_closures ADD status NVARCHAR(20) NOT NULL DEFAULT 'closed';
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ingredients' AND xtype='U')
CREATE TABLE ingredients (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE NO ACTION,
    name NVARCHAR(255) NOT NULL,
    unit NVARCHAR(30) NOT NULL DEFAULT 'kg',
    current_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
    min_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    default_supplier_id UNIQUEIDENTIFIER NULL,
    barcode NVARCHAR(100) NULL,
    notes NVARCHAR(MAX) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_by UNIQUEIDENTIFIER NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='recipes' AND xtype='U')
CREATE TABLE recipes (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UNIQUEIDENTIFIER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UNIQUEIDENTIFIER NULL REFERENCES product_variants(id) ON DELETE NO ACTION,
    ingredient_id UNIQUEIDENTIFIER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(14,4) NOT NULL,
    unit NVARCHAR(30) NULL,
    note NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_invoices' AND xtype='U')
CREATE TABLE purchase_invoices (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER NULL REFERENCES branches(id) ON DELETE NO ACTION,
    supplier_id UNIQUEIDENTIFIER NOT NULL REFERENCES suppliers(id) ON DELETE NO ACTION,
    invoice_no NVARCHAR(100) NULL,
    invoice_date DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    payment_method NVARCHAR(30) NOT NULL DEFAULT 'on_account',
    notes NVARCHAR(MAX) NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'recorded',
    created_by UNIQUEIDENTIFIER NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_invoice_items' AND xtype='U')
CREATE TABLE purchase_invoice_items (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    invoice_id UNIQUEIDENTIFIER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    ingredient_id UNIQUEIDENTIFIER NOT NULL REFERENCES ingredients(id) ON DELETE NO ACTION,
    quantity DECIMAL(14,3) NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL,
    total DECIMAL(14,2) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ingredient_movements' AND xtype='U')
CREATE TABLE ingredient_movements (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ingredient_id UNIQUEIDENTIFIER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    movement_type NVARCHAR(20) NOT NULL,
    quantity DECIMAL(14,3) NOT NULL,
    unit_cost DECIMAL(12,2) NULL,
    reference_type NVARCHAR(50) NULL,
    reference_id UNIQUEIDENTIFIER NULL,
    note NVARCHAR(MAX) NULL,
    created_by UNIQUEIDENTIFIER NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='waiters' AND xtype='U')
CREATE TABLE waiters (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone NVARCHAR(50) NOT NULL,
    pin NVARCHAR(255) NOT NULL,
    name NVARCHAR(255) NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT uq_waiters_tenant_phone UNIQUE (tenant_id, phone)
);
GO

-- Varsayilan 3 vardiya tanimi (sube basina yoksa)
INSERT INTO shift_definitions (tenant_id, branch_id, shift_no, name, start_time, end_time, color)
SELECT b.tenant_id, b.id, v.shift_no, v.name, v.start_time, v.end_time, v.color
FROM branches b
CROSS JOIN (VALUES
    (1, N'Sabah', CAST('06:00' AS TIME), CAST('14:00' AS TIME), '#f59e0b'),
    (2, N'Ogle', CAST('14:00' AS TIME), CAST('22:00' AS TIME), '#3b82f6'),
    (3, N'Aksam', CAST('22:00' AS TIME), CAST('06:00' AS TIME), '#8b5cf6')
) AS v(shift_no, name, start_time, end_time, color)
WHERE NOT EXISTS (
    SELECT 1 FROM shift_definitions sd WHERE sd.branch_id = b.id AND sd.shift_no = v.shift_no
);
GO

PRINT N'SefPOS SQL patches applied (tam offline POS).';
GO
