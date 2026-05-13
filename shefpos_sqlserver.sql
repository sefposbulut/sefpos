-- ============================================================
-- SHEFPOS - SQL SERVER (T-SQL) TAM VERITABANI SEMASI
-- SQL Server 2008 R2 ve uzeri ile uyumludur
-- ============================================================
-- Kullanim (SSMS):
--   1. Asagidaki CREATE DATABASE blogu ile yeni veritabani olusturun
--   2. Ya da mevcut bir veritabaninda USE komutuyla gecin
--   3. Bu scriptin tamamini calistirin
-- ============================================================

-- Veritabani yoksa olustur
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'sefpos45')
BEGIN
    CREATE DATABASE [sefpos45];
END;
GO

USE [sefpos45];
GO

-- ============================================================
-- 1. KULLANICILAR (auth.users yerine)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_users' AND xtype='U')
CREATE TABLE app_users (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    email NVARCHAR(255) UNIQUE NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 2. TENANTS (Isletmeler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='tenants' AND xtype='U')
CREATE TABLE tenants (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) UNIQUE NOT NULL,
    address NVARCHAR(500),
    phone NVARCHAR(50),
    email NVARCHAR(255),
    logo_url NVARCHAR(1000),
    subscription_status NVARCHAR(20) DEFAULT 'active'
        CHECK (subscription_status IN ('active', 'suspended', 'cancelled')),
    subscription_plan NVARCHAR(50),
    subscription_expires_at DATETIME2,
    max_branches INT DEFAULT 1,
    notes NVARCHAR(MAX),
    onboarding_completed BIT DEFAULT 0,
    deployment_mode NVARCHAR(20) DEFAULT 'online'
        CHECK (deployment_mode IN ('online', 'offline', 'hybrid')),
    printer_settings NVARCHAR(MAX) DEFAULT '{}',
    require_cancel_reason BIT DEFAULT 0,
    lock_pin NVARCHAR(10),
    ip_lock_enabled BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 3. BRANCHES (Subeler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='branches' AND xtype='U')
CREATE TABLE branches (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    address NVARCHAR(500) DEFAULT '',
    phone NVARCHAR(50) DEFAULT '',
    is_active BIT DEFAULT 1,
    is_main BIT DEFAULT 0,
    use_central_products BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT uq_branches_tenant_name UNIQUE (tenant_id, name)
);
GO

-- ============================================================
-- 4. ROLES (Roller)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='roles' AND xtype='U')
CREATE TABLE roles (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name NVARCHAR(100) NOT NULL,
    permissions NVARCHAR(MAX) DEFAULT '{"can_view_tables":true,"can_take_orders":true,"can_process_payments":false,"can_manage_products":false,"can_manage_users":false,"can_view_reports":false,"can_manage_cash_register":false,"can_manage_settings":false,"can_view_cancel_logs":false,"can_end_of_day":false,"can_manage_discounts":false,"can_delete_order_items":false}',
    created_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT uq_roles_tenant_name UNIQUE (tenant_id, name)
);
GO

-- ============================================================
-- 5. PROFILES (Kullanici Profilleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='profiles' AND xtype='U')
CREATE TABLE profiles (
    id UNIQUEIDENTIFIER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    tenant_id UNIQUEIDENTIFIER REFERENCES tenants(id) ON DELETE NO ACTION,
    branch_id UNIQUEIDENTIFIER,
    role_id UNIQUEIDENTIFIER REFERENCES roles(id) ON DELETE NO ACTION,
    email NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) DEFAULT 'waiter'
        CHECK (role IN ('owner', 'admin', 'manager', 'waiter', 'kitchen', 'cashier')),
    avatar_url NVARCHAR(1000),
    is_super_admin BIT DEFAULT 0,
    onboarding_completed BIT DEFAULT 0,
    allowed_ips NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'FK_profiles_branch_id'
)
ALTER TABLE profiles ADD CONSTRAINT FK_profiles_branch_id
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE NO ACTION;
GO

-- ============================================================
-- 6. TABLE GROUPS (Masa Gruplari)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='table_groups' AND xtype='U')
CREATE TABLE table_groups (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    name NVARCHAR(255) NOT NULL,
    prefix NVARCHAR(10) NOT NULL,
    color NVARCHAR(20) DEFAULT '#FF6B35',
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 7. RESTAURANT_TABLES (Masalar)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='restaurant_tables' AND xtype='U')
CREATE TABLE restaurant_tables (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    group_id UNIQUEIDENTIFIER REFERENCES table_groups(id) ON DELETE NO ACTION,
    table_number NVARCHAR(20) NOT NULL,
    capacity INT DEFAULT 4,
    status NVARCHAR(20) DEFAULT 'available'
        CHECK (status IN ('available', 'occupied', 'reserved')),
    current_order_id UNIQUEIDENTIFIER,
    session_start DATETIME2,
    size NVARCHAR(20) DEFAULT 'medium'
        CHECK (size IN ('small', 'medium', 'large', 'xlarge')),
    payment_locked BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT uq_table_tenant_branch_number UNIQUE (tenant_id, branch_id, table_number)
);
GO

