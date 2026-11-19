-- ŞefPOS VDS güvenlik ve ölçek yaması (idempotent).
-- Sıra: shefpos_sqlserver.sql → shefpos_sqlserver_patches.sql → bu dosya.
-- Mevcut tablolara zarar vermez; eksik nesneleri ekler.

IF OBJECT_ID(N'dbo.api_sessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.api_sessions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_api_sessions PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    expires_at DATETIME2 NOT NULL,
    revoked_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_api_sessions_created DEFAULT SYSUTCDATETIME()
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_api_sessions_user' AND object_id = OBJECT_ID(N'dbo.api_sessions'))
  CREATE INDEX IX_api_sessions_user ON dbo.api_sessions(user_id, expires_at);
GO

IF OBJECT_ID(N'dbo.sms_otp_codes', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.sms_otp_codes (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_sms_otp_codes PRIMARY KEY,
    phone NVARCHAR(20) NOT NULL,
    purpose NVARCHAR(40) NOT NULL,
    code_hash NVARCHAR(128) NOT NULL,
    attempts INT NOT NULL CONSTRAINT DF_sms_otp_attempts DEFAULT 0,
    expires_at DATETIME2 NOT NULL,
    consumed_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_sms_otp_created DEFAULT SYSUTCDATETIME()
  );
END
GO

IF COL_LENGTH(N'dbo.online_order_platforms', N'webhook_secret') IS NULL
  ALTER TABLE dbo.online_order_platforms ADD webhook_secret NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.online_order_platforms', N'getir_x_api_key') IS NULL
  ALTER TABLE dbo.online_order_platforms ADD getir_x_api_key NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.online_order_platforms', N'remote_id') IS NULL
  ALTER TABLE dbo.online_order_platforms ADD remote_id NVARCHAR(120) NULL;
GO

IF OBJECT_ID(N'dbo.orders', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_orders_tenant_branch_status_created' AND object_id = OBJECT_ID(N'dbo.orders'))
  CREATE INDEX IX_orders_tenant_branch_status_created ON dbo.orders(tenant_id, branch_id, status, created_at);
GO

IF OBJECT_ID(N'dbo.restaurant_tables', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_tables_tenant_branch_status' AND object_id = OBJECT_ID(N'dbo.restaurant_tables'))
  CREATE INDEX IX_tables_tenant_branch_status ON dbo.restaurant_tables(tenant_id, branch_id, status);
GO

IF OBJECT_ID(N'dbo.print_jobs', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_print_jobs_tenant_status_created' AND object_id = OBJECT_ID(N'dbo.print_jobs'))
  CREATE INDEX IX_print_jobs_tenant_status_created ON dbo.print_jobs(tenant_id, status, created_at);
GO

IF OBJECT_ID(N'dbo.payment_transactions', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_payments_tenant_created' AND object_id = OBJECT_ID(N'dbo.payment_transactions'))
  CREATE INDEX IX_payments_tenant_created ON dbo.payment_transactions(tenant_id, created_at);
GO

IF OBJECT_ID(N'dbo.online_orders', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_online_orders_tenant_platform_ext' AND object_id = OBJECT_ID(N'dbo.online_orders'))
  CREATE INDEX IX_online_orders_tenant_platform_ext ON dbo.online_orders(tenant_id, platform_id, platform_order_id);
GO

IF OBJECT_ID(N'dbo.profiles', N'U') IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_profiles_tenant_active' AND object_id = OBJECT_ID(N'dbo.profiles'))
  CREATE INDEX IX_profiles_tenant_active ON dbo.profiles(tenant_id, is_active);
GO

PRINT N'SefPOS VDS security patch applied';
GO
