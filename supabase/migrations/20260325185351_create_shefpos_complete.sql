/*
  # ŞefPOS - Multi-Tenant Restaurant Management System

  ## Overview
  Complete restaurant POS system with multi-tenant support, table management, 
  package/delivery orders, and real-time order tracking.

  ## 1. New Tables

  ### tenants (İşletmeler)
  - `id` (uuid, primary key)
  - `name` (text) - İşletme adı
  - `slug` (text, unique) - URL-friendly işletme kodu
  - `address` (text) - Adres
  - `phone` (text) - Telefon
  - `email` (text) - E-posta
  - `logo_url` (text) - Logo
  - `subscription_status` (text) - active, suspended, cancelled
  - `created_at` (timestamp)

  ### profiles (Kullanıcılar)
  - `id` (uuid, primary key, references auth.users)
  - `tenant_id` (uuid, references tenants) - Bağlı olduğu işletme
  - `email` (text)
  - `full_name` (text)
  - `role` (text) - owner, admin, waiter, kitchen, cashier
  - `avatar_url` (text)
  - `created_at` (timestamp)

  ### restaurant_tables (Masalar)
  - `id` (uuid, primary key)
  - `tenant_id` (uuid, references tenants)
  - `table_number` (text) - Masa numarası
  - `capacity` (integer) - Kapasite
  - `status` (text) - available, occupied, reserved
  - `current_order_id` (uuid) - Aktif sipariş
  - `created_at` (timestamp)

  ### categories (Kategoriler)
  - `id` (uuid, primary key)
  - `tenant_id` (uuid, references tenants)
  - `name` (text) - Kategori adı
  - `display_order` (integer) - Sıralama
  - `created_at` (timestamp)

  ### products (Ürünler/Menü)
  - `id` (uuid, primary key)
  - `tenant_id` (uuid, references tenants)
  - `category_id` (uuid, references categories)
  - `name` (text) - Ürün adı
  - `description` (text) - Açıklama
  - `price` (numeric) - Fiyat
  - `image_url` (text) - Ürün resmi
  - `is_available` (boolean) - Stokta var mı
  - `created_at` (timestamp)

  ### orders (Siparişler)
  - `id` (uuid, primary key)
  - `tenant_id` (uuid, references tenants)
  - `order_number` (text) - Sipariş numarası
  - `table_id` (uuid, references restaurant_tables) - Masa (null ise paket)
  - `order_type` (text) - dine_in, takeaway, delivery
  - `status` (text) - pending, preparing, ready, completed, cancelled
  - `customer_name` (text) - Müşteri adı (paket servis için)
  - `customer_phone` (text) - Telefon (paket servis için)
  - `customer_address` (text) - Adres (delivery için)
  - `subtotal` (numeric) - Ara toplam
  - `tax` (numeric) - KDV
  - `total` (numeric) - Toplam
  - `notes` (text) - Notlar
  - `waiter_id` (uuid, references profiles) - Garson
  - `created_at` (timestamp)
  - `completed_at` (timestamp)

  ### order_items (Sipariş Kalemleri)
  - `id` (uuid, primary key)
  - `order_id` (uuid, references orders)
  - `product_id` (uuid, references products)
  - `quantity` (integer) - Adet
  - `unit_price` (numeric) - Birim fiyat
  - `subtotal` (numeric) - Toplam
  - `notes` (text) - Özel notlar
  - `status` (text) - pending, preparing, ready, served
  - `created_at` (timestamp)

  ## 2. Security
  - Enable RLS on all tables
  - Tenant isolation: Users can only access their own tenant's data
  - Role-based access control for different user types
*/

-- Create tenants table
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  address text,
  phone text,
  email text,
  logo_url text,
  subscription_status text DEFAULT 'active' CHECK (subscription_status IN ('active', 'suspended', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text DEFAULT 'waiter' CHECK (role IN ('owner', 'admin', 'waiter', 'kitchen', 'cashier')),
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Now add RLS policies for tenants (after profiles exists)
CREATE POLICY "Tenants are viewable by their members"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view profiles in their tenant"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create restaurant_tables table
CREATE TABLE restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_number text NOT NULL,
  capacity integer DEFAULT 4,
  status text DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved')),
  current_order_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, table_number)
);

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tables are viewable by tenant members"
  ON restaurant_tables FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update table status"
  ON restaurant_tables FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert tables"
  ON restaurant_tables FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete tables"
  ON restaurant_tables FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Create categories table
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are viewable by tenant members"
  ON categories FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage categories"
  ON categories FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Create products table
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric NOT NULL CHECK (price >= 0),
  image_url text,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are viewable by tenant members"
  ON products FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage products"
  ON products FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Create orders table
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  table_id uuid REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  order_type text DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway', 'delivery')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  customer_name text,
  customer_phone text,
  customer_address text,
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  waiter_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(tenant_id, order_number)
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Orders are viewable by tenant members"
  ON orders FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Staff can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Create order_items table
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  subtotal numeric NOT NULL CHECK (subtotal >= 0),
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order items are viewable by tenant members"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Staff can manage order items"
  ON order_items FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM orders WHERE tenant_id IN (
        SELECT tenant_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- Add foreign key constraint for current_order_id
ALTER TABLE restaurant_tables 
ADD CONSTRAINT restaurant_tables_current_order_id_fkey 
FOREIGN KEY (current_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX idx_tables_tenant_id ON restaurant_tables(tenant_id);
CREATE INDEX idx_tables_status ON restaurant_tables(status);
CREATE INDEX idx_categories_tenant_id ON categories(tenant_id);
CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);