-- ============================================================
-- 8. CATEGORIES (Kategoriler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='categories' AND xtype='U')
CREATE TABLE categories (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    color NVARCHAR(20) DEFAULT '#3B82F6',
    sort_order INT DEFAULT 0,
    display_order INT DEFAULT 0,
    hugin_vat_department INT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 9. PRODUCTS (Urunler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='products' AND xtype='U')
CREATE TABLE products (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UNIQUEIDENTIFIER REFERENCES categories(id) ON DELETE NO ACTION,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    barcode NVARCHAR(100),
    price DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    cost DECIMAL(10,2) DEFAULT 0,
    stock_quantity DECIMAL(10,2) DEFAULT 0,
    unit NVARCHAR(20) DEFAULT 'adet',
    tax_rate DECIMAL(5,2) DEFAULT 20,
    is_active BIT DEFAULT 1,
    is_available BIT DEFAULT 1,
    image_url NVARCHAR(1000),
    printer_name NVARCHAR(255),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 10. PRODUCT VARIANTS (Urun Varyantlari)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='product_variants' AND xtype='U')
CREATE TABLE product_variants (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id UNIQUEIDENTIFIER NOT NULL REFERENCES products(id) ON DELETE NO ACTION,
    name NVARCHAR(255) NOT NULL,
    price_modifier DECIMAL(10,2) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 11. CUSTOMERS (Musteriler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customers' AND xtype='U')
CREATE TABLE customers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50),
    email NVARCHAR(255),
    address NVARCHAR(500),
    tax_number NVARCHAR(50),
    balance DECIMAL(10,2) DEFAULT 0,
    notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 12. DELIVERY CUSTOMERS (Teslimat Musterileri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='delivery_customers' AND xtype='U')
CREATE TABLE delivery_customers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    full_name NVARCHAR(255) NOT NULL DEFAULT '',
    phone NVARCHAR(50) NOT NULL DEFAULT '',
    address NVARCHAR(500) DEFAULT '',
    notes NVARCHAR(MAX) DEFAULT '',
    last_order_at DATETIME2,
    order_count INT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 13. COURIERS (Kuryeler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='couriers' AND xtype='U')
CREATE TABLE couriers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    full_name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) DEFAULT '',
    status NVARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'busy', 'offline')),
    is_active BIT NOT NULL DEFAULT 1,
    pin_code NVARCHAR(10),
    notification_token NVARCHAR(500),
    latitude FLOAT,
    longitude FLOAT,
    location_updated_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- 14. ORDER NUMBER COUNTER (Siparis No Sayaci - SEQUENCE yerine)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='order_number_counter' AND xtype='U')
CREATE TABLE order_number_counter (
    id INT IDENTITY(1,1) PRIMARY KEY,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 15. ORDERS (Siparisler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='orders' AND xtype='U')
CREATE TABLE orders (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    table_id UNIQUEIDENTIFIER REFERENCES restaurant_tables(id) ON DELETE NO ACTION,
    customer_id UNIQUEIDENTIFIER REFERENCES customers(id) ON DELETE NO ACTION,
    delivery_customer_id UNIQUEIDENTIFIER REFERENCES delivery_customers(id) ON DELETE NO ACTION,
    courier_id UNIQUEIDENTIFIER REFERENCES couriers(id) ON DELETE NO ACTION,
    waiter_id UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    created_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    order_number NVARCHAR(50),
    order_type NVARCHAR(20) DEFAULT 'dine_in'
        CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
    order_subtype NVARCHAR(20),
    status NVARCHAR(20) DEFAULT 'open'
        CHECK (status IN ('open', 'active', 'pending', 'completed', 'cancelled')),
    payment_status NVARCHAR(20) DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'pending')),
    payment_method NVARCHAR(30),
    subtotal DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,
    notes NVARCHAR(MAX),
    waiter_name NVARCHAR(255),
    customer_name NVARCHAR(255) DEFAULT '',
    customer_phone NVARCHAR(50) DEFAULT '',
    customer_address NVARCHAR(500) DEFAULT '',
    delivery_address NVARCHAR(500) DEFAULT '',
    delivery_note NVARCHAR(MAX) DEFAULT '',
    courier_name NVARCHAR(255) DEFAULT '',
    delivery_status NVARCHAR(30) DEFAULT 'pending'
        CHECK (delivery_status IN ('pending','preparing','ready','assigned','on_the_way','picked_up','delivered','failed','cancelled')),
    assigned_at DATETIME2,
    picked_up_at DATETIME2,
    delivered_at DATETIME2,
    estimated_delivery_minutes INT DEFAULT 30,
    payment_collected BIT NOT NULL DEFAULT 0,
    paid_at DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    completed_at DATETIME2
);
GO

-- Siparis numarasi otomatik olusturma (counter tablosu kullanarak)
IF EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'trg_orders_generate_number')
    DROP TRIGGER trg_orders_generate_number;
