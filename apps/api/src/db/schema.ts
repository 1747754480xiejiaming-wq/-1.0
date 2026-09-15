import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const faqs = sqliteTable('faqs', {
  id: text('id').primaryKey(), question: text('question').notNull(), questionKey: text('question_key').notNull().unique(), answer: text('answer').notNull(),
  keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull(), category: text('category').notNull(),
  libraryType: text('library_type').$type<'answer'|'forbidden'>().notNull().default('answer'),
  status: text('status').$type<'active' | 'disabled'>().notNull(), version: integer('version').notNull(), isDemo: integer('is_demo', { mode: 'boolean' }).notNull(),
  ownerId:text('owner_id').notNull().default('legacy'), updatedBy: text('updated_by'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
});
