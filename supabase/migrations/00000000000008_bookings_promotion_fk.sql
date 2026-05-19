-- Add the missing FK from bookings.promotion_id -> promotions.id.
-- Was omitted in init.sql (line 252), which broke PostgREST embedded joins
-- like `promotion:promotions(...)` and caused getBookingDetail to fail.
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'bookings'
      and constraint_name = 'bookings_promotion_id_fkey'
  ) then
    alter table bookings
      add constraint bookings_promotion_id_fkey
      foreign key (promotion_id) references promotions(id)
      on delete set null;
  end if;
end $$;

create index if not exists bookings_promotion_id_idx on bookings(promotion_id);