GO
CREATE TRIGGER trg_orders_generate_number
ON orders
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted WHERE order_number IS NULL) RETURN;

    DECLARE @counter INT;
    INSERT INTO order_number_counter (created_at) VALUES (GETDATE());
    SET @counter = SCOPE_IDENTITY();

    UPDATE o
    SET order_number = CASE
        WHEN i.order_type = 'takeaway' THEN 'PAKET-' + RIGHT('000000' + CAST(@counter AS NVARCHAR(6)), 6)
        WHEN i.order_type = 'delivery' THEN 'GELAL-' + RIGHT('000000' + CAST(@counter AS NVARCHAR(6)), 6)
        ELSE 'SIP-' + RIGHT('000000' + CAST(@counter AS NVARCHAR(6)), 6)
    END
    FROM orders o
    INNER JOIN inserted i ON o.id = i.id
    WHERE o.order_number IS NULL;
END;
GO

-- restaurant_tables.current_order_id FK
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_NAME = 'FK_restaurant_tables_current_order_id'
)
ALTER TABLE restaurant_tables ADD CONSTRAINT FK_restaurant_tables_current_order_id
    FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE NO ACTION;
GO

-- ============================================================
-- 16. ORDER ITEMS (Siparis Kalemleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='order_items' AND xtype='U')
CREATE TABLE order_items (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    order_id UNIQUEIDENTIFIER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    product_id UNIQUEIDENTIFIER REFERENCES products(id) ON DELETE NO ACTION,
    variant_id UNIQUEIDENTIFIER REFERENCES product_variants(id) ON DELETE NO ACTION,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    tax_rate DECIMAL(5,2) DEFAULT 20,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    notes NVARCHAR(MAX),
    variant_name NVARCHAR(255),
    status NVARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'preparing', 'ready', 'served')),
    cancellation_reason NVARCHAR(MAX),
    cancelled_by UNIQUEIDENTIFIER REFERENCES app_users(id) ON DELETE NO ACTION,
    cancelled_at DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 17. PAYMENT TRANSACTIONS (Odeme Islemleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='payment_transactions' AND xtype='U')
CREATE TABLE payment_transactions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    order_id UNIQUEIDENTIFIER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method NVARCHAR(30) NOT NULL
        CHECK (payment_method IN ('cash', 'credit_card', 'open_account')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    created_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION
);
GO

-- ============================================================
-- 18. CASH REGISTER TRANSACTIONS (Kasa Hareketleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='cash_register_transactions' AND xtype='U')
CREATE TABLE cash_register_transactions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    transaction_type NVARCHAR(30) NOT NULL
        CHECK (transaction_type IN ('order_payment','refund','expense','cash_in','cash_out','opening_balance','closing_balance')),
    payment_method NVARCHAR(30),
    amount DECIMAL(10,2) NOT NULL,
    reference_id UNIQUEIDENTIFIER,
    reference_type NVARCHAR(30),
    description NVARCHAR(MAX) NOT NULL,
    order_number NVARCHAR(50),
    table_name NVARCHAR(100),
    notes NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE(),
    created_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    shift_id UNIQUEIDENTIFIER
);
GO

-- Otomatik kasa kaydi trigger
IF EXISTS (SELECT 1 FROM sys.triggers WHERE name = 'trg_log_payment_to_cash_register')
    DROP TRIGGER trg_log_payment_to_cash_register;
GO
CREATE TRIGGER trg_log_payment_to_cash_register
ON payment_transactions
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO cash_register_transactions (
        tenant_id, transaction_type, payment_method, amount,
        reference_id, reference_type, description, order_number,
        created_at, created_by
    )
    SELECT
        i.tenant_id,
        'order_payment',
        i.payment_method,
        i.amount,
        i.id,
        'payment_transaction',
        CASE
            WHEN i.payment_method = 'cash' THEN N'Nakit Odeme'
            WHEN i.payment_method = 'credit_card' THEN N'Kredi Karti Odemesi'
            WHEN i.payment_method = 'open_account' THEN N'Acik Hesap Odemesi'
            ELSE N'Odeme'
        END,
        o.order_number,
        i.created_at,
        i.created_by
    FROM inserted i
    LEFT JOIN orders o ON o.id = i.order_id;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('cash_register_transactions') AND name = 'voided_at')
    ALTER TABLE cash_register_transactions ADD voided_at DATETIME2 NULL;
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('cash_register_transactions') AND name = 'voided_by')
    ALTER TABLE cash_register_transactions ADD voided_by UNIQUEIDENTIFIER NULL REFERENCES profiles(id);
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('cash_register_transactions') AND name = 'void_reason')
    ALTER TABLE cash_register_transactions ADD void_reason NVARCHAR(MAX) NULL;
GO

