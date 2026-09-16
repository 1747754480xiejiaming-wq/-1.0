import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const faqs = sqliteTable('faqs', {
  id: text('id').primaryKey(), question: text('question').notNull(), questionKey: text('question_key').notNull().unique(), answer: text('answer').notNull(),
  keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull(), category: text('category').notNull(),
  libraryType: text('library_type').$type<'answer'|'forbidden'>().notNull().default('answer'),
  status: text('status').$type<'active' | 'disabled'>().notNull(), version: integer('version').notNull(), isDemo: integer('is_demo', { mode: 'boolean' }).notNull(),
  ownerId:text('owner_id').notNull().default('legacy'), updatedBy: text('updated_by'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
});

export const knowledgeVersions = sqliteTable('knowledge_versions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  contentHash: text('content_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  createdBy: text('created_by'),
});

export const answerDecisionTraces = sqliteTable('answer_decision_traces', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  requestId: text('request_id').notNull(),
  inputFingerprint: text('input_fingerprint').notNull(),
  disposition: text('disposition').$type<'answer' | 'clarify' | 'escalate'>().notNull(),
  faqId: text('faq_id'),
  knowledgeVersion: text('knowledge_version').notNull(),
  configVersion: text('config_version').notNull(),
  keyFactsJson: text('key_facts_json', {mode: 'json'}).$type<string[]>().notNull(),
  evidenceIdsJson: text('evidence_ids_json', {mode: 'json'}).$type<string[]>().notNull(),
  reason: text('reason'),
  createdAt: integer('created_at').notNull(),
});

export const conversationSessions = sqliteTable('conversation_sessions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  channel: text('channel').$type<'web' | 'qq'>().notNull(),
  targetId: text('target_id').notNull(),
  senderId: text('sender_id').notNull(),
  status: text('status').$type<'active' | 'completed' | 'expired'>().notNull(),
  round: integer('round').notNull(),
  originalQuestion: text('original_question').notNull(),
  knowledgeVersion: text('knowledge_version').notNull(),
  configVersion: text('config_version').notNull(),
  version: integer('version').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const conversationMessages = sqliteTable('conversation_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  requestId: text('request_id').notNull(),
  direction: text('direction').$type<'inbound' | 'outbound'>().notNull(),
  text: text('text').notNull(),
  intent: text('intent').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const conversationSlots = sqliteTable('conversation_slots', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  slotKey: text('slot_key').notNull(),
  value: text('value'),
  sourceMessageId: text('source_message_id'),
  confidence: integer('confidence').notNull(),
  asked: integer('asked', {mode: 'boolean'}).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const evaluationRuns = sqliteTable('evaluation_runs', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  datasetVersion: text('dataset_version').notNull(),
  evidenceKind: text('evidence_kind').$type<'teacher' | 'synthetic'>().notNull(),
  knowledgeVersion: text('knowledge_version').notNull(),
  configVersion: text('config_version').notNull(),
  codeVersion: text('code_version').notNull(),
  status: text('status').$type<'running' | 'completed' | 'failed' | 'awaiting_real_data'>().notNull(),
  summaryJson: text('summary_json'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});

export const evaluationResults = sqliteTable('evaluation_results', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  sampleId: text('sample_id').notNull(),
  metric: text('metric').notNull(),
  status: text('status').notNull(),
  expectedJson: text('expected_json').notNull(),
  actualJson: text('actual_json').notNull(),
  signatureJson: text('signature_json'),
  divergenceJson: text('divergence_json'),
  createdAt: integer('created_at').notNull(),
});

export const teacherTaskTimings = sqliteTable('teacher_task_timings', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  taskId: text('task_id').notNull(),
  sessionId: text('session_id').notNull(),
  activeMs: integer('active_ms').notNull(),
  elapsedMs: integer('elapsed_ms').notNull(),
  completionMode: text('completion_mode').$type<'link' | 'create' | 'direct_reply'>().notNull(),
  clientStartedAt: integer('client_started_at').notNull(),
  createdAt: integer('created_at').notNull(),
});
