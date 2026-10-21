#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/fddb5e31cf45f2cca659f1efa52aaf25fe562fae7bbff7716acb749318636de3/contract';
import endContract from '../../snapshots/fddb5e31cf45f2cca659f1efa52aaf25fe562fae7bbff7716acb749318636de3/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'campaign_attachments',
        columns: [
          col('attachment_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('campaign_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('content_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('file_size_bytes', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('filename', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('recipient_email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('storage_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'campaign_recipients',
        columns: [
          col('campaign_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('recipient_json', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('scheduled_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('sent_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'campaigns',
        columns: [
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('failed_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('scheduled_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('sent_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('smtp_config_json', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('template_json', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('total_emails', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('user_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'files_handler',
        columns: [
          col('attachment_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('chunk_count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('chunk_index', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('content_base64', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('content_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('filename', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('job_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('session_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'send_jobs',
        columns: [
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('failed_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('job_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('label', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('payload_json', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('results_json', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('scheduled_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('sent_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('total_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['job_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'send_recipients',
        columns: [
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('job_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('recipient_json', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sent_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'send_tokens',
        columns: [
          col('gmail_token', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('outlook_tokens', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'work_sessions',
        columns: [
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
          col('payload_json', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('session_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-string@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['session_id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaign_attachments',
        index: 'campaign_attachments_campaign_id_idx',
        columns: ['campaign_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaign_recipients',
        index: 'campaign_recipients_campaign_id_email_key',
        columns: ['campaign_id', 'email'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaign_recipients',
        index: 'campaign_recipients_status_scheduled_at_idx',
        columns: ['status', 'scheduled_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'campaigns',
        index: 'campaigns_user_id_created_at_idx',
        columns: ['user_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'files_handler',
        index: 'files_handler_attachment_id_chunk_index_key',
        columns: ['attachment_id', 'chunk_index'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'files_handler',
        index: 'files_handler_job_id_idx',
        columns: ['job_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'files_handler',
        index: 'files_handler_session_id_idx',
        columns: ['session_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'send_jobs',
        index: 'send_jobs_status_scheduled_at_idx',
        columns: ['status', 'scheduled_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'send_recipients',
        index: 'send_recipients_job_id_email_idx',
        columns: ['job_id', 'email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'send_recipients',
        index: 'send_recipients_job_id_status_idx',
        columns: ['job_id', 'status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campaign_attachments',
        foreignKey: {
          name: 'campaign_attachments_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'campaigns', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'campaign_recipients',
        foreignKey: {
          name: 'campaign_recipients_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'campaigns', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