-- ============================================================
-- 19. CUSTOMER TRANSACTIONS (Musteri Cari Hareketleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customer_transactions' AND xtype='U')
CREATE TABLE customer_transactions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    customer_id UNIQUEIDENTIFIER NOT NULL REFERENCES customers(id) ON DELETE NO ACTION,
    order_id UNIQUEIDENTIFIER REFERENCES orders(id) ON DELETE NO ACTION,
    type NVARCHAR(20) NOT NULL CHECK (type IN ('sale', 'payment', 'refund')),
    amount DECIMAL(10,2) NOT NULL,
    description NVARCHAR(MAX),
    created_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 20. CASH REGISTERS (Kasa)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='cash_registers' AND xtype='U')
CREATE TABLE cash_registers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    name NVARCHAR(255) NOT NULL,
    opened_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    closed_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    opening_amount DECIMAL(10,2) DEFAULT 0,
    closing_amount DECIMAL(10,2),
    expected_amount DECIMAL(10,2),
    difference_amount DECIMAL(10,2),
    status NVARCHAR(10) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at DATETIME2 DEFAULT GETDATE(),
    closed_at DATETIME2
);
GO

-- ============================================================
-- 21. CASH MOVEMENTS (Kasa Hareketleri - Manuel)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='cash_movements' AND xtype='U')
CREATE TABLE cash_movements (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    register_id UNIQUEIDENTIFIER REFERENCES cash_registers(id) ON DELETE NO ACTION,
    type NVARCHAR(20) NOT NULL CHECK (type IN ('in', 'out', 'sale', 'expense')),
    amount DECIMAL(10,2) NOT NULL,
    description NVARCHAR(MAX),
    created_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 22. EXPENSES (Giderler)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='expenses' AND xtype='U')
CREATE TABLE expenses (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    category NVARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description NVARCHAR(MAX),
    receipt_url NVARCHAR(1000),
    created_by UNIQUEIDENTIFIER REFERENCES profiles(id) ON DELETE NO ACTION,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 23. ONLINE ORDER PLATFORMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='online_order_platforms' AND xtype='U')
CREATE TABLE online_order_platforms (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    platform_name NVARCHAR(255) NOT NULL,
    platform_code NVARCHAR(50) NOT NULL,
    is_active BIT DEFAULT 1,
    webhook_url NVARCHAR(1000),
    api_key NVARCHAR(500),
    commission_rate DECIMAL(5,2) DEFAULT 0,
    settings NVARCHAR(MAX) DEFAULT '{}',
    middleware_url NVARCHAR(500),
    middleware_username NVARCHAR(255),
    middleware_password NVARCHAR(255),
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    CONSTRAINT uq_platform_tenant_code UNIQUE (tenant_id, platform_code)
);
GO

-- ============================================================
-- 24. ONLINE ORDERS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='online_orders' AND xtype='U')
CREATE TABLE online_orders (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    platform_id UNIQUEIDENTIFIER NOT NULL REFERENCES online_order_platforms(id) ON DELETE NO ACTION,
    platform_order_id NVARCHAR(255) NOT NULL,
    platform_order_number NVARCHAR(100),
    status NVARCHAR(30) NOT NULL DEFAULT 'new',
    payment_status NVARCHAR(30) DEFAULT 'paid',
    customer_name NVARCHAR(255) NOT NULL,
    customer_phone NVARCHAR(50),
    customer_address NVARCHAR(500),
    customer_notes NVARCHAR(MAX),
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(10,2) DEFAULT 0,
    platform_commission DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    estimated_delivery_time DATETIME2,
    delivery_address_lat DECIMAL(10,7),
    delivery_address_lng DECIMAL(10,7),
    internal_order_id UNIQUEIDENTIFIER REFERENCES orders(id) ON DELETE NO ACTION,
    platform_created_at DATETIME2,
    accepted_at DATETIME2,
    ready_at DATETIME2,
    delivered_at DATETIME2,
    cancelled_at DATETIME2,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    created_by UNIQUEIDENTIFIER REFERENCES app_users(id) ON DELETE NO ACTION,
    CONSTRAINT uq_online_order_platform_order UNIQUE (tenant_id, platform_id, platform_order_id)
);
GO

