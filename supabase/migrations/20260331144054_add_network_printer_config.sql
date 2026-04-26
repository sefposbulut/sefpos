/*
  # Add Network Printer Configuration

  1. Updates
    - Add ip_address and port fields to printer_settings JSONB
    - Enable direct network printing to ESC/POS thermal printers

  2. Notes
    - Kitchen and Bar printers can now have IP addresses configured
    - When IP is set, system sends ESC/POS commands directly via HTTP
    - Falls back to browser print dialog if network printer fails
*/

-- No schema changes needed, JSONB can hold any structure
-- This is just documentation for the printer_settings structure:
--
-- printer_settings: {
--   kitchen_printer: {
--     enabled: boolean,
--     name: string,
--     width: number,
--     encoding: string,
--     cut_paper: boolean,
--     ip_address: string,  // NEW: e.g. "192.168.1.100"
--     port: number         // NEW: e.g. 9100
--   },
--   bar_printer: {
--     enabled: boolean,
--     name: string,
--     width: number,
--     encoding: string,
--     cut_paper: boolean,
--     ip_address: string,  // NEW
--     port: number         // NEW
--   },
--   receipt_printer: {
--     enabled: boolean,
--     name: string,
--     width: number,
--     encoding: string,
--     cut_paper: boolean
--   }
-- }
