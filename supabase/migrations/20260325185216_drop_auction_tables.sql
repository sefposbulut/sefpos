/*
  # Clean up auction tables
  
  This migration removes the old auction system tables to make way for the ŞefPOS system.
*/

DROP TABLE IF EXISTS bids CASCADE;
DROP TABLE IF EXISTS auctions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;