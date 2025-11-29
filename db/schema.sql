CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  gender TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  type TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id),
  user_id TEXT,
  text TEXT,
  ts TIMESTAMP DEFAULT now()
);
