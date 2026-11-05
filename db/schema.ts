import {sqliteTable,text,integer,uniqueIndex,index} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('coop_rooms',{
 code:text('code').primaryKey(),hostHash:text('host_hash').notNull(),hostName:text('host_name').notNull(),
 guestHash:text('guest_hash'),guestName:text('guest_name'),snapshot:text('snapshot').notNull(),
 hostSeen:integer('host_seen').notNull(),guestSeen:integer('guest_seen').notNull().default(0),
 ack:integer('ack').notNull().default(0),seq:integer('seq').notNull().default(0),expires:integer('expires').notNull(),
});
export const commands=sqliteTable('coop_commands',{
 id:integer('id').primaryKey({autoIncrement:true}),room:text('room').notNull(),nonce:text('nonce').notNull(),payload:text('payload').notNull(),
},t=>[uniqueIndex('coop_command_nonce').on(t.room,t.nonce),index('coop_command_room').on(t.room,t.id)]);
