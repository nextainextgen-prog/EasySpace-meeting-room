-- Google Calendar sync — store the Google event ID per booking so we can
-- delete the event when the booking is cancelled. Nullable: bookings without
-- Google sync (Google API down, env unset, attendee_emails empty) leave it null.

alter table bookings
  add column if not exists google_event_id text;

create index if not exists idx_bookings_google_event_id
  on bookings (google_event_id)
  where google_event_id is not null;
