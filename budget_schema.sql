-- ============================================================
-- Personal Budget App — Initial Schema
-- Paste this whole file into Supabase SQL Editor and click Run
-- ============================================================

-- 1. Categories — single source of truth (feeds Planning, Tracking dropdown, Dashboard)
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income','expense','savings')),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 2. Budget Amounts — the 6-year Planning grid (one row per category per year/month)
create table budget_amounts (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  amount numeric(12,2) not null default 0,
  unique (category_id, year, month)
);

-- 3. Settings — one row per user
create table settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starting_year int not null default extract(year from now())::int,
  shift_late_income_active boolean not null default true,
  shift_late_income_day int not null default 25,
  savings_rate_method text not null default 'active' check (savings_rate_method in ('active','passive'))
);

-- 4. Transactions — the Tracking ledger
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  type text not null check (type in ('income','expense','savings')),
  category_id uuid references categories(id),
  amount numeric(12,2) not null,
  details text,
  effective_date date,
  created_at timestamptz not null default now()
);

-- 5. Savings goal envelopes
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  goal_amount numeric(12,2) not null default 0,
  current_amount numeric(12,2) not null default 0,
  sort_order int not null default 0
);

-- 6. Asset allocation holdings
create table asset_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bucket text not null, -- 'US', 'World', 'Cash', 'Crypto'
  target_pct numeric(5,2) not null,
  current_value numeric(12,2) not null default 0
);

-- ============================================================
-- Effective Date trigger — implements "shift late income" logic
-- ============================================================
create or replace function compute_effective_date()
returns trigger as $$
declare
  s record;
begin
  select * into s from settings where user_id = new.user_id;

  if new.type = 'income' and s.shift_late_income_active
     and extract(day from new.date) >= s.shift_late_income_day then
    new.effective_date := (date_trunc('month', new.date) + interval '1 month')::date;
  else
    new.effective_date := date_trunc('month', new.date)::date;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger set_effective_date
before insert or update on transactions
for each row execute function compute_effective_date();

-- ============================================================
-- Row Level Security — every table locked to its owner
-- ============================================================
alter table categories enable row level security;
alter table budget_amounts enable row level security;
alter table settings enable row level security;
alter table transactions enable row level security;
alter table savings_goals enable row level security;
alter table asset_holdings enable row level security;

create policy "Owner access" on categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owner access" on budget_amounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owner access" on settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owner access" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owner access" on savings_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owner access" on asset_holdings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
