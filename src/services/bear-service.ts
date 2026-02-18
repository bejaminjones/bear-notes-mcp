/**
 * Bear MCP Server - Bear Service
 * Copyright (c) 2024 Bear MCP Server
 * MIT License - see LICENSE file for details
 */

import { BearDatabase, CoreDataUtils } from '../utils/database.js';
import {
  BearNote,
  NoteWithTags,
  TagWithCount,
  DatabaseStats,
  NoteSearchOptions,
  SQLParameter,
  FileMetadata,
  ContentAnalysis,
  LinkAnalysis,
  StructureAnalysis,
  DatabaseFileRecord,
  DatabaseFileWithNote,
} from '../types/bear.js';

/**
 * Service layer for Bear database operations
 * Provides high-level methods for interacting with Bear's data
 */
export class BearService {
  private database: BearDatabase;

  constructor(dbPath?: string) {
    this.database = new BearDatabase(dbPath);
  }

  /**
   * Get comprehensive database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    await this.database.connect(true); // Read-only connection

    try {
      const [
        totalNotes,
        activeNotes,
        trashedNotes,
        archivedNotes,
        encryptedNotes,
        totalTags,
        totalAttachments,
      ] = await Promise.all([
        this.database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM ZSFNOTE'),
        this.database.queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM ZSFNOTE WHERE ZTRASHED = 0'
        ),
        this.database.queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM ZSFNOTE WHERE ZTRASHED = 1'
        ),
        this.database.queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM ZSFNOTE WHERE ZARCHIVED = 1'
        ),
        this.database.queryOne<{ count: number }>(
          'SELECT COUNT(*) as count FROM ZSFNOTE WHERE ZENCRYPTED = 1'
        ),
        this.database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM ZSFNOTETAG'),
        this.database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM ZSFNOTEFILE'),
      ]);

      // Get database file size and last modified date
      const fs = await import('fs/promises');
      const stats = await fs.stat(this.database['dbPath']);

      return {
        totalNotes: totalNotes?.count || 0,
        activeNotes: activeNotes?.count || 0,
        trashedNotes: trashedNotes?.count || 0,
        archivedNotes: archivedNotes?.count || 0,
        encryptedNotes: encryptedNotes?.count || 0,
        totalTags: totalTags?.count || 0,
        totalAttachments: totalAttachments?.count || 0,
        databaseSize: stats.size,
        lastModified: stats.mtime,
      };
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get all notes with optional filtering
   */
  async getNotes(options: NoteSearchOptions = {}): Promise<NoteWithTags[]> {
    await this.database.connect(true);

    try {
      let sql = `
        SELECT n.*, GROUP_CONCAT(t.ZTITLE) as tag_names
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE 1=1
      `;

      const params: SQLParameter[] = [];

      // Apply filters
      if (!options.includeTrashed) {
        sql += ' AND n.ZTRASHED = 0';
      }

      if (!options.includeArchived) {
        sql += ' AND n.ZARCHIVED = 0';
      }

      if (options.query) {
        sql += ' AND (n.ZTITLE LIKE ? OR n.ZTEXT LIKE ?)';
        const searchTerm = `%${options.query}%`;
        params.push(searchTerm, searchTerm);
      }

      if (options.dateFrom) {
        sql += ' AND n.ZCREATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(options.dateFrom));
      }

      if (options.dateTo) {
        sql += ' AND n.ZCREATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(options.dateTo));
      }

      sql += ' GROUP BY n.Z_PK ORDER BY n.ZMODIFICATIONDATE DESC';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);

        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const rows = await this.database.query<BearNote & { tag_names: string }>(sql, params);

      return rows.map(row => ({
        ...row,
        tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
      }));
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get a single note by ID
   */
  async getNoteById(id: number): Promise<NoteWithTags | null> {
    await this.database.connect(true);

    try {
      const sql = `
        SELECT n.*, GROUP_CONCAT(t.ZTITLE) as tag_names
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE n.Z_PK = ?
        GROUP BY n.Z_PK
      `;

      const row = await this.database.queryOne<BearNote & { tag_names: string }>(sql, [id]);

      if (!row) {
        return null;
      }

      return {
        ...row,
        tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
      };
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get a single note by title
   */
  async getNoteByTitle(title: string): Promise<NoteWithTags | null> {
    await this.database.connect(true);

    try {
      const sql = `
        SELECT n.*, GROUP_CONCAT(t.ZTITLE) as tag_names
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE n.ZTITLE = ? AND n.ZTRASHED = 0
        GROUP BY n.Z_PK
        LIMIT 1
      `;

      const row = await this.database.queryOne<BearNote & { tag_names: string }>(sql, [title]);

      if (!row) {
        return null;
      }

      return {
        ...row,
        tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
      };
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Search notes by content and title
   */
  async searchNotes(query: string, options: NoteSearchOptions = {}): Promise<NoteWithTags[]> {
    return this.getNotes({ ...options, query });
  }

  /**
   * Get all tags with usage counts
   * @param options.includeOrphanTags - If true, includes tags with no active notes (default: false)
   */
  async getTags(options?: { includeOrphanTags?: boolean }): Promise<TagWithCount[]> {
    const includeOrphanTags = options?.includeOrphanTags ?? false;
    await this.database.connect(true);

    try {
      const sql = `
        SELECT t.*, COUNT(n.Z_PK) as noteCount
        FROM ZSFNOTETAG t
        LEFT JOIN Z_5TAGS nt ON t.Z_PK = nt.Z_13TAGS
        LEFT JOIN ZSFNOTE n ON nt.Z_5NOTES = n.Z_PK AND n.ZTRASHED = 0
        GROUP BY t.Z_PK
        ${includeOrphanTags ? '' : 'HAVING noteCount > 0'}
        ORDER BY noteCount DESC, t.ZTITLE ASC
      `;

      const tags = await this.database.query<TagWithCount>(sql);

      // Normalize tag names to lowercase to match Bear's sidebar display
      return tags.map(tag => ({
        ...tag,
        ZTITLE: tag.ZTITLE?.toLowerCase() ?? tag.ZTITLE,
      }));
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get notes by tag (case-insensitive)
   */
  async getNotesByTag(tagName: string): Promise<NoteWithTags[]> {
    await this.database.connect(true);

    try {
      const sql = `
        SELECT n.*, GROUP_CONCAT(t2.ZTITLE) as tag_names
        FROM ZSFNOTE n
        JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        LEFT JOIN Z_5TAGS nt2 ON n.Z_PK = nt2.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t2 ON nt2.Z_13TAGS = t2.Z_PK
        WHERE LOWER(t.ZTITLE) = LOWER(?) AND n.ZTRASHED = 0
        GROUP BY n.Z_PK
        ORDER BY n.ZMODIFICATIONDATE DESC
      `;

      const rows = await this.database.query<BearNote & { tag_names: string }>(sql, [tagName]);

      return rows.map(row => ({
        ...row,
        tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
      }));
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Check if Bear app is currently running
   */
  async isBearRunning(): Promise<boolean> {
    return this.database.isBearRunning();
  }

  /**
   * Verify database access
   */
  async verifyDatabaseAccess(): Promise<void> {
    await this.database.verifyDatabaseAccess();
  }

  /**
   * Create a database backup
   */
  async createBackup(): Promise<string> {
    return this.database.createBackup();
  }

  /**
   * Get database schema information
   */
  async getSchema(): Promise<{ name: string; sql: string }[]> {
    await this.database.connect(true);

    try {
      return this.database.getSchema();
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Check database integrity
   */
  async checkIntegrity(): Promise<boolean> {
    await this.database.connect(true);

    try {
      return this.database.checkIntegrity();
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get recent notes (last 10 by default)
   */
  async getRecentNotes(limit: number = 10): Promise<NoteWithTags[]> {
    return this.getNotes({ limit, includeArchived: false, includeTrashed: false });
  }

  /**
   * Get note count by status
   */
  async getNoteCountsByStatus(): Promise<{
    total: number;
    active: number;
    trashed: number;
    archived: number;
    encrypted: number;
  }> {
    const stats = await this.getDatabaseStats();
    return {
      total: stats.totalNotes,
      active: stats.activeNotes,
      trashed: stats.trashedNotes,
      archived: stats.archivedNotes,
      encrypted: stats.encryptedNotes,
    };
  }

  /**
   * Get notes with advanced filtering options
   */
  async getNotesAdvanced(
    options: {
      query?: string;
      tags?: string[];
      excludeTags?: string[];
      dateFrom?: Date;
      dateTo?: Date;
      modifiedAfter?: Date;
      modifiedBefore?: Date;
      includeContent?: boolean;
      includeTrashed?: boolean;
      includeArchived?: boolean;
      includeEncrypted?: boolean;
      sortBy?: 'created' | 'modified' | 'title' | 'size';
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<NoteWithTags[]> {
    await this.database.connect(true);

    try {
      let sql = `
        SELECT n.*, GROUP_CONCAT(DISTINCT t.ZTITLE) as tag_names,
               LENGTH(n.ZTEXT) as content_length,
               CASE 
                 WHEN n.ZENCRYPTED = 1 THEN '[ENCRYPTED]'
                 ELSE SUBSTR(n.ZTEXT, 1, 200)
               END as preview
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE 1=1
      `;

      const params: SQLParameter[] = [];

      // Basic filters
      if (!options.includeTrashed) {
        sql += ' AND n.ZTRASHED = 0';
      }

      if (!options.includeArchived) {
        sql += ' AND n.ZARCHIVED = 0';
      }

      if (!options.includeEncrypted) {
        sql += ' AND n.ZENCRYPTED = 0';
      }

      // Text search
      if (options.query) {
        sql += ' AND (n.ZTITLE LIKE ? OR n.ZTEXT LIKE ?)';
        const searchTerm = `%${options.query}%`;
        params.push(searchTerm, searchTerm);
      }

      // Date filters
      if (options.dateFrom) {
        sql += ' AND n.ZCREATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(options.dateFrom));
      }

      if (options.dateTo) {
        sql += ' AND n.ZCREATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(options.dateTo));
      }

      if (options.modifiedAfter) {
        sql += ' AND n.ZMODIFICATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(options.modifiedAfter));
      }

      if (options.modifiedBefore) {
        sql += ' AND n.ZMODIFICATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(options.modifiedBefore));
      }

      sql += ' GROUP BY n.Z_PK';

      // Tag filters (applied after grouping)
      if (options.tags && options.tags.length > 0) {
        const tagConditions = options.tags.map(() => 'tag_names LIKE ?').join(' AND ');
        sql += ` HAVING ${tagConditions}`;
        options.tags.forEach(tag => params.push(`%${tag}%`));
      }

      if (options.excludeTags && options.excludeTags.length > 0) {
        const excludeConditions = options.excludeTags
          .map(() => 'tag_names NOT LIKE ? OR tag_names IS NULL')
          .join(' AND ');
        sql += options.tags ? ` AND (${excludeConditions})` : ` HAVING (${excludeConditions})`;
        options.excludeTags.forEach(tag => params.push(`%${tag}%`));
      }

      // Sorting
      const sortBy = options.sortBy || 'modified';
      const sortOrder = options.sortOrder || 'desc';

      switch (sortBy) {
        case 'created':
          sql += ` ORDER BY n.ZCREATIONDATE ${sortOrder.toUpperCase()}`;
          break;
        case 'modified':
          sql += ` ORDER BY n.ZMODIFICATIONDATE ${sortOrder.toUpperCase()}`;
          break;
        case 'title':
          sql += ` ORDER BY n.ZTITLE ${sortOrder.toUpperCase()}`;
          break;
        case 'size':
          sql += ` ORDER BY LENGTH(n.ZTEXT) ${sortOrder.toUpperCase()}`;
          break;
        default:
          sql += ` ORDER BY n.ZMODIFICATIONDATE DESC`;
      }

      // Pagination
      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);

        if (options.offset) {
          sql += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const rows = await this.database.query<
        BearNote & {
          tag_names: string;
          content_length: number;
          preview: string;
        }
      >(sql, params);

      return rows.map(row => ({
        ...row,
        tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
        contentLength: row.content_length,
        preview: row.preview,
      }));
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get notes by multiple criteria with AND/OR logic
   */
  async getNotesWithCriteria(criteria: {
    titleContains?: string[];
    contentContains?: string[];
    hasAllTags?: string[];
    hasAnyTags?: string[];
    createdAfter?: Date;
    createdBefore?: Date;
    modifiedAfter?: Date;
    modifiedBefore?: Date;
    minLength?: number;
    maxLength?: number;
    isPinned?: boolean;
    isArchived?: boolean;
    isTrashed?: boolean;
    isEncrypted?: boolean;
  }): Promise<NoteWithTags[]> {
    await this.database.connect(true);

    try {
      let sql = `
        SELECT n.*, GROUP_CONCAT(DISTINCT t.ZTITLE) as tag_names,
               LENGTH(n.ZTEXT) as content_length
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE 1=1
      `;

      const params: SQLParameter[] = [];

      // Title search (OR logic for multiple terms)
      if (criteria.titleContains && criteria.titleContains.length > 0) {
        const titleConditions = criteria.titleContains.map(() => 'n.ZTITLE LIKE ?').join(' OR ');
        sql += ` AND (${titleConditions})`;
        criteria.titleContains.forEach(term => params.push(`%${term}%`));
      }

      // Content search (OR logic for multiple terms)
      if (criteria.contentContains && criteria.contentContains.length > 0) {
        const contentConditions = criteria.contentContains.map(() => 'n.ZTEXT LIKE ?').join(' OR ');
        sql += ` AND (${contentConditions})`;
        criteria.contentContains.forEach(term => params.push(`%${term}%`));
      }

      // Date filters
      if (criteria.createdAfter) {
        sql += ' AND n.ZCREATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(criteria.createdAfter));
      }

      if (criteria.createdBefore) {
        sql += ' AND n.ZCREATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(criteria.createdBefore));
      }

      if (criteria.modifiedAfter) {
        sql += ' AND n.ZMODIFICATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(criteria.modifiedAfter));
      }

      if (criteria.modifiedBefore) {
        sql += ' AND n.ZMODIFICATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(criteria.modifiedBefore));
      }

      // Content length filters
      if (criteria.minLength) {
        sql += ' AND LENGTH(n.ZTEXT) >= ?';
        params.push(criteria.minLength);
      }

      if (criteria.maxLength) {
        sql += ' AND LENGTH(n.ZTEXT) <= ?';
        params.push(criteria.maxLength);
      }

      // Boolean filters
      if (criteria.isPinned !== undefined) {
        sql += ' AND n.ZPINNED = ?';
        params.push(criteria.isPinned ? 1 : 0);
      }

      if (criteria.isArchived !== undefined) {
        sql += ' AND n.ZARCHIVED = ?';
        params.push(criteria.isArchived ? 1 : 0);
      }

      if (criteria.isTrashed !== undefined) {
        sql += ' AND n.ZTRASHED = ?';
        params.push(criteria.isTrashed ? 1 : 0);
      }

      if (criteria.isEncrypted !== undefined) {
        sql += ' AND n.ZENCRYPTED = ?';
        params.push(criteria.isEncrypted ? 1 : 0);
      }

      sql += ' GROUP BY n.Z_PK';

      // Tag filters (applied after grouping)
      if (criteria.hasAllTags && criteria.hasAllTags.length > 0) {
        const allTagConditions = criteria.hasAllTags.map(() => 'tag_names LIKE ?').join(' AND ');
        sql += ` HAVING ${allTagConditions}`;
        criteria.hasAllTags.forEach(tag => params.push(tag));
      }

      if (criteria.hasAnyTags && criteria.hasAnyTags.length > 0) {
        const anyTagConditions = criteria.hasAnyTags.map(() => 'tag_names LIKE ?').join(' OR ');
        const havingClause = criteria.hasAllTags
          ? ` AND (${anyTagConditions})`
          : ` HAVING (${anyTagConditions})`;
        sql += havingClause;
        criteria.hasAnyTags.forEach(tag => params.push(tag));
      }

      sql += ' ORDER BY n.ZMODIFICATIONDATE DESC';

      const rows = await this.database.query<
        BearNote & {
          tag_names: string;
          content_length: number;
        }
      >(sql, params);

      return rows.map(row => ({
        ...row,
        tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
        contentLength: row.content_length,
      }));
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get note statistics and analytics
   */
  async getNoteAnalytics(): Promise<{
    totalNotes: number;
    averageLength: number;
    longestNote: { title: string; length: number };
    shortestNote: { title: string; length: number };
    mostRecentNote: { title: string; date: Date };
    oldestNote: { title: string; date: Date };
    notesPerMonth: { month: string; count: number }[];
    topTags: { tag: string; count: number }[];
    contentStats: {
      hasImages: number;
      hasFiles: number;
      hasSourceCode: number;
      hasTodos: number;
    };
  }> {
    await this.database.connect(true);

    try {
      const [totalStats, longestNote, shortestNote, mostRecentNote, oldestNote, contentStats] =
        await Promise.all([
          this.database.queryOne<{ count: number; avgLength: number }>(`
          SELECT COUNT(*) as count, AVG(LENGTH(ZTEXT)) as avgLength
          FROM ZSFNOTE 
          WHERE ZTRASHED = 0
        `),
          this.database.queryOne<{ ZTITLE: string; length: number }>(`
          SELECT ZTITLE, LENGTH(ZTEXT) as length
          FROM ZSFNOTE 
          WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
          ORDER BY LENGTH(ZTEXT) DESC 
          LIMIT 1
        `),
          this.database.queryOne<{ ZTITLE: string; length: number }>(`
          SELECT ZTITLE, LENGTH(ZTEXT) as length
          FROM ZSFNOTE 
          WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
          ORDER BY LENGTH(ZTEXT) ASC 
          LIMIT 1
        `),
          this.database.queryOne<{ ZTITLE: string; ZMODIFICATIONDATE: number }>(`
          SELECT ZTITLE, ZMODIFICATIONDATE
          FROM ZSFNOTE 
          WHERE ZTRASHED = 0
          ORDER BY ZMODIFICATIONDATE DESC 
          LIMIT 1
        `),
          this.database.queryOne<{ ZTITLE: string; ZCREATIONDATE: number }>(`
          SELECT ZTITLE, ZCREATIONDATE
          FROM ZSFNOTE 
          WHERE ZTRASHED = 0
          ORDER BY ZCREATIONDATE ASC 
          LIMIT 1
        `),
          this.database.queryOne<{
            hasImages: number;
            hasFiles: number;
            hasSourceCode: number;
            todos: number;
          }>(`
          SELECT 
            SUM(ZHASIMAGES) as hasImages,
            SUM(ZHASFILES) as hasFiles,
            SUM(ZHASSOURCECODE) as hasSourceCode,
            SUM(ZTODOCOMPLETED + ZTODOINCOMPLETED) as todos
          FROM ZSFNOTE 
          WHERE ZTRASHED = 0
        `),
        ]);

      // Get monthly note creation stats
      const monthlyStats = await this.database.query<{ month: string; count: number }>(`
        SELECT 
          strftime('%Y-%m', datetime(ZCREATIONDATE + 978307200, 'unixepoch')) as month,
          COUNT(*) as count
        FROM ZSFNOTE 
        WHERE ZTRASHED = 0
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `);

      // Get top tags
      const topTags = await this.database.query<{ ZTITLE: string; count: number }>(`
        SELECT t.ZTITLE, COUNT(nt.Z_5NOTES) as count
        FROM ZSFNOTETAG t
        JOIN Z_5TAGS nt ON t.Z_PK = nt.Z_13TAGS
        JOIN ZSFNOTE n ON nt.Z_5NOTES = n.Z_PK AND n.ZTRASHED = 0
        GROUP BY t.Z_PK, t.ZTITLE
        ORDER BY count DESC
        LIMIT 10
      `);

      return {
        totalNotes: totalStats?.count || 0,
        averageLength: Math.round(totalStats?.avgLength || 0),
        longestNote: {
          title: longestNote?.ZTITLE || '',
          length: longestNote?.length || 0,
        },
        shortestNote: {
          title: shortestNote?.ZTITLE || '',
          length: shortestNote?.length || 0,
        },
        mostRecentNote: {
          title: mostRecentNote?.ZTITLE || '',
          date: mostRecentNote
            ? CoreDataUtils.toDate(mostRecentNote.ZMODIFICATIONDATE)
            : new Date(),
        },
        oldestNote: {
          title: oldestNote?.ZTITLE || '',
          date: oldestNote ? CoreDataUtils.toDate(oldestNote.ZCREATIONDATE) : new Date(),
        },
        notesPerMonth: monthlyStats.map(stat => ({
          month: stat.month,
          count: stat.count,
        })),
        topTags: topTags.map(tag => ({
          tag: tag.ZTITLE,
          count: tag.count,
        })),
        contentStats: {
          hasImages: contentStats?.hasImages || 0,
          hasFiles: contentStats?.hasFiles || 0,
          hasSourceCode: contentStats?.hasSourceCode || 0,
          hasTodos: contentStats?.todos || 0,
        },
      };
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Find related notes based on content similarity and shared tags
   */
  async getRelatedNotes(
    noteId: number,
    limit: number = 5
  ): Promise<{
    byTags: NoteWithTags[];
    byContent: NoteWithTags[];
  }> {
    await this.database.connect(true);

    try {
      // Get the source note's tags and content keywords
      const sourceNote = await this.getNoteById(noteId);
      if (!sourceNote) {
        return { byTags: [], byContent: [] };
      }

      // Find notes with shared tags
      const relatedByTags =
        sourceNote.tags.length > 0
          ? await this.database.query<BearNote & { tag_names: string; shared_tags: number }>(
              `
        SELECT n.*, GROUP_CONCAT(DISTINCT t.ZTITLE) as tag_names,
               COUNT(DISTINCT CASE WHEN t.ZTITLE IN (${sourceNote.tags.map(() => '?').join(',')}) THEN t.ZTITLE END) as shared_tags
        FROM ZSFNOTE n
        JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE n.Z_PK != ? AND n.ZTRASHED = 0
        GROUP BY n.Z_PK
        HAVING shared_tags > 0
        ORDER BY shared_tags DESC, n.ZMODIFICATIONDATE DESC
        LIMIT ?
      `,
              [...sourceNote.tags, noteId, limit]
            )
          : [];

      // Find notes with similar content (basic keyword matching)
      const contentKeywords = this.extractKeywords(sourceNote.ZTEXT || '');
      const relatedByContent =
        contentKeywords.length > 0
          ? await this.database.query<BearNote & { tag_names: string }>(
              `
        SELECT n.*, GROUP_CONCAT(DISTINCT t.ZTITLE) as tag_names
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE n.Z_PK != ? AND n.ZTRASHED = 0
          AND (${contentKeywords.map(() => 'n.ZTEXT LIKE ?').join(' OR ')})
        GROUP BY n.Z_PK
        ORDER BY n.ZMODIFICATIONDATE DESC
        LIMIT ?
      `,
              [noteId, ...contentKeywords.map(kw => `%${kw}%`), limit]
            )
          : [];

      return {
        byTags: relatedByTags.map(row => ({
          ...row,
          tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
        })),
        byContent: relatedByContent.map(row => ({
          ...row,
          tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
        })),
      };
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Extract keywords from text for content similarity matching
   */
  private extractKeywords(text: string): string[] {
    if (!text) {
      return [];
    }

    // Simple keyword extraction - remove common words and get significant terms
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'this',
      'that',
      'these',
      'those',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10); // Top 10 keywords
  }

  /**
   * Advanced full-text search with ranking and relevance scoring
   */
  async searchNotesFullText(
    query: string,
    options: {
      limit?: number;
      includeSnippets?: boolean;
      searchFields?: ('title' | 'content' | 'both')[];
      fuzzyMatch?: boolean;
      caseSensitive?: boolean;
      wholeWords?: boolean;
      includeArchived?: boolean;
      includeTrashed?: boolean;
      tags?: string[];
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<
    Array<
      NoteWithTags & {
        relevanceScore: number;
        matchedTerms: string[];
        snippets: string[];
        titleMatches: number;
        contentMatches: number;
      }
    >
  > {
    await this.database.connect(true);

    try {
      const searchTerms = this.extractSearchTerms(query, options.fuzzyMatch);
      const searchFields = options.searchFields || ['both'];

      let sql = `
        SELECT n.*, GROUP_CONCAT(DISTINCT t.ZTITLE) as tag_names,
               LENGTH(n.ZTEXT) as content_length
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE 1=1
      `;

      const params: SQLParameter[] = [];

      // Basic filters
      if (!options.includeTrashed) {
        sql += ' AND n.ZTRASHED = 0';
      }

      if (!options.includeArchived) {
        sql += ' AND n.ZARCHIVED = 0';
      }

      // Build search conditions
      const searchConditions: string[] = [];

      if (searchFields.includes('title') || searchFields.includes('both')) {
        const titleConditions = searchTerms.map(() =>
          options.caseSensitive ? 'n.ZTITLE LIKE ?' : 'LOWER(n.ZTITLE) LIKE LOWER(?)'
        );
        if (titleConditions.length > 0) {
          searchConditions.push(`(${titleConditions.join(' OR ')})`);
          searchTerms.forEach(term => params.push(term));
        }
      }

      if (searchFields.includes('content') || searchFields.includes('both')) {
        const contentConditions = searchTerms.map(() =>
          options.caseSensitive ? 'n.ZTEXT LIKE ?' : 'LOWER(n.ZTEXT) LIKE LOWER(?)'
        );
        if (contentConditions.length > 0) {
          searchConditions.push(`(${contentConditions.join(' OR ')})`);
          searchTerms.forEach(term => params.push(term));
        }
      }

      if (searchConditions.length > 0) {
        sql += ` AND (${searchConditions.join(' OR ')})`;
      }

      // Tag filters
      if (options.tags && options.tags.length > 0) {
        sql += ' GROUP BY n.Z_PK HAVING ';
        const tagConditions = options.tags.map(() => 'tag_names LIKE ?').join(' AND ');
        sql += tagConditions;
        options.tags.forEach(tag => params.push(tag));
      } else {
        sql += ' GROUP BY n.Z_PK';
      }

      // Date filters
      if (options.dateFrom) {
        sql += ' AND n.ZCREATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(options.dateFrom));
      }

      if (options.dateTo) {
        sql += ' AND n.ZCREATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(options.dateTo));
      }

      sql += ' ORDER BY n.ZMODIFICATIONDATE DESC';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = await this.database.query<
        BearNote & {
          tag_names: string;
          content_length: number;
        }
      >(sql, params);

      // Calculate relevance scores and extract snippets
      return rows
        .map(row => {
          const note = {
            ...row,
            tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
            contentLength: row.content_length,
          };

          const analysis = this.analyzeSearchMatches(note, searchTerms);

          return {
            ...note,
            relevanceScore: analysis.relevanceScore,
            matchedTerms: analysis.matchedTerms,
            snippets: options.includeSnippets ? analysis.snippets : [],
            titleMatches: analysis.titleMatches,
            contentMatches: analysis.contentMatches,
          };
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore);
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Search with auto-complete suggestions
   */
  async getSearchSuggestions(
    partialQuery: string,
    limit: number = 10
  ): Promise<{
    terms: string[];
    titles: string[];
    tags: string[];
  }> {
    await this.database.connect(true);

    try {
      const [termSuggestions, titleSuggestions, tagSuggestions] = await Promise.all([
        // Extract common words from content that start with the partial query
        this.database.query<{ term: string; frequency: number }>(
          `
          WITH RECURSIVE split(word, str) AS (
            SELECT '', LOWER(ZTEXT) || ' ' FROM ZSFNOTE WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
            UNION ALL
            SELECT substr(str, 0, instr(str, ' ')), 
                   substr(str, instr(str, ' ') + 1)
            FROM split WHERE str != ''
          )
          SELECT word as term, COUNT(*) as frequency
          FROM split 
          WHERE word LIKE ? AND LENGTH(word) > 2
          GROUP BY word
          ORDER BY frequency DESC
          LIMIT ?
        `,
          [`${partialQuery.toLowerCase()}%`, limit]
        ),

        // Find note titles that contain the partial query
        this.database.query<{ title: string }>(
          `
          SELECT DISTINCT ZTITLE as title
          FROM ZSFNOTE 
          WHERE ZTITLE LIKE ? AND ZTRASHED = 0 AND ZTITLE IS NOT NULL
          ORDER BY ZMODIFICATIONDATE DESC
          LIMIT ?
        `,
          [`%${partialQuery}%`, limit]
        ),

        // Find tags that start with the partial query
        this.database.query<{ tag: string }>(
          `
          SELECT DISTINCT ZTITLE as tag
          FROM ZSFNOTETAG 
          WHERE ZTITLE LIKE ?
          ORDER BY ZTITLE
          LIMIT ?
        `,
          [`${partialQuery}%`, limit]
        ),
      ]);

      return {
        terms: termSuggestions.map(s => s.term),
        titles: titleSuggestions.map(s => s.title),
        tags: tagSuggestions.map(s => s.tag),
      };
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Search for similar notes using content analysis
   */
  async findSimilarNotes(
    referenceText: string,
    options: {
      limit?: number;
      minSimilarity?: number;
      excludeNoteId?: number;
    } = {}
  ): Promise<Array<NoteWithTags & { similarityScore: number; commonKeywords: string[] }>> {
    await this.database.connect(true);

    try {
      const referenceKeywords = this.extractKeywords(referenceText);
      if (referenceKeywords.length === 0) {
        return [];
      }

      let sql = `
        SELECT n.*, GROUP_CONCAT(DISTINCT t.ZTITLE) as tag_names,
               LENGTH(n.ZTEXT) as content_length
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        WHERE n.ZTRASHED = 0 AND n.ZTEXT IS NOT NULL
      `;

      const params: SQLParameter[] = [];

      if (options.excludeNoteId) {
        sql += ' AND n.Z_PK != ?';
        params.push(options.excludeNoteId);
      }

      // Add keyword matching conditions
      const keywordConditions = referenceKeywords
        .map(() => 'LOWER(n.ZTEXT) LIKE LOWER(?)')
        .join(' OR ');
      sql += ` AND (${keywordConditions})`;
      referenceKeywords.forEach(keyword => params.push(keyword));

      sql += ' GROUP BY n.Z_PK ORDER BY n.ZMODIFICATIONDATE DESC';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit * 3); // Get more results for similarity filtering
      }

      const rows = await this.database.query<
        BearNote & {
          tag_names: string;
          content_length: number;
        }
      >(sql, params);

      // Calculate similarity scores
      const results = rows
        .map(row => {
          const note = {
            ...row,
            tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
            contentLength: row.content_length,
          };

          const noteKeywords = this.extractKeywords(note.ZTEXT || '');
          const commonKeywords = referenceKeywords.filter(kw =>
            noteKeywords.some(nkw => nkw.includes(kw) || kw.includes(nkw))
          );

          const similarityScore =
            commonKeywords.length / Math.max(referenceKeywords.length, noteKeywords.length);

          return {
            ...note,
            similarityScore,
            commonKeywords,
          };
        })
        .filter(result => result.similarityScore >= (options.minSimilarity || 0.1))
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, options.limit || 10);

      return results;
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Extract search terms with optional fuzzy matching
   */
  private extractSearchTerms(query: string, fuzzyMatch: boolean = false): string[] {
    const terms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 1);

    if (fuzzyMatch) {
      // Add fuzzy variations (simple approach - could be enhanced with Levenshtein distance)
      const fuzzyTerms: string[] = [];
      terms.forEach(term => {
        fuzzyTerms.push(term);
        if (term.length > 3) {
          // Add terms with one character missing
          for (let i = 0; i < term.length; i++) {
            fuzzyTerms.push(term.substring(0, i) + term.substring(i + 1));
          }
        }
      });
      return [...new Set(fuzzyTerms)]; // Remove duplicates
    }

    return terms;
  }

  /**
   * Analyze search matches and calculate relevance
   */
  private analyzeSearchMatches(
    note: NoteWithTags,
    searchTerms: string[]
  ): {
    relevanceScore: number;
    matchedTerms: string[];
    snippets: string[];
    titleMatches: number;
    contentMatches: number;
  } {
    const title = note.ZTITLE?.toLowerCase() || '';
    const content = note.ZTEXT?.toLowerCase() || '';

    let titleMatches = 0;
    let contentMatches = 0;
    const matchedTerms: string[] = [];
    const snippets: string[] = [];

    searchTerms.forEach(term => {
      const termLower = term.toLowerCase();

      // Count title matches
      const titleMatchCount = (title.match(new RegExp(termLower, 'g')) || []).length;
      if (titleMatchCount > 0) {
        titleMatches += titleMatchCount;
        matchedTerms.push(term);
      }

      // Count content matches and extract snippets
      const contentMatchCount = (content.match(new RegExp(termLower, 'g')) || []).length;
      if (contentMatchCount > 0) {
        contentMatches += contentMatchCount;
        if (!matchedTerms.includes(term)) {
          matchedTerms.push(term);
        }

        // Extract snippet around the match
        const matchIndex = content.indexOf(termLower);
        if (matchIndex !== -1 && snippets.length < 3) {
          const start = Math.max(0, matchIndex - 50);
          const end = Math.min(content.length, matchIndex + 100);
          const snippet = content.substring(start, end);
          snippets.push(`...${snippet}...`);
        }
      }
    });

    // Calculate relevance score
    let relevanceScore = 0;

    // Title matches are weighted more heavily
    relevanceScore += titleMatches * 10;

    // Content matches
    relevanceScore += contentMatches * 2;

    // Boost for exact phrase matches
    const queryLower = searchTerms.join(' ').toLowerCase();
    if (title.includes(queryLower)) {
      relevanceScore += 20;
    }
    if (content.includes(queryLower)) {
      relevanceScore += 5;
    }

    // Boost for tag matches
    const tagMatches = note.tags.filter(tag =>
      searchTerms.some(term => tag.toLowerCase().includes(term.toLowerCase()))
    ).length;
    relevanceScore += tagMatches * 15;

    // Normalize by content length (favor shorter, more focused content)
    if (note.contentLength && note.contentLength > 0) {
      relevanceScore = relevanceScore / Math.log(note.contentLength + 1);
    }

    return {
      relevanceScore,
      matchedTerms,
      snippets,
      titleMatches,
      contentMatches,
    };
  }

  /**
   * Get comprehensive file attachment information
   */
  async getFileAttachments(
    options: {
      noteId?: number;
      fileType?: string;
      includeMetadata?: boolean;
      limit?: number;
    } = {}
  ): Promise<{
    totalAttachments: number;
    attachments: Array<{
      id: number;
      filename: string;
      fileType: string;
      fileSize: number;
      createdAt: Date;
      modifiedAt: Date;
      noteId: number;
      noteTitle: string;
      filePath: string;
      contentType: string;
      metadata?: FileMetadata;
    }>;
    attachmentsByType: Array<{ type: string; count: number; totalSize: number }>;
  }> {
    await this.database.connect(true);

    try {
      let sql = `
        SELECT f.*, n.ZTITLE as note_title, n.Z_PK as note_id
        FROM ZSFNOTEFILE f
        INNER JOIN ZSFNOTE n ON f.ZNOTE = n.Z_PK
        WHERE n.ZTRASHED = 0
      `;

      const params: SQLParameter[] = [];

      if (options.noteId) {
        sql += ' AND f.ZNOTE = ?';
        params.push(options.noteId);
      }

      if (options.fileType) {
        sql += ' AND LOWER(f.ZFILENAME) LIKE LOWER(?)';
        params.push(`%.${options.fileType}`);
      }

      sql += ' ORDER BY f.ZCREATIONDATE DESC';

      if (options.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      const files = await this.database.query<DatabaseFileWithNote>(sql, params);

      // Get attachment statistics by type
      const typeStats = await this.database.query<{
        type: string;
        count: number;
        total_size: number;
      }>(`
        SELECT 
          CASE 
            WHEN LOWER(f.ZFILENAME) LIKE '%.jpg' OR LOWER(f.ZFILENAME) LIKE '%.jpeg' OR 
                 LOWER(f.ZFILENAME) LIKE '%.png' OR LOWER(f.ZFILENAME) LIKE '%.gif' OR
                 LOWER(f.ZFILENAME) LIKE '%.webp' THEN 'image'
            WHEN LOWER(f.ZFILENAME) LIKE '%.pdf' THEN 'pdf'
            WHEN LOWER(f.ZFILENAME) LIKE '%.doc' OR LOWER(f.ZFILENAME) LIKE '%.docx' OR
                 LOWER(f.ZFILENAME) LIKE '%.txt' OR LOWER(f.ZFILENAME) LIKE '%.md' THEN 'document'
            WHEN LOWER(f.ZFILENAME) LIKE '%.mp4' OR LOWER(f.ZFILENAME) LIKE '%.mov' OR
                 LOWER(f.ZFILENAME) LIKE '%.avi' THEN 'video'
            WHEN LOWER(f.ZFILENAME) LIKE '%.mp3' OR LOWER(f.ZFILENAME) LIKE '%.wav' OR
                 LOWER(f.ZFILENAME) LIKE '%.m4a' THEN 'audio'
            ELSE 'other'
          END as type,
          COUNT(*) as count,
          COALESCE(SUM(f.ZFILESIZE), 0) as total_size
        FROM ZSFNOTEFILE f
        INNER JOIN ZSFNOTE n ON f.ZNOTE = n.Z_PK
        WHERE n.ZTRASHED = 0
        GROUP BY type
        ORDER BY count DESC
      `);

      const attachments = files.map((file: DatabaseFileWithNote) => {
        const filename = file.ZFILENAME || 'unknown';
        const extension = filename.split('.').pop()?.toLowerCase() || '';

        let contentType = 'application/octet-stream';
        let fileType = 'other';

        // Determine content type and file type
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
          contentType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
          fileType = 'image';
        } else if (extension === 'pdf') {
          contentType = 'application/pdf';
          fileType = 'pdf';
        } else if (['doc', 'docx'].includes(extension)) {
          contentType = 'application/msword';
          fileType = 'document';
        } else if (['txt', 'md'].includes(extension)) {
          contentType = 'text/plain';
          fileType = 'document';
        } else if (['mp4', 'mov', 'avi'].includes(extension)) {
          contentType = `video/${extension}`;
          fileType = 'video';
        } else if (['mp3', 'wav', 'm4a'].includes(extension)) {
          contentType = `audio/${extension}`;
          fileType = 'audio';
        }

        return {
          id: file.Z_PK,
          filename,
          fileType,
          fileSize: file.ZFILESIZE || 0,
          createdAt: CoreDataUtils.toDate(file.ZCREATIONDATE),
          modifiedAt: CoreDataUtils.toDate(file.ZMODIFICATIONDATE),
          noteId: file.note_id,
          noteTitle: file.note_title || 'Untitled',
          filePath: file.ZFILEPATH || '',
          contentType,
          metadata: options.includeMetadata ? this.extractFileMetadata(file) : undefined,
        };
      });

      return {
        totalAttachments: files.length,
        attachments,
        attachmentsByType: typeStats.map(stat => ({
          type: stat.type,
          count: stat.count,
          totalSize: stat.total_size,
        })),
      };
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Analyze note metadata and content patterns
   */
  async analyzeNoteMetadata(
    options: {
      includeContentAnalysis?: boolean;
      includeLinkAnalysis?: boolean;
      includeStructureAnalysis?: boolean;
    } = {}
  ): Promise<{
    overview: {
      totalNotes: number;
      averageLength: number;
      lengthDistribution: Array<{ range: string; count: number }>;
      creationPatterns: Array<{ hour: number; count: number }>;
      modificationPatterns: Array<{ hour: number; count: number }>;
    };
    contentAnalysis?: ContentAnalysis;
    linkAnalysis?: LinkAnalysis;
    structureAnalysis?: StructureAnalysis;
  }> {
    await this.database.connect(true);

    try {
      // Basic overview
      const [overview] = await this.database.query<{
        total_notes: number;
        avg_length: number;
      }>(`
        SELECT 
          COUNT(*) as total_notes,
          AVG(LENGTH(ZTEXT)) as avg_length
        FROM ZSFNOTE 
        WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
      `);

      // Length distribution
      const lengthDistribution = await this.database.query<{
        range: string;
        count: number;
      }>(`
        SELECT 
          CASE 
            WHEN LENGTH(ZTEXT) < 100 THEN '0-100'
            WHEN LENGTH(ZTEXT) < 500 THEN '100-500'
            WHEN LENGTH(ZTEXT) < 1000 THEN '500-1K'
            WHEN LENGTH(ZTEXT) < 5000 THEN '1K-5K'
            WHEN LENGTH(ZTEXT) < 10000 THEN '5K-10K'
            ELSE '10K+'
          END as range,
          COUNT(*) as count
        FROM ZSFNOTE 
        WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
        GROUP BY range
        ORDER BY 
          CASE range
            WHEN '0-100' THEN 1
            WHEN '100-500' THEN 2
            WHEN '500-1K' THEN 3
            WHEN '1K-5K' THEN 4
            WHEN '5K-10K' THEN 5
            ELSE 6
          END
      `);

      // Creation and modification patterns by hour
      const creationPatterns = await this.database.query<{
        hour: number;
        count: number;
      }>(`
        SELECT 
          CAST(strftime('%H', datetime(ZCREATIONDATE + 978307200, 'unixepoch', 'localtime')) AS INTEGER) as hour,
          COUNT(*) as count
        FROM ZSFNOTE 
        WHERE ZTRASHED = 0
        GROUP BY hour
        ORDER BY hour
      `);

      const modificationPatterns = await this.database.query<{
        hour: number;
        count: number;
      }>(`
        SELECT 
          CAST(strftime('%H', datetime(ZMODIFICATIONDATE + 978307200, 'unixepoch', 'localtime')) AS INTEGER) as hour,
          COUNT(*) as count
        FROM ZSFNOTE 
        WHERE ZTRASHED = 0
        GROUP BY hour
        ORDER BY hour
      `);

      const result: {
        overview: {
          totalNotes: number;
          averageLength: number;
          lengthDistribution: Array<{ range: string; count: number }>;
          creationPatterns: Array<{ hour: number; count: number }>;
          modificationPatterns: Array<{ hour: number; count: number }>;
        };
        contentAnalysis?: ContentAnalysis;
        linkAnalysis?: LinkAnalysis;
        structureAnalysis?: StructureAnalysis;
      } = {
        overview: {
          totalNotes: overview.total_notes,
          averageLength: Math.round(overview.avg_length || 0),
          lengthDistribution,
          creationPatterns,
          modificationPatterns,
        },
      };

      // Content analysis
      if (options.includeContentAnalysis) {
        const notes = await this.database.query<{ text: string }>(`
          SELECT ZTEXT as text FROM ZSFNOTE 
          WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
          LIMIT 1000
        `);

        const contentAnalysis = this.analyzeContent(notes.map(n => n.text));
        result.contentAnalysis = contentAnalysis;
      }

      // Link analysis
      if (options.includeLinkAnalysis) {
        const notes = await this.database.query<{ text: string }>(`
          SELECT ZTEXT as text FROM ZSFNOTE 
          WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
          AND (ZTEXT LIKE '%http%' OR ZTEXT LIKE '%www.%' OR ZTEXT LIKE '%[%](%')
          LIMIT 1000
        `);

        const linkAnalysis = this.analyzeLinks(notes.map(n => n.text));
        result.linkAnalysis = linkAnalysis;
      }

      // Structure analysis
      if (options.includeStructureAnalysis) {
        const notes = await this.database.query<{ title: string; text: string }>(`
          SELECT ZTITLE as title, ZTEXT as text FROM ZSFNOTE 
          WHERE ZTRASHED = 0 AND ZTEXT IS NOT NULL
          LIMIT 1000
        `);

        const structureAnalysis = this.analyzeStructure(notes);
        result.structureAnalysis = structureAnalysis;
      }

      return result;
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Get notes with specific metadata characteristics
   */
  async getNotesWithMetadata(criteria: {
    hasAttachments?: boolean;
    hasLinks?: boolean;
    hasImages?: boolean;
    hasTodos?: boolean;
    hasCodeBlocks?: boolean;
    hasTables?: boolean;
    minWordCount?: number;
    maxWordCount?: number;
    createdAfter?: Date;
    createdBefore?: Date;
    modifiedAfter?: Date;
    modifiedBefore?: Date;
    limit?: number;
  }): Promise<
    Array<
      NoteWithTags & {
        wordCount: number;
        attachmentCount: number;
        linkCount: number;
        imageCount: number;
        todoCount: number;
        codeBlockCount: number;
        tableCount: number;
        metadata: {
          hasAttachments: boolean;
          hasLinks: boolean;
          hasImages: boolean;
          hasTodos: boolean;
          hasCodeBlocks: boolean;
          hasTables: boolean;
        };
      }
    >
  > {
    await this.database.connect(true);

    try {
      let sql = `
        SELECT n.*, 
               GROUP_CONCAT(DISTINCT t.ZTITLE) as tag_names,
               COUNT(DISTINCT f.Z_PK) as attachment_count
        FROM ZSFNOTE n
        LEFT JOIN Z_5TAGS nt ON n.Z_PK = nt.Z_5NOTES
        LEFT JOIN ZSFNOTETAG t ON nt.Z_13TAGS = t.Z_PK
        LEFT JOIN ZSFNOTEFILE f ON n.Z_PK = f.ZNOTE
        WHERE n.ZTRASHED = 0
      `;

      const params: SQLParameter[] = [];

      // Date filters
      if (criteria.createdAfter) {
        sql += ' AND n.ZCREATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(criteria.createdAfter));
      }

      if (criteria.createdBefore) {
        sql += ' AND n.ZCREATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(criteria.createdBefore));
      }

      if (criteria.modifiedAfter) {
        sql += ' AND n.ZMODIFICATIONDATE >= ?';
        params.push(CoreDataUtils.fromDate(criteria.modifiedAfter));
      }

      if (criteria.modifiedBefore) {
        sql += ' AND n.ZMODIFICATIONDATE <= ?';
        params.push(CoreDataUtils.fromDate(criteria.modifiedBefore));
      }

      // Attachment filter
      if (criteria.hasAttachments === true) {
        sql += ' AND f.Z_PK IS NOT NULL';
      } else if (criteria.hasAttachments === false) {
        sql += ' AND f.Z_PK IS NULL';
      }

      sql += ' GROUP BY n.Z_PK ORDER BY n.ZMODIFICATIONDATE DESC';

      if (criteria.limit) {
        sql += ' LIMIT ?';
        params.push(criteria.limit);
      }

      const rows = await this.database.query<
        BearNote & {
          tag_names: string;
          attachment_count: number;
        }
      >(sql, params);

      // Analyze content for each note
      const results = rows
        .map(row => {
          const note = {
            ...row,
            tags: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [],
          };

          const content = note.ZTEXT || '';

          // Count various content elements
          const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
          const linkCount = (content.match(/https?:\/\/[^\s)]+/g) || []).length;
          const imageCount = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
          const todoCount = (content.match(/- \[[ x]\]/g) || []).length;
          const codeBlockCount = (content.match(/```/g) || []).length / 2;
          const tableCount = (content.match(/\|.*\|/g) || []).length;

          // Apply content-based filters
          if (criteria.minWordCount && wordCount < criteria.minWordCount) {
            return null;
          }
          if (criteria.maxWordCount && wordCount > criteria.maxWordCount) {
            return null;
          }
          if (criteria.hasLinks === true && linkCount === 0) {
            return null;
          }
          if (criteria.hasLinks === false && linkCount > 0) {
            return null;
          }
          if (criteria.hasImages === true && imageCount === 0) {
            return null;
          }
          if (criteria.hasImages === false && imageCount > 0) {
            return null;
          }
          if (criteria.hasTodos === true && todoCount === 0) {
            return null;
          }
          if (criteria.hasTodos === false && todoCount > 0) {
            return null;
          }
          if (criteria.hasCodeBlocks === true && codeBlockCount === 0) {
            return null;
          }
          if (criteria.hasCodeBlocks === false && codeBlockCount > 0) {
            return null;
          }
          if (criteria.hasTables === true && tableCount === 0) {
            return null;
          }
          if (criteria.hasTables === false && tableCount > 0) {
            return null;
          }

          return {
            ...note,
            wordCount,
            attachmentCount: row.attachment_count,
            linkCount,
            imageCount,
            todoCount,
            codeBlockCount,
            tableCount,
            metadata: {
              hasAttachments: row.attachment_count > 0,
              hasLinks: linkCount > 0,
              hasImages: imageCount > 0,
              hasTodos: todoCount > 0,
              hasCodeBlocks: codeBlockCount > 0,
              hasTables: tableCount > 0,
            },
          };
        })
        .filter(Boolean) as Array<
        NoteWithTags & {
          wordCount: number;
          attachmentCount: number;
          linkCount: number;
          imageCount: number;
          todoCount: number;
          codeBlockCount: number;
          tableCount: number;
          metadata: {
            hasAttachments: boolean;
            hasLinks: boolean;
            hasImages: boolean;
            hasTodos: boolean;
            hasCodeBlocks: boolean;
            hasTables: boolean;
          };
        }
      >;

      return results;
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Extract file metadata from database record
   */
  private extractFileMetadata(file: DatabaseFileRecord): FileMetadata {
    return {
      creationDate: CoreDataUtils.toDate(file.ZCREATIONDATE),
      modificationDate: CoreDataUtils.toDate(file.ZMODIFICATIONDATE),
      fileSize: file.ZFILESIZE || 0,
      filePath: file.ZFILEPATH || '',
      originalFilename: file.ZFILENAME || '',
      // Add more metadata fields as available in the database
    };
  }

  /**
   * Analyze content patterns in notes
   */
  private analyzeContent(texts: string[]): ContentAnalysis {
    const analysis = {
      markdownUsage: {
        headings: 0,
        lists: 0,
        codeBlocks: 0,
        links: 0,
        images: 0,
        tables: 0,
      },
      languagePatterns: [] as Array<{ language: string; count: number }>,
      commonPatterns: [] as Array<{ pattern: string; description: string; count: number }>,
    };

    const languageMap = new Map<string, number>();
    const patternCounts = {
      emails: 0,
      urls: 0,
      phoneNumbers: 0,
      dates: 0,
      times: 0,
      hashtags: 0,
    };

    texts.forEach(text => {
      // Markdown usage
      analysis.markdownUsage.headings += (text.match(/^#+\s/gm) || []).length;
      analysis.markdownUsage.lists += (text.match(/^[\s]*[-*+]\s/gm) || []).length;
      analysis.markdownUsage.codeBlocks += (text.match(/```/g) || []).length / 2;
      analysis.markdownUsage.links += (text.match(/\[.*?\]\(.*?\)/g) || []).length;
      analysis.markdownUsage.images += (text.match(/!\[.*?\]\(.*?\)/g) || []).length;
      analysis.markdownUsage.tables += (text.match(/\|.*\|/g) || []).length;

      // Language detection (basic)
      const codeBlocks = text.match(/```(\w+)?\n([\s\S]*?)```/g) || [];
      codeBlocks.forEach(block => {
        const match = block.match(/```(\w+)/);
        if (match && match[1]) {
          const lang = match[1].toLowerCase();
          languageMap.set(lang, (languageMap.get(lang) || 0) + 1);
        }
      });

      // Common patterns
      patternCounts.emails += (
        text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g) || []
      ).length;
      patternCounts.urls += (text.match(/https?:\/\/[^\s)]+/g) || []).length;
      patternCounts.phoneNumbers += (text.match(/\b\d{3}[.-]?\d{3}[.-]?\d{4}\b/g) || []).length;
      patternCounts.dates += (text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || []).length;
      patternCounts.times += (
        text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?\b/g) || []
      ).length;
      patternCounts.hashtags += (text.match(/#\w+/g) || []).length;
    });

    analysis.languagePatterns = Array.from(languageMap.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    analysis.commonPatterns = [
      { pattern: 'emails', description: 'Email addresses', count: patternCounts.emails },
      { pattern: 'urls', description: 'Web URLs', count: patternCounts.urls },
      { pattern: 'phoneNumbers', description: 'Phone numbers', count: patternCounts.phoneNumbers },
      { pattern: 'dates', description: 'Date patterns', count: patternCounts.dates },
      { pattern: 'times', description: 'Time patterns', count: patternCounts.times },
      { pattern: 'hashtags', description: 'Hashtags', count: patternCounts.hashtags },
    ]
      .filter(p => p.count > 0)
      .sort((a, b) => b.count - a.count);

    return analysis;
  }

  /**
   * Analyze links in notes
   */
  private analyzeLinks(texts: string[]): LinkAnalysis {
    const analysis = {
      internalLinks: 0,
      externalLinks: 0,
      brokenLinks: 0,
      topDomains: [] as Array<{ domain: string; count: number }>,
      linkTypes: [] as Array<{ type: string; count: number }>,
    };

    const domainMap = new Map<string, number>();
    const typeMap = new Map<string, number>();

    texts.forEach(text => {
      // Extract all URLs
      const urls = text.match(/https?:\/\/[^\s)\]]+/g) || [];

      urls.forEach(url => {
        try {
          const urlObj = new URL(url);
          const domain = urlObj.hostname;

          domainMap.set(domain, (domainMap.get(domain) || 0) + 1);

          // Categorize link types
          if (domain.includes('github.com')) {
            typeMap.set('GitHub', (typeMap.get('GitHub') || 0) + 1);
          } else if (domain.includes('stackoverflow.com')) {
            typeMap.set('Stack Overflow', (typeMap.get('Stack Overflow') || 0) + 1);
          } else if (domain.includes('wikipedia.org')) {
            typeMap.set('Wikipedia', (typeMap.get('Wikipedia') || 0) + 1);
          } else if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
            typeMap.set('YouTube', (typeMap.get('YouTube') || 0) + 1);
          } else if (domain.includes('medium.com')) {
            typeMap.set('Medium', (typeMap.get('Medium') || 0) + 1);
          } else {
            typeMap.set('Other', (typeMap.get('Other') || 0) + 1);
          }

          analysis.externalLinks++;
        } catch {
          analysis.brokenLinks++;
        }
      });

      // Bear internal links (bear:// protocol or [[Note Title]] format)
      const internalLinks =
        text.match(/(?:bear:\/\/|x-callback-url:\/\/bear|bear-callback:\/\/|\[\[.*?\]\])/g) || [];
      analysis.internalLinks += internalLinks.length;
    });

    analysis.topDomains = Array.from(domainMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    analysis.linkTypes = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    return analysis;
  }

  /**
   * Analyze note structure patterns
   */
  private analyzeStructure(notes: Array<{ title: string; text: string }>): StructureAnalysis {
    const analysis = {
      titlePatterns: [] as Array<{ pattern: string; count: number; examples: string[] }>,
      averageWordsPerNote: 0,
      averageParagraphsPerNote: 0,
      notesWithTodos: 0,
      notesWithDates: 0,
      notesWithNumbers: 0,
    };

    const titlePatternMap = new Map<string, { count: number; examples: string[] }>();
    let totalWords = 0;
    let totalParagraphs = 0;

    notes.forEach(note => {
      const { title, text } = note;

      // Analyze title patterns
      if (title) {
        const patterns = this.extractTitlePatterns(title);
        patterns.forEach(pattern => {
          if (!titlePatternMap.has(pattern)) {
            titlePatternMap.set(pattern, { count: 0, examples: [] });
          }
          const entry = titlePatternMap.get(pattern)!;
          entry.count++;
          if (entry.examples.length < 3) {
            entry.examples.push(title);
          }
        });
      }

      // Count words and paragraphs
      const words = text.split(/\s+/).filter(word => word.length > 0);
      totalWords += words.length;

      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      totalParagraphs += paragraphs.length;

      // Check for specific content types
      if (text.match(/- \[[ x]\]/)) {
        analysis.notesWithTodos++;
      }
      if (text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)) {
        analysis.notesWithDates++;
      }
      if (text.match(/\b\d+\b/)) {
        analysis.notesWithNumbers++;
      }
    });

    analysis.titlePatterns = Array.from(titlePatternMap.entries())
      .map(([pattern, data]) => ({ pattern, count: data.count, examples: data.examples }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    analysis.averageWordsPerNote = Math.round(totalWords / notes.length);
    analysis.averageParagraphsPerNote = Math.round((totalParagraphs / notes.length) * 100) / 100;

    return analysis;
  }

  /**
   * Extract patterns from note titles
   */
  private extractTitlePatterns(title: string): string[] {
    const patterns: string[] = [];

    // Date patterns
    if (title.match(/\d{4}-\d{2}-\d{2}/)) {
      patterns.push('ISO Date (YYYY-MM-DD)');
    }
    if (title.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
      patterns.push('US Date (MM/DD/YYYY)');
    }
    if (title.match(/\d{1,2}-\d{1,2}-\d{2,4}/)) {
      patterns.push('Dash Date (MM-DD-YYYY)');
    }

    // Meeting patterns
    if (title.toLowerCase().includes('meeting')) {
      patterns.push('Meeting Notes');
    }
    if (title.toLowerCase().includes('standup')) {
      patterns.push('Standup Notes');
    }
    if (title.toLowerCase().includes('interview')) {
      patterns.push('Interview Notes');
    }

    // Project patterns
    if (title.toLowerCase().includes('project')) {
      patterns.push('Project Notes');
    }
    if (title.toLowerCase().includes('todo') || title.toLowerCase().includes('task')) {
      patterns.push('Task Lists');
    }

    // Learning patterns
    if (title.toLowerCase().includes('notes on') || title.toLowerCase().includes('learning')) {
      patterns.push('Learning Notes');
    }
    if (title.toLowerCase().includes('tutorial') || title.toLowerCase().includes('guide')) {
      patterns.push('Tutorials/Guides');
    }

    // Question patterns
    if (title.startsWith('How to') || title.startsWith('Why') || title.startsWith('What')) {
      patterns.push('Question Format');
    }

    // Number patterns
    if (title.match(/^\d+\.?\s/)) {
      patterns.push('Numbered Title');
    }

    // Capitalization patterns
    if (title === title.toUpperCase()) {
      patterns.push('ALL CAPS');
    }
    if (title.split(' ').every(word => word[0] === word[0].toUpperCase())) {
      patterns.push('Title Case');
    }

    return patterns.length > 0 ? patterns : ['No Pattern'];
  }

  /**
   * Create a new note with title, content, and tags
   * Note: Bear automatically extracts the title from the first line of content (markdown header).
   * We don't set ZTITLE directly to avoid inconsistencies between database and Bear's display.
   */
  async createNote(options: {
    title: string;
    content?: string;
    tags?: string[];
    isArchived?: boolean;
    isPinned?: boolean;
  }): Promise<{ noteId: string; success: boolean; tagWarnings?: string[] }> {
    // Validate and sanitize tags first
    const tagValidation = this.validateAndSanitizeTags(options.tags || []);
    const sanitizedTags = tagValidation.sanitized;
    const tagWarnings = tagValidation.warnings;

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Build the content (tags will be handled via API parameter)
      let noteContent = '';

      // Add content only (no hashtags - API will handle tags)
      if (options.content) {
        noteContent = options.content;

        // CRITICAL FIX: Remove duplicate title headers from content
        // If content starts with a markdown header that matches the title, remove it
        const titleHeaderPattern = new RegExp(
          `^#\\s+${options.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`,
          'i'
        );
        if (titleHeaderPattern.test(noteContent)) {
          noteContent = noteContent.replace(titleHeaderPattern, '');
        }
      }

      // Create the Bear URL with proper encoding
      const encodedTitle = encodeURIComponent(options.title);
      const encodedContent = encodeURIComponent(noteContent);
      const encodedTags = encodeURIComponent(sanitizedTags.join(','));

      // Build Bear API URL
      let bearURL = `bear://x-callback-url/create?title=${encodedTitle}`;

      if (noteContent) {
        bearURL += `&text=${encodedContent}`;
      }

      if (sanitizedTags.length > 0) {
        bearURL += `&tags=${encodedTags}`;
      }

      if (options.isPinned) {
        bearURL += `&pin=yes`;
      }

      // Note: Bear API doesn't directly support creating archived notes
      // We'll create the note normally and archive it separately if needed

      // Execute the Bear API call
      await execAsync(`open "${bearURL}"`);

      // Wait for Bear to process the creation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // If the note should be archived, we'll need to find it and archive it
      // This is a limitation of Bear's current API
      const noteId = 'created-via-api'; // We can't get the actual ID from the create API

      if (options.isArchived) {
        // TODO: Implement archiving after creation once we can reliably find the new note
        // For now, we'll note this in the response
      }

      return {
        noteId,
        success: true,
        tagWarnings: tagWarnings.length > 0 ? tagWarnings : undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to create note via sync-safe Bear API: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update an existing note
   * Note: Title changes are handled by updating the content's first line (markdown header).
   * We clear ZTITLE so Bear will re-extract it from the updated content.
   */
  async updateNote(
    noteId: number,
    options: {
      title?: string;
      content?: string;
      tags?: string[];
      isArchived?: boolean;
      isPinned?: boolean;
      expectedModificationDate?: Date;
    }
  ): Promise<{ success: boolean; conflictDetected?: boolean; tagWarnings?: string[] }> {
    // Validate and sanitize tags if provided
    let sanitizedTags: string[] | undefined;
    let tagWarnings: string[] = [];

    if (options.tags !== undefined) {
      const tagValidation = this.validateAndSanitizeTags(options.tags);
      sanitizedTags = tagValidation.sanitized;
      tagWarnings = tagValidation.warnings;
    }

    try {
      // First, read the current note from database to get ZUNIQUEIDENTIFIER
      await this.database.connect(true); // Read mode

      const [currentNote] = await this.database.query<{
        ZUNIQUEIDENTIFIER: string;
        ZMODIFICATIONDATE: number;
        ZTITLE: string;
        ZTEXT: string;
      }>(
        `
        SELECT ZUNIQUEIDENTIFIER, ZMODIFICATIONDATE, ZTITLE, ZTEXT 
        FROM ZSFNOTE 
        WHERE Z_PK = ? AND ZTRASHED = 0
      `,
        [noteId]
      );

      if (!currentNote) {
        throw new Error(`Note with ID ${noteId} not found or is trashed`);
      }

      // Conflict detection
      if (options.expectedModificationDate) {
        const currentModDate = CoreDataUtils.toDate(currentNote.ZMODIFICATIONDATE);
        if (
          Math.abs(currentModDate.getTime() - options.expectedModificationDate.getTime()) > 1000
        ) {
          return {
            success: false,
            conflictDetected: true,
            tagWarnings: tagWarnings.length > 0 ? tagWarnings : undefined,
          };
        }
      }

      await this.database.disconnect();

      // Use Bear API for sync-safe updates
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Build the new content
      let noteContent = '';

      // Handle title and content updates
      if (options.title !== undefined || options.content !== undefined) {
        if (options.content !== undefined) {
          noteContent = options.content;

          // CRITICAL FIX: Remove duplicate title headers from content during updates
          // This prevents duplicate titles when Claude sends content with markdown headers
          const titleToCheck = options.title !== undefined ? options.title : currentNote.ZTITLE;
          if (titleToCheck) {
            const titleHeaderPattern = new RegExp(
              `^#\\s+${titleToCheck.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`,
              'i'
            );
            if (titleHeaderPattern.test(noteContent)) {
              noteContent = noteContent.replace(titleHeaderPattern, '');
            }
          }
        } else {
          // If only title is being updated, preserve existing content (minus old title)
          const existingContent = currentNote.ZTEXT || '';
          const contentWithoutTitle = existingContent.replace(/^# .+?\n\n?/m, '');
          noteContent = contentWithoutTitle;
        }
      } else {
        // No content/title updates, preserve existing content
        noteContent = currentNote.ZTEXT || '';

        // CRITICAL FIX: Even for tags-only updates, remove duplicate title headers
        // This prevents duplicate titles when Claude adds tags to notes with existing headers
        if (currentNote.ZTITLE) {
          const titleHeaderPattern = new RegExp(
            `^#\\s+${currentNote.ZTITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`,
            'i'
          );
          if (titleHeaderPattern.test(noteContent)) {
            noteContent = noteContent.replace(titleHeaderPattern, '');
          }
        }
      }

      // Note: Tags will be handled via API parameter, not embedded in content

      // Create the Bear URL with proper encoding
      const encodedId = encodeURIComponent(currentNote.ZUNIQUEIDENTIFIER);
      const encodedContent = encodeURIComponent(noteContent);

      // Build Bear API URL for updating
      let bearURL = `bear://x-callback-url/add-text?id=${encodedId}&mode=replace&text=${encodedContent}`;

      if (options.title !== undefined) {
        const encodedTitle = encodeURIComponent(options.title);
        bearURL += `&title=${encodedTitle}`;
      }

      if (sanitizedTags !== undefined && sanitizedTags.length > 0) {
        const encodedTags = encodeURIComponent(sanitizedTags.join(','));
        bearURL += `&tags=${encodedTags}`;
      }

      if (options.isPinned !== undefined) {
        bearURL += `&pin=${options.isPinned ? 'yes' : 'no'}`;
      }

      // Note: Bear API doesn't directly support archiving in add-text
      // We'll handle archiving separately if needed

      // Execute the Bear API call
      await execAsync(`open "${bearURL}"`);

      // Wait for Bear to process the update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Handle archiving separately if needed (limitation of Bear API)
      if (options.isArchived !== undefined) {
        // TODO: Implement archiving via separate API call once available
      }

      return {
        success: true,
        tagWarnings: tagWarnings.length > 0 ? tagWarnings : undefined,
      };
    } catch (error) {
      await this.database.disconnect();
      throw new Error(
        `Failed to update note via sync-safe Bear API: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Duplicate an existing note
   */
  async duplicateNote(
    noteId: number,
    options: {
      titleSuffix?: string;
      copyTags?: boolean;
    } = {}
  ): Promise<{ newNoteId: string; success: boolean }> {
    await this.database.connect(true); // Read mode first

    try {
      // Get the source note
      const [sourceNote] = await this.database.query<BearNote>(
        `
        SELECT * FROM ZSFNOTE WHERE Z_PK = ? AND ZTRASHED = 0
      `,
        [noteId]
      );

      if (!sourceNote) {
        throw new Error(`Note with ID ${noteId} not found or is trashed`);
      }

      // Get tags if copying them
      let tags: string[] = [];
      if (options.copyTags !== false) {
        const tagResults = await this.database.query<{ ZTITLE: string }>(
          `
          SELECT t.ZTITLE
          FROM ZSFNOTETAG t
          INNER JOIN Z_5TAGS nt ON t.Z_PK = nt.Z_13TAGS
          WHERE nt.Z_5NOTES = ?
        `,
          [noteId]
        );
        tags = tagResults.map(t => t.ZTITLE);
      }

      await this.database.disconnect();

      // Create the duplicate note
      const newTitle = sourceNote.ZTITLE + (options.titleSuffix || ' (Copy)');

      const result = await this.createNote({
        title: newTitle,
        content: sourceNote.ZTEXT || '',
        tags,
        isArchived: sourceNote.ZARCHIVED === 1,
        isPinned: sourceNote.ZPINNED === 1,
      });

      return {
        newNoteId: result.noteId,
        success: result.success,
      };
    } catch (error) {
      await this.database.disconnect();
      throw new Error(
        `Failed to duplicate note: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Archive or unarchive a note using sync-safe Bear API
   */
  async archiveNote(noteId: number, archived: boolean): Promise<{ success: boolean }> {
    const result = await this.updateNote(noteId, {
      isArchived: archived,
    });

    return {
      success: result.success,
    };
  }

  /**
   * Generate a UUID for new notes (Bear format)
   */
  private generateUUID(): string {
    // Generate a UUID v4 format that Bear uses
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16).toUpperCase();
    });
  }

  /**
   * Clear Bear's Core Data cache to force sidebar refresh
   */
  private async clearBearCache(): Promise<void> {
    try {
      await this.database.query(`DELETE FROM Z_MODELCACHE`);
    } catch {
      // Cache clearing is optional - don't fail the operation if it doesn't work
      // Silent error handling to avoid JSON-RPC interference
    }
  }

  /**
   * Trigger Bear to reparse a note by simulating a content edit
   * This mimics the manual edit that makes Bear recognize hashtags
   */
  private async triggerBearReparse(noteId: number): Promise<void> {
    try {
      // Get current content
      const currentNote = await this.database.queryOne<{ ZTEXT: string }>(
        `
        SELECT ZTEXT FROM ZSFNOTE WHERE Z_PK = ?
      `,
        [noteId]
      );

      if (!currentNote) {
        return;
      }

      // Simulate a content edit by adding and removing a character
      // This mimics what happens when you type and delete in Bear
      const originalContent = currentNote.ZTEXT || '';
      const tempContent = `${originalContent} `; // Add a space

      // First update: add the space
      let now = CoreDataUtils.fromDate(new Date());
      await this.database.query(
        `
        UPDATE ZSFNOTE 
        SET ZTEXT = ?, ZMODIFICATIONDATE = ?, ZVERSION = COALESCE(ZVERSION, 0) + 1
        WHERE Z_PK = ?
      `,
        [tempContent, now, noteId]
      );

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 50));

      // Second update: remove the space (back to original)
      now = CoreDataUtils.fromDate(new Date());
      await this.database.query(
        `
        UPDATE ZSFNOTE 
        SET ZTEXT = ?, ZMODIFICATIONDATE = ?, ZVERSION = COALESCE(ZVERSION, 0) + 1
        WHERE Z_PK = ?
      `,
        [originalContent, now, noteId]
      );
    } catch {
      // Silent error handling to avoid JSON-RPC interference
    }
  }

  /**
   * Validate and sanitize tag names according to Bear's rules
   * Bear tag rules:
   * - No capital letters (converts to lowercase)
   * - No hyphens (removes them)
   * - No spaces (removes them)
   * - Underscores allowed (kept as-is)
   * - No commas (removes them)
   * - Forward slashes allowed for nested tags (e.g., project/alpha)
   * - Must not be empty after sanitization
   */
  private validateAndSanitizeTags(tags: string[]): {
    sanitized: string[];
    warnings: string[];
  } {
    const sanitized: string[] = [];
    const warnings: string[] = [];

    for (const originalTag of tags) {
      const trimmed = originalTag.trim();

      if (!trimmed) {
        warnings.push(`Empty tag ignored`);
        continue;
      }

      let sanitizedTag = trimmed;
      let hadChanges = false;

      // Convert to lowercase
      if (sanitizedTag !== sanitizedTag.toLowerCase()) {
        sanitizedTag = sanitizedTag.toLowerCase();
        hadChanges = true;
      }

      // Remove hyphens
      if (sanitizedTag.includes('-')) {
        sanitizedTag = sanitizedTag.replace(/-/g, '');
        hadChanges = true;
      }

      // Remove spaces
      if (sanitizedTag.includes(' ')) {
        sanitizedTag = sanitizedTag.replace(/\s+/g, '');
        hadChanges = true;
      }

      // Keep underscores (they are allowed in Bear tags)
      // No processing needed for underscores

      // Remove commas
      if (sanitizedTag.includes(',')) {
        sanitizedTag = sanitizedTag.replace(/,/g, '');
        hadChanges = true;
      }

      // Clean up multiple slashes and remove leading/trailing slashes
      sanitizedTag = sanitizedTag
        .replace(/\/+/g, '/') // Multiple slashes to single
        .replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes

      // Check if tag is still valid after sanitization
      if (!sanitizedTag) {
        warnings.push(`Tag "${originalTag}" became empty after sanitization and was ignored`);
        continue;
      }

      // Add to results
      sanitized.push(sanitizedTag);

      // Add warning if changes were made
      if (hadChanges) {
        warnings.push(`Tag "${originalTag}" was sanitized to "${sanitizedTag}"`);
      }
    }

    return { sanitized, warnings };
  }

  /**
   * Legacy method kept for backward compatibility
   * @deprecated Use validateAndSanitizeTags instead
   */
  private sanitizeTagName(tagName: string): string {
    const result = this.validateAndSanitizeTags([tagName]);
    return result.sanitized[0] || '';
  }

  /**
   * Most effective method to trigger Bear's hashtag parsing
   * Uses Bear's API to update the note with its own content, forcing a reparse
   */
  private async triggerBearParseEffectively(
    noteUUID: string,
    noteContent: string,
    noteTitle?: string
  ): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // CRITICAL FIX: Remove duplicate title headers before triggering reparse
      // This prevents duplicate titles when hashtag parsing updates notes with existing headers
      let processedContent = noteContent;
      if (noteTitle) {
        const titleHeaderPattern = new RegExp(
          `^#\\s+${noteTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`,
          'i'
        );
        if (titleHeaderPattern.test(processedContent)) {
          processedContent = processedContent.replace(titleHeaderPattern, '');
        }
      }

      // Use Bear's API to replace the note content with itself
      // This forces Bear to reparse all hashtags in the content
      const encodedContent = encodeURIComponent(processedContent);
      const bearURL = `bear://x-callback-url/add-text?id=${noteUUID}&mode=replace&text=${encodedContent}&show_window=no`;

      await execAsync(`open "${bearURL}"`);

      // Wait for Bear to process the update and reparse hashtags
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      throw new Error(
        `Failed to trigger effective Bear parsing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Public method to trigger hashtag parsing for a specific note
   * Can be called by MCP tools to help users fix sidebar display issues
   * Note: Bear must be running for this to work effectively
   */
  async triggerHashtagParsing(noteId?: string, noteTitle?: string): Promise<string> {
    if (!noteId && !noteTitle) {
      throw new Error('Either noteId or noteTitle is required');
    }

    // Check if Bear is running
    const isBearRunning = await this.isBearRunning();
    if (!isBearRunning) {
      return `Bear is not running. Please start Bear first, then the hashtags will be parsed automatically. Alternatively, restart Bear to trigger parsing for all notes.`;
    }

    try {
      await this.database.connect(true); // Read mode

      // Find the note
      let query: string;
      let params: SQLParameter[];

      if (noteId) {
        query =
          'SELECT Z_PK, ZUNIQUEIDENTIFIER, ZTITLE, ZTEXT FROM ZSFNOTE WHERE ZUNIQUEIDENTIFIER = ? AND ZTRASHED = 0';
        params = [noteId];
      } else if (noteTitle) {
        query =
          'SELECT Z_PK, ZUNIQUEIDENTIFIER, ZTITLE, ZTEXT FROM ZSFNOTE WHERE ZTITLE = ? AND ZTRASHED = 0';
        params = [noteTitle];
      } else {
        throw new Error('Either noteId or noteTitle is required');
      }

      const note = await this.database.queryOne<{
        Z_PK: number;
        ZUNIQUEIDENTIFIER: string;
        ZTITLE: string;
        ZTEXT: string;
      }>(query, params);

      if (!note) {
        throw new Error(`Note not found: ${noteId || noteTitle}`);
      }

      // Most effective approach: Use Bear's API to "update" the note with its own content
      // This forces Bear to reparse all hashtags in the content
      await this.triggerBearParseEffectively(note.ZUNIQUEIDENTIFIER, note.ZTEXT, note.ZTITLE);

      return `Hashtag parsing triggered for note: ${noteId || noteTitle}. Bear should update the sidebar within a few seconds.`;
    } catch (error) {
      throw new Error(
        `Failed to trigger hashtag parsing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await this.database.disconnect();
    }
  }

  /**
   * Create a note using Bear's x-callback-url API when Bear is running
   * This bypasses database writes and uses Bear's native API instead
   */
  async createNoteViaBearAPI(title: string, content: string, tags: string[]): Promise<string> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Validate and sanitize tags according to Bear's rules
      const tagValidation = this.validateAndSanitizeTags(tags);
      const sanitizedTags = tagValidation.sanitized;

      // Build the content with embedded hashtags in Bear format (no title header since Bear API handles title separately)
      const hashtagsLine = sanitizedTags.map(tag => `#${tag}`).join(' ');
      let bearContent = '';

      // Add hashtags line if there are tags
      if (hashtagsLine) {
        bearContent += `${hashtagsLine}\n\n`;
      }

      // Add the actual content
      if (content) {
        // CRITICAL FIX: Remove duplicate title headers from content
        // This prevents duplicate titles when content includes headers matching the title
        let processedContent = content;
        const titleHeaderPattern = new RegExp(
          `^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`,
          'i'
        );
        if (titleHeaderPattern.test(processedContent)) {
          processedContent = processedContent.replace(titleHeaderPattern, '');
        }
        bearContent += processedContent;
      }

      // Create the Bear URL with proper encoding
      const encodedTitle = encodeURIComponent(title);
      const encodedContent = encodeURIComponent(bearContent);
      const encodedTags = encodeURIComponent(sanitizedTags.join(','));

      const bearURL = `bear://x-callback-url/create?title=${encodedTitle}&text=${encodedContent}&tags=${encodedTags}&edit=yes&show_window=no`;

      // Creating note via Bear API (silent for JSON-RPC compatibility)
      await execAsync(`open "${bearURL}"`);

      // Wait for Bear to process the creation
      await new Promise(resolve => setTimeout(resolve, 1000));

      return `Note "${title}" created via Bear API with tags: ${sanitizedTags.join(', ')}`;
    } catch (error) {
      throw new Error(
        `Failed to create note via Bear API: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Batch trigger hashtag parsing for multiple notes
   * Useful for fixing sidebar display issues for many notes at once
   */
  async batchTriggerHashtagParsing(options: {
    tag_filter?: string;
    title_pattern?: string;
    limit?: number;
    created_after?: string;
  }): Promise<string> {
    try {
      await this.database.connect(true); // Read mode

      // Build query to find notes
      let query = 'SELECT Z_PK, ZUNIQUEIDENTIFIER, ZTITLE FROM ZSFNOTE WHERE ZTRASHED = 0';
      const params: SQLParameter[] = [];

      if (options.title_pattern) {
        query += ' AND ZTITLE LIKE ?';
        params.push(options.title_pattern);
      }

      if (options.created_after) {
        const date = new Date(options.created_after);
        query += ' AND ZCREATIONDATE > ?';
        params.push(CoreDataUtils.fromDate(date));
      }

      query += ' ORDER BY ZMODIFICATIONDATE DESC';

      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const notes = await this.database.query<{
        Z_PK: number;
        ZUNIQUEIDENTIFIER: string;
        ZTITLE: string;
      }>(query, params);

      if (notes.length === 0) {
        await this.database.disconnect();
        return 'No notes found matching the criteria';
      }

      // Process each note
      let successCount = 0;
      for (const note of notes) {
        try {
          // Get the full note content for effective parsing trigger
          const fullNote = await this.database.queryOne<{ ZTEXT: string }>(
            `
            SELECT ZTEXT FROM ZSFNOTE WHERE Z_PK = ?
          `,
            [note.Z_PK]
          );

          if (fullNote?.ZTEXT) {
            await this.triggerBearParseEffectively(
              note.ZUNIQUEIDENTIFIER,
              fullNote.ZTEXT,
              note.ZTITLE
            );
            successCount++;
          }

          // Small delay between notes to avoid overwhelming Bear
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch {
          // Silent error handling to avoid JSON-RPC interference
        }
      }

      await this.database.disconnect();

      return `Triggered hashtag parsing for ${successCount}/${notes.length} notes. Check Bear's sidebar in a few seconds.`;
    } catch (error) {
      throw new Error(
        `Failed to batch trigger hashtag parsing: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
