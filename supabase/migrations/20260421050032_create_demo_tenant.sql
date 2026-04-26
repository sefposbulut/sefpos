/*
  # Create Demo Tenant

  Demo tenant for safe testing - read-only access
*/

INSERT INTO tenants (name, slug, subscription_status)
SELECT 'Demo Tenant', 'demo-tenant', 'active'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'demo-tenant');
