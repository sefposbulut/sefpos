/*
  # Add Table Size Management

  1. Changes
    - Add `size` column to `restaurant_tables` table
      - size (text): Size indicator ('small', 'medium', 'large', 'xlarge')
      - Default value is 'medium'
    
  2. Notes
    - Allows dynamic table sizing in the UI
    - Existing tables will default to 'medium' size
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'size'
  ) THEN
    ALTER TABLE restaurant_tables 
    ADD COLUMN size text DEFAULT 'medium' CHECK (size IN ('small', 'medium', 'large', 'xlarge'));
  END IF;
END $$;