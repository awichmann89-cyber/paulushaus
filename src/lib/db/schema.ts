import {
  pgTable, serial, text, integer, timestamp, boolean, date, time, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

/* Rollen und Status als text + CHECK-freie Konvention – hält Migrationen einfach */
export const ROLES = ['ADMIN', 'USER'] as const;
export const USER_STATUS = ['INVITED', 'ACTIVE', 'DISABLED'] as const;
export const SPAN_MODES = ['SINGLE', 'THROUGH', 'DAILY'] as const;
export const BOOKING_STATUS = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'] as const;

export type Role = (typeof ROLES)[number];
export type UserStatus = (typeof USER_STATUS)[number];
export type SpanMode = (typeof SPAN_MODES)[number];
export type BookingStatus = (typeof BOOKING_STATUS)[number];

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    role: text('role').$type<Role>().notNull().default('USER'),
    status: text('status').$type<UserStatus>().notNull().default('INVITED'),
    inviteToken: text('invite_token'),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    tokenIdx: index('users_token_idx').on(t.inviteToken),
  }),
);

export const roomGroups = pgTable('room_groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#007AFF'),
  capacity: integer('capacity').notNull().default(0),
  equipment: text('equipment').notNull().default(''),
  groupId: integer('group_id').references(() => roomGroups.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  isPublic: boolean('is_public').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

/* Datum + Uhrzeit getrennt: die App läuft an genau einem Standort,
   deshalb ist lokale Wandzeit die richtige Speicherform – keine UTC-Umrechnung nötig. */
export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    note: text('note'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    startTime: time('start_time', { precision: 0 }).notNull(),
    endTime: time('end_time', { precision: 0 }).notNull(),
    spanMode: text('span_mode').$type<SpanMode>().notNull().default('SINGLE'),
    status: text('status').$type<BookingStatus>().notNull().default('PENDING'),
    attendees: integer('attendees').notNull().default(0),
    createdById: integer('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedById: integer('decided_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Nur für Datenübernahmen gesetzt (z. B. 'belegungsplan-2026').
     *  Erlaubt es, einen Import gezielt zurückzunehmen, ohne von Hand
     *  angelegte Termine anzufassen. In der App selbst nicht sichtbar. */
    importSource: text('import_source'),
  },
  (t) => ({
    rangeIdx: index('bookings_range_idx').on(t.startDate, t.endDate),
    roomIdx: index('bookings_room_idx').on(t.roomId),
    importIdx: index('bookings_import_idx').on(t.importSource),
  }),
);

/* Letzter Export je Raum und Monat – Basis für „Plan hat sich geändert“ */
export const roomExports = pgTable(
  'room_exports',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
    month: text('month').notNull(), // YYYY-MM
    exportedAt: timestamp('exported_at', { withTimezone: true }).notNull().defaultNow(),
    exportedById: integer('exported_by_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({ uniq: uniqueIndex('room_exports_room_month_idx').on(t.roomId, t.month) }),
);

export type User = typeof users.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type RoomGroup = typeof roomGroups.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type RoomExport = typeof roomExports.$inferSelect;
