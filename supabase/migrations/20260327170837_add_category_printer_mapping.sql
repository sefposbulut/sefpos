/*
  # Add Category-Based Printer Mapping

  1. Changes
    - Add `printer_type` column to categories table
    - Allows assigning specific printer (kitchen/bar/none) to each category
    - Kitchen categories auto-print to kitchen printer
    - Bar categories auto-print to bar printer
  
  2. Security
    - No RLS changes needed (categories already protected)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'printer_type'
  ) THEN
    ALTER TABLE categories ADD COLUMN printer_type text DEFAULT 'none' CHECK (printer_type IN ('none', 'kitchen', 'bar'));
  END IF;
END $$;

COMMENT ON COLUMN categories.printer_type IS 'Which printer to use for this category: none, kitchen, or bar';
