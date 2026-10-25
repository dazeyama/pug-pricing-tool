CREATE OR REPLACE FUNCTION internal.unpriced_in_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if new.price_source = 'unpriced' and not exists (
       select 1 from buys b where b.id = new.buy_id and (b.project or b.system_key is not null)) then
    raise exception 'unpriced_cards';
  end if;
  return new;
end;
$function$;

-- Granted: {postgres=X/postgres}