-- ============================================================
-- 25. ONLINE ORDER ITEMS
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='online_order_items' AND xtype='U')
CREATE TABLE online_order_items (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    online_order_id UNIQUEIDENTIFIER NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
    product_id UNIQUEIDENTIFIER REFERENCES products(id) ON DELETE NO ACTION,
    variant_id UNIQUEIDENTIFIER REFERENCES product_variants(id) ON DELETE NO ACTION,
    platform_product_name NVARCHAR(255) NOT NULL,
    platform_product_code NVARCHAR(100),
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    notes NVARCHAR(MAX),
    special_instructions NVARCHAR(MAX),
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 26. PRINT JOBS (Yazici Is Kuyrugu)
-- NOT: branch_id ON DELETE NO ACTION (CASCADE dongusu onlemek icin)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='print_jobs' AND xtype='U')
CREATE TABLE print_jobs (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER REFERENCES tenants(id) ON DELETE NO ACTION,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    html NVARCHAR(MAX) NOT NULL,
    printer_name NVARCHAR(255) DEFAULT '',
    status NVARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
    error NVARCHAR(MAX) DEFAULT '',
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 27. PRINTER REGISTRATIONS
-- NOT: branch_id ON DELETE NO ACTION (CASCADE dongusu onlemek icin)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='printer_registrations' AND xtype='U')
CREATE TABLE printer_registrations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    printers NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    last_seen_at DATETIME2 DEFAULT GETDATE(),
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 28. ORDER CANCEL LOGS (Iptal Kayitlari)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='order_cancel_logs' AND xtype='U')
CREATE TABLE order_cancel_logs (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    branch_id UNIQUEIDENTIFIER REFERENCES branches(id) ON DELETE NO ACTION,
    order_id UNIQUEIDENTIFIER REFERENCES orders(id) ON DELETE NO ACTION,
    order_item_id UNIQUEIDENTIFIER,
    order_number NVARCHAR(50),
    product_name NVARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    cancel_reason NVARCHAR(MAX),
    cancelled_by UNIQUEIDENTIFIER REFERENCES app_users(id) ON DELETE NO ACTION,
    cancelled_by_name NVARCHAR(255),
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- 29. COURIER NOTIFICATIONS (Kurye Bildirimleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='courier_notifications' AND xtype='U')
CREATE TABLE courier_notifications (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE NO ACTION,
    courier_id UNIQUEIDENTIFIER NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
    order_id UNIQUEIDENTIFIER REFERENCES orders(id) ON DELETE NO ACTION,
    title NVARCHAR(255) NOT NULL DEFAULT '',
    message NVARCHAR(MAX) NOT NULL DEFAULT '',
    type NVARCHAR(50) NOT NULL DEFAULT 'order_assigned',
    is_read BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
);
GO

-- ============================================================
-- 30. SUPPORT TICKETS (Destek Talepleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='support_tickets' AND xtype='U')
CREATE TABLE support_tickets (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject NVARCHAR(500) NOT NULL DEFAULT '',
    message NVARCHAR(MAX) NOT NULL DEFAULT '',
    category NVARCHAR(50) NOT NULL DEFAULT 'general',
    priority NVARCHAR(20) NOT NULL DEFAULT 'normal',
    status NVARCHAR(20) NOT NULL DEFAULT 'open',
    admin_reply NVARCHAR(MAX),
    admin_id UNIQUEIDENTIFIER REFERENCES app_users(id) ON DELETE NO ACTION,
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    resolved_at DATETIME2
);
GO

-- ============================================================
-- 31. SUPPORT NOTIFICATIONS (Sistem Bildirimleri)
-- ============================================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='support_notifications' AND xtype='U')
CREATE TABLE support_notifications (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    tenant_id UNIQUEIDENTIFIER REFERENCES tenants(id) ON DELETE CASCADE,
    title NVARCHAR(500) NOT NULL DEFAULT '',
    message NVARCHAR(MAX) NOT NULL DEFAULT '',
    type NVARCHAR(30) NOT NULL DEFAULT 'info',
    is_read BIT DEFAULT 0,
    created_by UNIQUEIDENTIFIER REFERENCES app_users(id) ON DELETE NO ACTION,
    created_at DATETIME2 DEFAULT GETDATE()
);
GO

