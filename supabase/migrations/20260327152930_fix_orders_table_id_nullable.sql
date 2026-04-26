/*
  # Fix Orders Table ID to Allow Null

  1. Changes
    - Make `table_id` nullable in orders table
    - This allows credit sales without a table assignment
    - Orders can be created for customers without being tied to a restaurant table

  2. Security
    - No changes to RLS policies
*/

-- Make table_id nullable for credit sales
ALTER TABLE orders 
ALTER COLUMN table_id DROP NOT NULL;
