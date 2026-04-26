/*
  # Add deployment_mode to tenants

  ## Changes
  1. Add `deployment_mode` column to tenants table
     - Values: 'offline' | 'online' | 'hybrid'
     - Default: null (unset until onboarding completes)
  
  ## Notes
  - This stores how the tenant wants to operate: fully offline, cloud-connected, or hybrid
  - Selected during the onboarding wizard mode selection step
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'deployment_mode'
  ) THEN
    ALTER TABLE public.tenants ADD COLUMN deployment_mode text DEFAULT NULL
      CHECK (deployment_mode IN ('offline', 'online', 'hybrid'));
  END IF;
END $$;