-- ============================================================
-- INDEXLER (PERFORMANS)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_profiles_tenant_id' AND object_id = OBJECT_ID(N'profiles'))
    CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_profiles_branch_id' AND object_id = OBJECT_ID(N'profiles'))
    CREATE INDEX idx_profiles_branch_id ON profiles(branch_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_profiles_role_id' AND object_id = OBJECT_ID(N'profiles'))
    CREATE INDEX idx_profiles_role_id ON profiles(role_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_profiles_tenant_role' AND object_id = OBJECT_ID(N'profiles'))
    CREATE INDEX idx_profiles_tenant_role ON profiles(tenant_id, role);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_branches_tenant_id' AND object_id = OBJECT_ID(N'branches'))
    CREATE INDEX idx_branches_tenant_id ON branches(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_table_groups_tenant_id' AND object_id = OBJECT_ID(N'table_groups'))
    CREATE INDEX idx_table_groups_tenant_id ON table_groups(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_restaurant_tables_tenant_id' AND object_id = OBJECT_ID(N'restaurant_tables'))
    CREATE INDEX idx_restaurant_tables_tenant_id ON restaurant_tables(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_restaurant_tables_branch_id' AND object_id = OBJECT_ID(N'restaurant_tables'))
    CREATE INDEX idx_restaurant_tables_branch_id ON restaurant_tables(branch_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_restaurant_tables_status' AND object_id = OBJECT_ID(N'restaurant_tables'))
    CREATE INDEX idx_restaurant_tables_status ON restaurant_tables(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_restaurant_tables_group_id' AND object_id = OBJECT_ID(N'restaurant_tables'))
    CREATE INDEX idx_restaurant_tables_group_id ON restaurant_tables(group_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_categories_tenant_id' AND object_id = OBJECT_ID(N'categories'))
    CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_categories_tenant_sort' AND object_id = OBJECT_ID(N'categories'))
    CREATE INDEX idx_categories_tenant_sort ON categories(tenant_id, sort_order);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_products_tenant_id' AND object_id = OBJECT_ID(N'products'))
    CREATE INDEX idx_products_tenant_id ON products(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_products_category_id' AND object_id = OBJECT_ID(N'products'))
    CREATE INDEX idx_products_category_id ON products(category_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_products_tenant_active' AND object_id = OBJECT_ID(N'products'))
    CREATE INDEX idx_products_tenant_active ON products(tenant_id, is_active);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_product_variants_product_id' AND object_id = OBJECT_ID(N'product_variants'))
    CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_product_variants_tenant' AND object_id = OBJECT_ID(N'product_variants'))
    CREATE INDEX idx_product_variants_tenant ON product_variants(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_customers_tenant_id' AND object_id = OBJECT_ID(N'customers'))
    CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_delivery_customers_tenant_id' AND object_id = OBJECT_ID(N'delivery_customers'))
    CREATE INDEX idx_delivery_customers_tenant_id ON delivery_customers(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_delivery_customers_phone' AND object_id = OBJECT_ID(N'delivery_customers'))
    CREATE INDEX idx_delivery_customers_phone ON delivery_customers(phone);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_couriers_tenant_id' AND object_id = OBJECT_ID(N'couriers'))
    CREATE INDEX idx_couriers_tenant_id ON couriers(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_tenant_id' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_branch_id' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_branch_id ON orders(branch_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_table_id' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_table_id ON orders(table_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_status' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_status ON orders(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_created_at' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_payment_status' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_payment_status ON orders(payment_status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_order_type' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_order_type ON orders(order_type);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_courier_id' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_courier_id ON orders(courier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_orders_delivery_status' AND object_id = OBJECT_ID(N'orders'))
    CREATE INDEX idx_orders_delivery_status ON orders(delivery_status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_order_items_order_id' AND object_id = OBJECT_ID(N'order_items'))
    CREATE INDEX idx_order_items_order_id ON order_items(order_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_order_items_product_id' AND object_id = OBJECT_ID(N'order_items'))
    CREATE INDEX idx_order_items_product_id ON order_items(product_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_order_items_tenant' AND object_id = OBJECT_ID(N'order_items'))
    CREATE INDEX idx_order_items_tenant ON order_items(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_payment_transactions_order_id' AND object_id = OBJECT_ID(N'payment_transactions'))
    CREATE INDEX idx_payment_transactions_order_id ON payment_transactions(order_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_payment_transactions_tenant_id' AND object_id = OBJECT_ID(N'payment_transactions'))
    CREATE INDEX idx_payment_transactions_tenant_id ON payment_transactions(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_payment_transactions_created_at' AND object_id = OBJECT_ID(N'payment_transactions'))
    CREATE INDEX idx_payment_transactions_created_at ON payment_transactions(created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_cash_reg_tenant_id' AND object_id = OBJECT_ID(N'cash_register_transactions'))
    CREATE INDEX idx_cash_reg_tenant_id ON cash_register_transactions(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_cash_reg_created_at' AND object_id = OBJECT_ID(N'cash_register_transactions'))
    CREATE INDEX idx_cash_reg_created_at ON cash_register_transactions(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_cash_reg_branch_id' AND object_id = OBJECT_ID(N'cash_register_transactions'))
    CREATE INDEX idx_cash_reg_branch_id ON cash_register_transactions(branch_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_customer_txn_tenant_id' AND object_id = OBJECT_ID(N'customer_transactions'))
    CREATE INDEX idx_customer_txn_tenant_id ON customer_transactions(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_customer_txn_customer_id' AND object_id = OBJECT_ID(N'customer_transactions'))
    CREATE INDEX idx_customer_txn_customer_id ON customer_transactions(customer_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_online_orders_tenant' AND object_id = OBJECT_ID(N'online_orders'))
    CREATE INDEX idx_online_orders_tenant ON online_orders(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_online_orders_platform' AND object_id = OBJECT_ID(N'online_orders'))
    CREATE INDEX idx_online_orders_platform ON online_orders(platform_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_online_orders_status' AND object_id = OBJECT_ID(N'online_orders'))
    CREATE INDEX idx_online_orders_status ON online_orders(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_online_orders_created' AND object_id = OBJECT_ID(N'online_orders'))
    CREATE INDEX idx_online_orders_created ON online_orders(created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_print_jobs_branch_status' AND object_id = OBJECT_ID(N'print_jobs'))
    CREATE INDEX idx_print_jobs_branch_status ON print_jobs(branch_id, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_print_jobs_created_at' AND object_id = OBJECT_ID(N'print_jobs'))
    CREATE INDEX idx_print_jobs_created_at ON print_jobs(created_at);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_cancel_logs_tenant_id' AND object_id = OBJECT_ID(N'order_cancel_logs'))
    CREATE INDEX idx_cancel_logs_tenant_id ON order_cancel_logs(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_cancel_logs_order_id' AND object_id = OBJECT_ID(N'order_cancel_logs'))
    CREATE INDEX idx_cancel_logs_order_id ON order_cancel_logs(order_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_cancel_logs_created_at' AND object_id = OBJECT_ID(N'order_cancel_logs'))
    CREATE INDEX idx_cancel_logs_created_at ON order_cancel_logs(created_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_support_tickets_tenant_id' AND object_id = OBJECT_ID(N'support_tickets'))
    CREATE INDEX idx_support_tickets_tenant_id ON support_tickets(tenant_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_support_tickets_status' AND object_id = OBJECT_ID(N'support_tickets'))
    CREATE INDEX idx_support_tickets_status ON support_tickets(status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_support_notif_tenant_id' AND object_id = OBJECT_ID(N'support_notifications'))
    CREATE INDEX idx_support_notif_tenant_id ON support_notifications(tenant_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_courier_notif_courier_id' AND object_id = OBJECT_ID(N'courier_notifications'))
    CREATE INDEX idx_courier_notif_courier_id ON courier_notifications(courier_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_courier_notif_tenant_id' AND object_id = OBJECT_ID(N'courier_notifications'))
    CREATE INDEX idx_courier_notif_tenant_id ON courier_notifications(tenant_id);
GO

-- ============================================================
-- VIEW: active_order_items
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.views WHERE name = 'active_order_items')
    DROP VIEW active_order_items;
GO
CREATE VIEW active_order_items AS
SELECT
    oi.id,
    oi.order_id,
    oi.tenant_id,
    oi.product_id,
    oi.variant_id,
    oi.variant_name,
    oi.quantity,
    oi.unit_price,
    oi.total_amount,
    oi.notes,
    oi.created_at,
    oi.cancellation_reason,
    oi.cancelled_by,
    oi.cancelled_at,
    p.name AS product_name,
    p.price AS product_price,
    p.image_url AS product_image_url,
    p.category_id AS product_category_id
FROM order_items oi
INNER JOIN products p ON p.id = oi.product_id
WHERE oi.cancelled_at IS NULL;
GO

-- ============================================================
-- STORED PROCEDURE: Aktif masa siparisi
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'get_active_order_for_table')
    DROP PROCEDURE get_active_order_for_table;
GO
CREATE PROCEDURE get_active_order_for_table
    @table_id UNIQUEIDENTIFIER,
    @tenant_id UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        o.*,
        rt.table_number,
        rt.status AS table_status
    FROM orders o
    LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
    WHERE o.table_id = @table_id
      AND o.tenant_id = @tenant_id
      AND o.status NOT IN ('completed', 'cancelled')
    ORDER BY o.created_at DESC;

    SELECT
        oi.*,
        p.name AS product_name,
        p.image_url AS product_image_url
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id IN (
        SELECT TOP 1 id
        FROM orders
        WHERE table_id = @table_id
          AND tenant_id = @tenant_id
          AND status NOT IN ('completed', 'cancelled')
        ORDER BY created_at DESC
    )
    AND oi.cancelled_at IS NULL
    ORDER BY oi.created_at;
END;
GO

-- ============================================================
-- STORED PROCEDURE: Sube masalarini getir
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'get_tables_for_branch')
    DROP PROCEDURE get_tables_for_branch;
GO
CREATE PROCEDURE get_tables_for_branch
    @tenant_id UNIQUEIDENTIFIER,
    @branch_id UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        rt.*,
        tg.name AS group_name,
        tg.color AS group_color,
        tg.prefix AS group_prefix,
        o.id AS active_order_id,
        o.order_number AS active_order_number,
        o.total_amount AS active_order_total,
        o.created_at AS active_order_created_at
    FROM restaurant_tables rt
    LEFT JOIN table_groups tg ON tg.id = rt.group_id
    LEFT JOIN orders o ON o.id = rt.current_order_id
    WHERE rt.tenant_id = @tenant_id
      AND (rt.branch_id = @branch_id OR (@branch_id IS NULL AND rt.branch_id IS NULL))
    ORDER BY tg.name, rt.table_number;
END;
GO

-- ============================================================
-- STORED PROCEDURE: Yeni isletme ve kullanici olustur (signup)
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'sp_create_tenant_and_user')
    DROP PROCEDURE sp_create_tenant_and_user;
GO
CREATE PROCEDURE sp_create_tenant_and_user
    @email NVARCHAR(255),
    @password_hash NVARCHAR(255),
    @full_name NVARCHAR(255),
    @tenant_name NVARCHAR(255),
    @tenant_slug NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @user_id UNIQUEIDENTIFIER = NEWID();
        DECLARE @tenant_id UNIQUEIDENTIFIER = NEWID();
        DECLARE @branch_id UNIQUEIDENTIFIER = NEWID();
        DECLARE @admin_role_id UNIQUEIDENTIFIER = NEWID();
        DECLARE @waiter_role_id UNIQUEIDENTIFIER = NEWID();
        DECLARE @cashier_role_id UNIQUEIDENTIFIER = NEWID();

        IF NOT EXISTS (SELECT 1 FROM app_users WHERE email = @email)
        BEGIN
            INSERT INTO app_users (id, email, password_hash)
            VALUES (@user_id, @email, @password_hash);

            INSERT INTO tenants (id, name, slug, email, onboarding_completed)
            VALUES (@tenant_id, @tenant_name, @tenant_slug, @email, 0);

            INSERT INTO branches (id, tenant_id, name, is_main, is_active)
            VALUES (@branch_id, @tenant_id, N'Ana Sube', 1, 1);

            INSERT INTO roles (id, tenant_id, name, permissions) VALUES (
                @admin_role_id, @tenant_id, N'Yonetici',
                N'{"can_view_tables":true,"can_take_orders":true,"can_process_payments":true,"can_manage_products":true,"can_manage_users":true,"can_view_reports":true,"can_manage_cash_register":true,"can_manage_settings":true,"can_view_cancel_logs":true,"can_end_of_day":true,"can_manage_discounts":true,"can_delete_order_items":true}'
            );
            INSERT INTO roles (id, tenant_id, name, permissions) VALUES (
                @waiter_role_id, @tenant_id, N'Garson',
                N'{"can_view_tables":true,"can_take_orders":true,"can_process_payments":false,"can_manage_products":false,"can_manage_users":false,"can_view_reports":false,"can_manage_cash_register":false,"can_manage_settings":false,"can_view_cancel_logs":false,"can_end_of_day":false,"can_manage_discounts":false,"can_delete_order_items":true}'
            );
            INSERT INTO roles (id, tenant_id, name, permissions) VALUES (
                @cashier_role_id, @tenant_id, N'Kasiyer',
                N'{"can_view_tables":true,"can_take_orders":false,"can_process_payments":true,"can_manage_products":false,"can_manage_users":false,"can_view_reports":false,"can_manage_cash_register":true,"can_manage_settings":false,"can_view_cancel_logs":false,"can_end_of_day":false,"can_manage_discounts":false,"can_delete_order_items":false}'
            );

            INSERT INTO profiles (id, tenant_id, branch_id, role_id, email, full_name, role, onboarding_completed)
            VALUES (@user_id, @tenant_id, @branch_id, @admin_role_id, @email, @full_name, 'owner', 0);
        END
        ELSE
        BEGIN
            SELECT @user_id = u.id, @tenant_id = p.tenant_id, @branch_id = p.branch_id
            FROM app_users u LEFT JOIN profiles p ON p.id = u.id
            WHERE u.email = @email;
        END

        SELECT @user_id AS user_id, @tenant_id AS tenant_id, @branch_id AS branch_id;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @errSev INT = ERROR_SEVERITY();
        DECLARE @errState INT = ERROR_STATE();
        RAISERROR(@errMsg, @errSev, @errState);
    END CATCH;
END;
GO

-- ============================================================
-- STORED PROCEDURE: Kullanici girisi (login)
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'sp_get_user_by_email')
    DROP PROCEDURE sp_get_user_by_email;
GO
CREATE PROCEDURE sp_get_user_by_email
    @email NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        u.id AS user_id,
        u.email,
        u.password_hash,
        p.id AS profile_id,
        p.tenant_id,
        p.branch_id,
        p.role_id,
        p.full_name,
        p.role,
        p.is_super_admin,
        p.onboarding_completed,
        p.allowed_ips,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.subscription_status,
        t.deployment_mode,
        t.lock_pin,
        t.require_cancel_reason,
        t.onboarding_completed AS tenant_onboarding,
        t.printer_settings,
        b.name AS branch_name,
        b.is_main AS branch_is_main,
        r.permissions AS role_permissions
    FROM app_users u
    LEFT JOIN profiles p ON p.id = u.id
    LEFT JOIN tenants t ON t.id = p.tenant_id
    LEFT JOIN branches b ON b.id = p.branch_id
    LEFT JOIN roles r ON r.id = p.role_id
    WHERE u.email = @email;
END;
GO

-- ============================================================
-- STORED PROCEDURE: Kullaniciya gore profil ara (ilike icin)
-- ============================================================
IF EXISTS (SELECT 1 FROM sys.procedures WHERE name = 'sp_find_profile_by_username')
    DROP PROCEDURE sp_find_profile_by_username;
GO
CREATE PROCEDURE sp_find_profile_by_username
    @username NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1 u.email
    FROM app_users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.email = @username + '@shefpos.local'
       OR u.email LIKE @username + '@%.shefpos.local'
       OR p.full_name = @username
       OR u.email = @username
    ORDER BY u.created_at;
END;
GO

PRINT N'ShefPOS SQL Server veritabani semasiniz basariyla olusturuldu!';
PRINT N'';
PRINT N'Baslangic icin:';
PRINT N'  EXEC sp_create_tenant_and_user @email=''admin@test.com'', @password_hash=''<bcrypt_hash>'', @full_name=''Admin'', @tenant_name=''Test Restoran'', @tenant_slug=''test-restoran'', @user_id=NULL OUTPUT, @tenant_id=NULL OUTPUT, @branch_id=NULL OUTPUT';
GO
