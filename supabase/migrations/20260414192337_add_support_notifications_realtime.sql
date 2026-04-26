/*
  # Add support_notifications to realtime publication

  ## Changes
  - Adds `support_notifications` table to supabase_realtime publication
    so clients receive live INSERT events when admin sends notifications
*/

ALTER PUBLICATION supabase_realtime ADD TABLE support_notifications;
