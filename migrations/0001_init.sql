CREATE TYPE loan_status AS ENUM ('PENDING', 'APPROVED', 'PAID');
CREATE TYPE repayment_status AS ENUM ('PENDING', 'PAID');

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL,
  password_hash text NOT NULL,
  first_name    text NOT NULL,
  last_name     text NOT NULL DEFAULT '',
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE sessions (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  valid_till timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE loans (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  term         integer NOT NULL CHECK (term BETWEEN 1 AND 520),
  status       loan_status NOT NULL DEFAULT 'PENDING',
  approved_by  uuid REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'PENDING' OR approved_by IS NOT NULL)
);
CREATE INDEX loans_user_id_created_at_idx ON loans (user_id, created_at);

CREATE TABLE repayments (
  id          uuid PRIMARY KEY,
  loan_id     uuid NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  seq         integer NOT NULL CHECK (seq >= 1),
  due_cents   bigint NOT NULL CHECK (due_cents >= 0),
  paid_cents  bigint NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  is_last     boolean NOT NULL,
  status      repayment_status NOT NULL DEFAULT 'PENDING',
  due_date    timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, seq)
);
