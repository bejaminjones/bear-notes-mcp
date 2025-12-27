#!/usr/bin/env node

/**
 * Bear MCP Server
 * Copyright (c) 2024 Bear MCP Server
 * MIT License - see LICENSE file for details
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { BearService } from './services/bear-service.js';

// Error types imported for potential use in error handling

// MCP tool argument interfaces
interface GetRecentNotesArgs {
  limit?: number;
}

interface SearchNotesArgs {
  query: string;
  limit?: number;
}

interface GetNoteByIdArgs {
  id: number;
}

interface GetNoteByTitleArgs {
  title: string;
}

interface GetNotesByTagArgs {
  tag: string;
}

interface GetAllTagsArgs {
  includeOrphanTags?: boolean;
}

interface GetNotesAdvancedArgs {
  query?: string;
  tags?: string[];
  excludeTags?: string[];
  dateFrom?: string;
  dateTo?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  includeContent?: boolean;
  includeTrashed?: boolean;
  includeArchived?: boolean;
  includeEncrypted?: boolean;
  sortBy?: 'created' | 'modified' | 'title' | 'size';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface GetNotesWithCriteriaArgs {
  titleContains?: string[];
  contentContains?: string[];
  hasAllTags?: string[];
  hasAnyTags?: string[];
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  minLength?: number;
  maxLength?: number;
  isPinned?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  isEncrypted?: boolean;
}

interface GetRelatedNotesArgs {
  noteId: number;
  limit?: number;
}

interface SearchNotesFullTextArgs {
  query: string;
  limit?: number;
  includeSnippets?: boolean;
  searchFields?: ('title' | 'content' | 'both')[];
  fuzzyMatch?: boolean;
  caseSensitive?: boolean;
  wholeWords?: boolean;
  includeArchived?: boolean;
  includeTrashed?: boolean;
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
}

interface GetSearchSuggestionsArgs {
  partialQuery: string;
  limit?: number;
}

interface FindSimilarNotesArgs {
  referenceText: string;
  limit?: number;
  minSimilarity?: number;
  excludeNoteId?: number;
}

interface GetFileAttachmentsArgs {
  noteId?: number;
  fileType?: string;
  includeMetadata?: boolean;
  limit?: number;
}

interface AnalyzeNoteMetadataArgs {
  includeContentAnalysis?: boolean;
  includeLinkAnalysis?: boolean;
  includeStructureAnalysis?: boolean;
}

interface GetNotesWithMetadataArgs {
  hasAttachments?: boolean;
  hasLinks?: boolean;
  hasImages?: boolean;
  hasTodos?: boolean;
  hasCodeBlocks?: boolean;
  hasTables?: boolean;
  minWordCount?: number;
  maxWordCount?: number;
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  limit?: number;
}

interface CreateNoteArgs {
  title: string;
  content?: string;
  tags?: string[];
  isArchived?: boolean;
  isPinned?: boolean;
}

interface UpdateNoteArgs {
  noteId: number;
  title?: string;
  content?: string;
  tags?: string[];
  isArchived?: boolean;
  isPinned?: boolean;
  expectedModificationDate?: string;
}

interface DuplicateNoteArgs {
  noteId: number;
  titleSuffix?: string;
  copyTags?: boolean;
}

interface ArchiveNoteArgs {
  noteId: number;
  archived: boolean;
}

interface TriggerHashtagParsingArgs {
  noteId?: string;
  noteTitle?: string;
}

interface BatchTriggerHashtagParsingArgs {
  tag_filter?: string;
  title_pattern?: string;
  limit?: number;
  created_after?: string;
}

/**
 * Bear MCP Server
 * Provides MCP tools for interfacing with Bear's SQLite database
 */
class BearMCPServer {
  private server: Server;
  private bearService: BearService;

  constructor() {
    this.server = new Server({
      name: 'bear-mcp-server',
      version: '1.0.0',
    });

    this.bearService = new BearService();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getAvailableTools(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_database_stats':
            return await this.getDatabaseStats();

          case 'get_database_schema':
            return await this.getDatabaseSchema();

          case 'check_bear_status':
            return await this.checkBearStatus();

          case 'verify_database_access':
            return await this.verifyDatabaseAccess();

          case 'create_backup':
            return await this.createBackup();

          case 'get_recent_notes':
            return await this.getRecentNotes(args as unknown as GetRecentNotesArgs);

          case 'search_notes':
            return await this.searchNotes(args as unknown as SearchNotesArgs);

          case 'get_note_by_id':
            return await this.getNoteById(args as unknown as GetNoteByIdArgs);

          case 'get_note_by_title':
            return await this.getNoteByTitle(args as unknown as GetNoteByTitleArgs);

          case 'get_all_tags':
            return await this.getAllTags(args as unknown as GetAllTagsArgs);

          case 'get_notes_by_tag':
            return await this.getNotesByTag(args as unknown as GetNotesByTagArgs);

          case 'get_notes_advanced':
            return await this.getNotesAdvanced(args as unknown as GetNotesAdvancedArgs);

          case 'get_notes_with_criteria':
            return await this.getNotesWithCriteria(args as unknown as GetNotesWithCriteriaArgs);

          case 'get_note_analytics':
            return await this.getNoteAnalytics();

          case 'get_related_notes':
            return await this.getRelatedNotes(args as unknown as GetRelatedNotesArgs);

          case 'search_notes_fulltext':
            return await this.searchNotesFullText(args as unknown as SearchNotesFullTextArgs);

          case 'get_search_suggestions':
            return await this.getSearchSuggestions(args as unknown as GetSearchSuggestionsArgs);

          case 'find_similar_notes':
            return await this.findSimilarNotes(args as unknown as FindSimilarNotesArgs);

          // case 'search_notes_regex':
          //   return await this.searchNotesRegex(args);

          // TODO: Implement tag management methods in BearService
          // case 'get_tag_hierarchy':
          //   return await this.getTagHierarchy(args);

          // case 'get_tag_analytics':
          //   return await this.getTagAnalytics(args);

          // case 'analyze_tag_relationships':
          //   return await this.analyzeTagRelationships(args);

          // case 'get_tag_usage_trends':
          //   return await this.getTagUsageTrends(args);

          case 'get_file_attachments':
            return await this.getFileAttachments(args as unknown as GetFileAttachmentsArgs);

          case 'analyze_note_metadata':
            return await this.analyzeNoteMetadata(args as unknown as AnalyzeNoteMetadataArgs);

          case 'get_notes_with_metadata':
            return await this.getNotesWithMetadata(args as unknown as GetNotesWithMetadataArgs);

          case 'create_note':
            return await this.createNote(args as unknown as CreateNoteArgs);

          case 'update_note':
            return await this.updateNote(args as unknown as UpdateNoteArgs);

          case 'duplicate_note':
            return await this.duplicateNote(args as unknown as DuplicateNoteArgs);

          case 'archive_note':
            return await this.archiveNote(args as unknown as ArchiveNoteArgs);

          case 'trigger_hashtag_parsing':
            return await this.triggerHashtagParsing(args as unknown as TriggerHashtagParsingArgs);

          case 'batch_trigger_hashtag_parsing':
            return await this.batchTriggerHashtagParsing(
              args as unknown as BatchTriggerHashtagParsingArgs
            );

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    });
  }

  private getAvailableTools(): Tool[] {
    return [
      {
        name: 'get_database_stats',
        description:
          'Get comprehensive statistics about the Bear database including note counts, tags, and database health',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_database_schema',
        description: 'Retrieve the complete database schema showing all tables and their structure',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'check_bear_status',
        description:
          'Check if Bear app is currently running (informational - write operations now use sync-safe Bear API)',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'verify_database_access',
        description: 'Verify that the Bear database is accessible and readable',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'create_backup',
        description: 'Create a timestamped backup of the Bear database',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_recent_notes',
        description: 'Get the most recently modified notes',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of notes to retrieve (default: 10)',
              minimum: 1,
              maximum: 100,
            },
          },
          required: [],
        },
      },
      {
        name: 'search_notes',
        description: 'Search notes by title and content',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to match against note titles and content',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 20)',
              minimum: 1,
              maximum: 100,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_note_by_id',
        description: 'Get a specific note by its database ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'The database ID of the note',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_note_by_title',
        description: 'Get a specific note by its title',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'The exact title of the note',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'get_all_tags',
        description: 'Get all tags with their usage counts. By default, only returns tags with active (non-trashed) notes to match Bear sidebar display.',
        inputSchema: {
          type: 'object',
          properties: {
            includeOrphanTags: {
              type: 'boolean',
              description: 'If true, includes tags that only exist on trashed notes (default: false)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_notes_by_tag',
        description: 'Get all notes that have a specific tag',
        inputSchema: {
          type: 'object',
          properties: {
            tag: {
              type: 'string',
              description: 'The tag name to search for',
            },
          },
          required: ['tag'],
        },
      },
      {
        name: 'get_notes_advanced',
        description: 'Advanced note search with filtering, sorting, and pagination',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for title and content',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags that notes must have (AND logic)',
            },
            excludeTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags to exclude from results',
            },
            dateFrom: {
              type: 'string',
              description: 'Filter notes created on or after this date (inclusive) (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)',
            },
            dateTo: {
              type: 'string',
              description: 'Filter notes created on or before this date (inclusive) (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)',
            },

            modifiedAfter: {
              type: 'string',
              description: 'Filter notes modified on or after this date (inclusive) (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)',
            },
            modifiedBefore: {
              type: 'string',
              description: 'Filter notes modified on or before this date (inclusive) (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)',
            },

            includeContent: {
              type: 'boolean',
              description: 'Include full content in results (default: true for preview)',
            },

            includeTrashed: {
              type: 'boolean',
              description: 'Include trashed notes in results (default: false)',
            },
            includeArchived: {
              type: 'boolean',
              description: 'Include archived notes in results (default: false)',
            },
            includeEncrypted: {
              type: 'boolean',
              description: 'Include encrypted notes in results (default: false)',
            },
            sortBy: {
              type: 'string',
              enum: ['created', 'modified', 'title', 'size'],
              description: 'Sort notes by field',
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              minimum: 1,
              maximum: 100,
            },
            offset: {
              type: 'number',
              description: 'Number of results to skip for pagination',
              minimum: 0,
            },
          },
          required: [],
        },
      },
      {
        name: 'get_notes_with_criteria',
        description: 'Find notes using complex criteria with AND/OR logic',
        inputSchema: {
          type: 'object',
          properties: {
            titleContains: {
              type: 'array',
              items: { type: 'string' },
              description: 'Terms that must appear in title (OR logic)',
            },
            contentContains: {
              type: 'array',
              items: { type: 'string' },
              description: 'Terms that must appear in content (OR logic)',
            },
            hasAllTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags that notes must have (AND logic)',
            },
            hasAnyTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags that notes can have (OR logic)',
            },
            isPinned: {
              type: 'boolean',
              description: 'Filter by pinned status',
            },
            isArchived: {
              type: 'boolean',
              description: 'Filter by archived status',
            },
            minLength: {
              type: 'number',
              description: 'Minimum content length',
            },
            maxLength: {
              type: 'number',
              description: 'Maximum content length',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_note_analytics',
        description: 'Get comprehensive analytics and statistics about notes',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_related_notes',
        description: 'Find notes related to a specific note by tags and content',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'number',
              description: 'The ID of the note to find related notes for',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of related notes to return',
              minimum: 1,
              maximum: 20,
            },
          },
          required: ['noteId'],
        },
      },
      {
        name: 'search_notes_fulltext',
        description: 'Advanced full-text search with relevance scoring and snippets',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query string',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              minimum: 1,
              maximum: 50,
            },
            includeSnippets: {
              type: 'boolean',
              description: 'Include content snippets around matches',
            },
            searchFields: {
              type: 'array',
              items: { type: 'string', enum: ['title', 'content', 'both'] },
              description: 'Fields to search in',
            },
            fuzzyMatch: {
              type: 'boolean',
              description: 'Enable fuzzy matching for typos',
            },
            caseSensitive: {
              type: 'boolean',
              description: 'Case sensitive search',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_search_suggestions',
        description: 'Get auto-complete suggestions for search queries',
        inputSchema: {
          type: 'object',
          properties: {
            partialQuery: {
              type: 'string',
              description: 'Partial search query for suggestions',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of suggestions',
              minimum: 1,
              maximum: 20,
            },
          },
          required: ['partialQuery'],
        },
      },
      {
        name: 'find_similar_notes',
        description: 'Find notes similar to given text using content analysis',
        inputSchema: {
          type: 'object',
          properties: {
            referenceText: {
              type: 'string',
              description: 'Text to find similar notes for',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of similar notes',
              minimum: 1,
              maximum: 20,
            },
            minSimilarity: {
              type: 'number',
              description: 'Minimum similarity score (0.0 to 1.0)',
              minimum: 0,
              maximum: 1,
            },
            excludeNoteId: {
              type: 'number',
              description: 'Note ID to exclude from results',
            },
          },
          required: ['referenceText'],
        },
      },
      {
        name: 'search_notes_regex',
        description: 'Search notes using regular expressions',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Regular expression pattern',
            },
            flags: {
              type: 'string',
              description: 'Regex flags (e.g., "gi" for global case-insensitive)',
            },
            searchIn: {
              type: 'string',
              enum: ['title', 'content', 'both'],
              description: 'Where to search for the pattern',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              minimum: 1,
              maximum: 50,
            },
            includeContext: {
              type: 'boolean',
              description: 'Include context around matches',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'get_tag_hierarchy',
        description: 'Get comprehensive tag hierarchy and relationships',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_tag_analytics',
        description: 'Get detailed tag statistics and usage patterns',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'analyze_tag_relationships',
        description: 'Analyze tag relationships and suggest improvements',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_tag_usage_trends',
        description: 'Get tag usage timeline and trends',
        inputSchema: {
          type: 'object',
          properties: {
            tagName: {
              type: 'string',
              description: 'Specific tag to analyze (optional)',
            },
            months: {
              type: 'number',
              description: 'Number of months to analyze',
              minimum: 1,
              maximum: 24,
            },
          },
        },
      },
      {
        name: 'get_file_attachments',
        description: 'Get comprehensive file attachment information',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'number',
              description: 'Specific note ID to get attachments for',
            },
            fileType: {
              type: 'string',
              description: 'Filter by file extension (e.g., "jpg", "pdf")',
            },
            includeMetadata: {
              type: 'boolean',
              description: 'Include detailed file metadata',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of attachments to return',
              minimum: 1,
              maximum: 100,
            },
          },
        },
      },
      {
        name: 'analyze_note_metadata',
        description: 'Analyze note metadata and content patterns',
        inputSchema: {
          type: 'object',
          properties: {
            includeContentAnalysis: {
              type: 'boolean',
              description: 'Include markdown and content pattern analysis',
            },
            includeLinkAnalysis: {
              type: 'boolean',
              description: 'Include link analysis and domain statistics',
            },
            includeStructureAnalysis: {
              type: 'boolean',
              description: 'Include note structure and title pattern analysis',
            },
          },
        },
      },
      {
        name: 'get_notes_with_metadata',
        description: 'Get notes filtered by metadata characteristics',
        inputSchema: {
          type: 'object',
          properties: {
            hasAttachments: {
              type: 'boolean',
              description: 'Filter notes with/without attachments',
            },
            hasLinks: {
              type: 'boolean',
              description: 'Filter notes with/without external links',
            },
            hasImages: {
              type: 'boolean',
              description: 'Filter notes with/without images',
            },
            hasTodos: {
              type: 'boolean',
              description: 'Filter notes with/without todo items',
            },
            hasCodeBlocks: {
              type: 'boolean',
              description: 'Filter notes with/without code blocks',
            },
            hasTables: {
              type: 'boolean',
              description: 'Filter notes with/without tables',
            },
            minWordCount: {
              type: 'number',
              description: 'Minimum word count',
              minimum: 1,
            },
            maxWordCount: {
              type: 'number',
              description: 'Maximum word count',
              minimum: 1,
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              minimum: 1,
              maximum: 100,
            },
          },
        },
      },
      {
        name: 'create_note',
        description: 'Create a new note with title, content, and tags using sync-safe Bear API',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the new note',
            },
            content: {
              type: 'string',
              description: 'Content/body of the note (optional)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Array of tag names to apply to the note. Tags are automatically sanitized: lowercase only, no spaces/hyphens (underscores allowed, use forward slashes for nested tags like "work/project")',
            },
            isArchived: {
              type: 'boolean',
              description: 'Whether the note should be archived',
            },
            isPinned: {
              type: 'boolean',
              description: 'Whether the note should be pinned',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'update_note',
        description: 'Update an existing note using sync-safe Bear API',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'number',
              description: 'ID of the note to update',
            },
            title: {
              type: 'string',
              description: 'New title for the note',
            },
            content: {
              type: 'string',
              description: 'New content for the note',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description:
                'New array of tag names (replaces existing tags). Tags are automatically sanitized: lowercase only, no spaces/hyphens (underscores allowed, use forward slashes for nested tags like "work/project")',
            },
            isArchived: {
              type: 'boolean',
              description: 'Whether the note should be archived',
            },
            isPinned: {
              type: 'boolean',
              description: 'Whether the note should be pinned',
            },
          },
          required: ['noteId'],
        },
      },
      {
        name: 'duplicate_note',
        description: 'Create a duplicate of an existing note using sync-safe Bear API',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'number',
              description: 'ID of the note to duplicate',
            },
            titleSuffix: {
              type: 'string',
              description: 'Suffix to add to the duplicated note title (default: " (Copy)")',
            },
            copyTags: {
              type: 'boolean',
              description: 'Whether to copy tags from the original note (default: true)',
            },
          },
          required: ['noteId'],
        },
      },
      {
        name: 'archive_note',
        description: 'Archive or unarchive a note using sync-safe Bear API',
        inputSchema: {
          type: 'object',
          properties: {
            noteId: {
              type: 'number',
              description: 'ID of the note to archive/unarchive',
            },
            archived: {
              type: 'boolean',
              description: 'True to archive, false to unarchive',
            },
          },
          required: ['noteId', 'archived'],
        },
      },
      {
        name: 'trigger_hashtag_parsing',
        description: 'Trigger Bear to reparse hashtags in a note using sync-safe API. Provide either note_id or note_title.',
        inputSchema: {
          type: 'object',
          properties: {
            note_id: {
              type: 'string',
              description: 'Note ID to trigger parsing for',
            },
            note_title: {
              type: 'string',
              description: 'Note title to trigger parsing for (alternative to note_id)',
            },
          },
          required: [],
        },
      },
      {
        name: 'batch_trigger_hashtag_parsing',
        description: 'Trigger hashtag parsing for multiple notes using sync-safe API',
        inputSchema: {
          type: 'object',
          properties: {
            tag_filter: {
              type: 'string',
              description: 'Filter notes by tag name',
            },
            title_pattern: {
              type: 'string',
              description: 'Filter notes by title pattern',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of notes to process',
            },
            created_after: {
              type: 'string',
              description: 'Filter notes created after this date (ISO string)',
            },
          },
        },
      },
    ];
  }

  private async getDatabaseStats() {
    try {
      const stats = await this.bearService.getDatabaseStats();
      const integrity = await this.bearService.checkIntegrity();

      return {
        content: [
          {
            type: 'text',
            text: `Bear Database Statistics:
📊 Notes: ${stats.totalNotes} total (${stats.activeNotes} active, ${stats.trashedNotes} trashed, ${stats.archivedNotes} archived)
🔒 Encrypted Notes: ${stats.encryptedNotes}
🏷️  Tags: ${stats.totalTags}
📎 Attachments: ${stats.totalAttachments}
💾 Database Size: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB
📅 Last Modified: ${stats.lastModified.toLocaleString()}
✅ Database Integrity: ${integrity ? 'OK' : 'FAILED'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting database stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getDatabaseSchema() {
    try {
      const schema = await this.bearService.getSchema();

      const schemaText = schema
        .map(
          (table: { name: string; sql: string }) =>
            `Table: ${table.name}\n${table.sql || 'No schema available'}\n`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Bear Database Schema:\n\n${schemaText}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async checkBearStatus() {
    try {
      const isRunning = await this.bearService.isBearRunning();

      return {
        content: [
          {
            type: 'text',
            text: `Bear App Status: ${isRunning ? '🔴 RUNNING' : '🟢 NOT RUNNING'}
${isRunning ? '✅ Write operations use sync-safe Bear API' : '✅ All database operations available'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error checking Bear status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async verifyDatabaseAccess() {
    try {
      await this.bearService.verifyDatabaseAccess();

      return {
        content: [
          {
            type: 'text',
            text: '✅ Database access verified successfully',
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Database access failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async createBackup() {
    try {
      const backupPath = await this.bearService.createBackup();

      return {
        content: [
          {
            type: 'text',
            text: `✅ Backup created successfully: ${backupPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getRecentNotes(args: GetRecentNotesArgs) {
    try {
      const limit = args?.limit || 10;
      const notes = await this.bearService.getRecentNotes(limit);

      if (notes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No notes found.',
            },
          ],
        };
      }

      const notesList = notes
        .map(note => {
          const preview = note.ZTEXT ? `${note.ZTEXT.substring(0, 100)}...` : '';
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          return `📝 **${note.ZTITLE || 'Untitled'}**${tags}\n   ${preview}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Recent Notes (${notes.length}):\n\n${notesList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting recent notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async searchNotes(args: SearchNotesArgs) {
    try {
      const query = args?.query;
      const limit = args?.limit || 20;

      if (!query) {
        throw new Error('Search query is required');
      }

      const notes = await this.bearService.searchNotes(query, { limit });

      if (notes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No notes found matching "${query}".`,
            },
          ],
        };
      }

      const notesList = notes
        .map(note => {
          const preview = note.ZTEXT ? `${note.ZTEXT.substring(0, 100)}...` : '';
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          return `📝 **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tags}\n   ${preview}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Search Results for "${query}" (${notes.length}):\n\n${notesList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error searching notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getNoteById(args: GetNoteByIdArgs) {
    try {
      const id = args?.id;

      if (!id) {
        throw new Error('Note ID is required');
      }

      const note = await this.bearService.getNoteById(id);

      if (!note) {
        return {
          content: [
            {
              type: 'text',
              text: `No note found with ID ${id}.`,
            },
          ],
        };
      }

      const tags = note.tags.length > 0 ? `\n🏷️ Tags: ${note.tags.join(', ')}` : '';
      const content = note.ZTEXT || 'No content';

      return {
        content: [
          {
            type: 'text',
            text: `📝 **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tags}\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting note: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getNoteByTitle(args: GetNoteByTitleArgs) {
    try {
      const title = args?.title;

      if (!title) {
        throw new Error('Note title is required');
      }

      const note = await this.bearService.getNoteByTitle(title);

      if (!note) {
        return {
          content: [
            {
              type: 'text',
              text: `No note found with title "${title}".`,
            },
          ],
        };
      }

      const tags = note.tags.length > 0 ? `\n🏷️ Tags: ${note.tags.join(', ')}` : '';
      const content = note.ZTEXT || 'No content';

      return {
        content: [
          {
            type: 'text',
            text: `📝 **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tags}\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting note: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getAllTags(args?: GetAllTagsArgs) {
    try {
      const includeOrphanTags = args?.includeOrphanTags ?? false;
      const tags = await this.bearService.getTags({ includeOrphanTags });

      if (tags.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No tags found.',
            },
          ],
        };
      }

      const tagsList = tags.map(tag => `🏷️ **${tag.ZTITLE}** (${tag.noteCount} notes)`).join('\n');
      const orphanNote = includeOrphanTags ? ' (including orphan tags)' : '';

      return {
        content: [
          {
            type: 'text',
            text: `All Tags (${tags.length})${orphanNote}:\n\n${tagsList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting tags: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getNotesByTag(args: GetNotesByTagArgs) {
    try {
      const tag = args?.tag;

      if (!tag) {
        throw new Error('Tag name is required');
      }

      const notes = await this.bearService.getNotesByTag(tag);

      if (notes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No notes found with tag "${tag}".`,
            },
          ],
        };
      }

      const notesList = notes
        .map(note => {
          const preview = note.ZTEXT ? `${note.ZTEXT.substring(0, 100)}...` : '';
          const otherTags = note.tags.filter(t => t !== tag);
          const tagInfo = otherTags.length > 0 ? ` [+${otherTags.join(', ')}]` : '';
          return `📝 **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tagInfo}\n   ${preview}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Notes with tag "${tag}" (${notes.length}):\n\n${notesList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting notes by tag: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getNotesAdvanced(args: GetNotesAdvancedArgs) {
    try {
      const options = {
        query: args?.query,
        tags: args?.tags,
        excludeTags: args?.excludeTags,
        dateFrom: args?.dateFrom ? new Date(args.dateFrom) : undefined,
        dateTo: args?.dateTo ? new Date(args.dateTo) : undefined,
        modifiedAfter: args?.modifiedAfter ? new Date(args.modifiedAfter) : undefined,
        modifiedBefore: args?.modifiedBefore ? new Date(args.modifiedBefore) : undefined,
        includeContent: args?.includeContent,
        includeTrashed: args?.includeTrashed,
        includeArchived: args?.includeArchived,
        includeEncrypted: args?.includeEncrypted,
        sortBy: args?.sortBy || 'modified',
        sortOrder: args?.sortOrder || 'desc',
        limit: args?.limit || 20,
        offset: args?.offset,
      };

      const notes = await this.bearService.getNotesAdvanced(options);

      if (notes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No notes found matching the specified criteria.',
            },
          ],
        };
      }

      const notesList = notes
        .map(note => {
          const preview = note.preview || (note.ZTEXT ? `${note.ZTEXT.substring(0, 100)}...` : '');
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          const length = note.contentLength ? ` (${note.contentLength} chars)` : '';
          return `📝 **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tags}${length}\n   ${preview}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Advanced Search Results (${notes.length}):\n\n${notesList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error in advanced search: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getNotesWithCriteria(args: GetNotesWithCriteriaArgs) {
    try {
      const criteria = {
        titleContains: args?.titleContains,
        contentContains: args?.contentContains,
        hasAllTags: args?.hasAllTags,
        hasAnyTags: args?.hasAnyTags,
        isPinned: args?.isPinned,
        isArchived: args?.isArchived,
        minLength: args?.minLength,
        maxLength: args?.maxLength,
      };

      const notes = await this.bearService.getNotesWithCriteria(criteria);

      if (notes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No notes found matching the specified criteria.',
            },
          ],
        };
      }

      const notesList = notes
        .map(note => {
          const preview = note.ZTEXT ? `${note.ZTEXT.substring(0, 100)}...` : '';
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          const length = note.contentLength ? ` (${note.contentLength} chars)` : '';
          const status = [];
          if (note.ZPINNED) {
            status.push('📌');
          }
          if (note.ZARCHIVED) {
            status.push('📦');
          }
          if (note.ZENCRYPTED) {
            status.push('🔒');
          }
          const statusStr = status.length > 0 ? ` ${status.join('')}` : '';

          return `📝 **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tags}${length}${statusStr}\n   ${preview}`;
        })
        .join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `Criteria Search Results (${notes.length}):\n\n${notesList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error in criteria search: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getNoteAnalytics() {
    try {
      const analytics = await this.bearService.getNoteAnalytics();

      const monthlyData = analytics.notesPerMonth
        .slice(0, 6)
        .map(stat => `   ${stat.month}: ${stat.count} notes`)
        .join('\n');

      const topTagsData = analytics.topTags
        .slice(0, 8)
        .map(tag => `   ${tag.tag}: ${tag.count} notes`)
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `📊 **Bear Notes Analytics**

**📈 Overview:**
• Total Notes: ${analytics.totalNotes}
• Average Length: ${analytics.averageLength} characters
• Longest Note: "${analytics.longestNote.title}" (${analytics.longestNote.length} chars)
• Shortest Note: "${analytics.shortestNote.title}" (${analytics.shortestNote.length} chars)

**📅 Timeline:**
• Most Recent: "${analytics.mostRecentNote.title}" (${analytics.mostRecentNote.date.toLocaleDateString()})
• Oldest Note: "${analytics.oldestNote.title}" (${analytics.oldestNote.date.toLocaleDateString()})

**📊 Content Analysis:**
• Notes with Images: ${analytics.contentStats.hasImages}
• Notes with Files: ${analytics.contentStats.hasFiles}  
• Notes with Code: ${analytics.contentStats.hasSourceCode}
• Notes with TODOs: ${analytics.contentStats.hasTodos}

**📈 Recent Activity (Notes per Month):**
${monthlyData}

**🏷️ Top Tags:**
${topTagsData}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error getting analytics: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getRelatedNotes(args: GetRelatedNotesArgs) {
    try {
      const noteId = args?.noteId;
      const limit = args?.limit || 5;

      if (!noteId) {
        throw new Error('Note ID is required');
      }

      const related = await this.bearService.getRelatedNotes(noteId, limit);

      if (related.byTags.length === 0 && related.byContent.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No related notes found for note ID ${noteId}.`,
            },
          ],
        };
      }

      let result = `🔗 **Related Notes for ID ${noteId}**\n\n`;

      if (related.byTags.length > 0) {
        result += `**📌 Related by Tags (${related.byTags.length}):**\n`;
        related.byTags.forEach(note => {
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          result += `• **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tags}\n`;
        });
        result += '\n';
      }

      if (related.byContent.length > 0) {
        result += `**📄 Related by Content (${related.byContent.length}):**\n`;
        related.byContent.forEach(note => {
          const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : '';
          result += `• **${note.ZTITLE || 'Untitled'}** (ID: ${note.Z_PK})${tags}\n`;
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error finding related notes: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async searchNotesFullText(args: SearchNotesFullTextArgs) {
    try {
      const {
        query,
        limit = 20,
        includeSnippets = true,
        searchFields = ['both'],
        fuzzyMatch = false,
        caseSensitive = false,
      } = args;

      const results = await this.bearService.searchNotesFullText(query, {
        limit,
        includeSnippets,
        searchFields,
        fuzzyMatch,
        caseSensitive,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  query,
                  totalFound: results.length,
                  results: results.map(result => ({
                    id: result.Z_PK,
                    title: result.ZTITLE,
                    content:
                      result.ZTEXT?.substring(0, 500) +
                      (result.ZTEXT && result.ZTEXT.length > 500 ? '...' : ''),
                    tags: result.tags,
                    createdAt: result.ZCREATIONDATE,
                    modifiedAt: result.ZMODIFICATIONDATE,
                    relevanceScore: result.relevanceScore,
                    matchedTerms: result.matchedTerms,
                    snippets: result.snippets,
                    titleMatches: result.titleMatches,
                    contentMatches: result.contentMatches,
                  })),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async getSearchSuggestions(args: GetSearchSuggestionsArgs) {
    try {
      const { partialQuery, limit = 10 } = args;
      const suggestions = await this.bearService.getSearchSuggestions(partialQuery, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  partialQuery,
                  suggestions,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async findSimilarNotes(args: FindSimilarNotesArgs) {
    try {
      const { referenceText, limit = 10, minSimilarity = 0.1, excludeNoteId } = args;
      const results = await this.bearService.findSimilarNotes(referenceText, {
        limit,
        minSimilarity,
        excludeNoteId,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  referenceText:
                    referenceText.substring(0, 200) + (referenceText.length > 200 ? '...' : ''),
                  totalFound: results.length,
                  similarNotes: results.map(result => ({
                    id: result.Z_PK,
                    title: result.ZTITLE,
                    content:
                      result.ZTEXT?.substring(0, 300) +
                      (result.ZTEXT && result.ZTEXT.length > 300 ? '...' : ''),
                    tags: result.tags,
                    createdAt: result.ZCREATIONDATE,
                    modifiedAt: result.ZMODIFICATIONDATE,
                    similarityScore: result.similarityScore,
                    commonKeywords: result.commonKeywords,
                  })),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async getFileAttachments(args: GetFileAttachmentsArgs) {
    try {
      const { noteId, fileType, includeMetadata = false, limit } = args;
      const attachments = await this.bearService.getFileAttachments({
        noteId,
        fileType,
        includeMetadata,
        limit,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: attachments,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async analyzeNoteMetadata(args: AnalyzeNoteMetadataArgs) {
    try {
      const {
        includeContentAnalysis = false,
        includeLinkAnalysis = false,
        includeStructureAnalysis = false,
      } = args;

      const analysis = await this.bearService.analyzeNoteMetadata({
        includeContentAnalysis,
        includeLinkAnalysis,
        includeStructureAnalysis,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: analysis,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async getNotesWithMetadata(args: GetNotesWithMetadataArgs) {
    try {
      const criteria = {
        hasAttachments: args.hasAttachments,
        hasLinks: args.hasLinks,
        hasImages: args.hasImages,
        hasTodos: args.hasTodos,
        hasCodeBlocks: args.hasCodeBlocks,
        hasTables: args.hasTables,
        minWordCount: args.minWordCount,
        maxWordCount: args.maxWordCount,
        limit: args.limit || 20,
      };

      const notes = await this.bearService.getNotesWithMetadata(criteria);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  totalFound: notes.length,
                  notes: notes.map(note => ({
                    id: note.Z_PK,
                    title: note.ZTITLE,
                    content:
                      note.ZTEXT?.substring(0, 300) +
                      (note.ZTEXT && note.ZTEXT.length > 300 ? '...' : ''),
                    tags: note.tags,
                    createdAt: note.ZCREATIONDATE,
                    modifiedAt: note.ZMODIFICATIONDATE,
                    wordCount: note.wordCount,
                    attachmentCount: note.attachmentCount,
                    linkCount: note.linkCount,
                    imageCount: note.imageCount,
                    todoCount: note.todoCount,
                    codeBlockCount: note.codeBlockCount,
                    tableCount: note.tableCount,
                    metadata: note.metadata,
                  })),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async createNote(args: CreateNoteArgs) {
    try {
      const { title, content, tags, isArchived = false, isPinned = false } = args;

      if (!title || title.trim().length === 0) {
        throw new Error('Title is required and cannot be empty');
      }

      const result = await this.bearService.createNote({
        title: title.trim(),
        content: content || '',
        tags: tags || [],
        isArchived,
        isPinned,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  noteId: result.noteId,
                  title: title.trim(),
                  message: `Note created successfully with ID ${result.noteId}`,
                  tagWarnings: result.tagWarnings,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async updateNote(args: UpdateNoteArgs) {
    try {
      const { noteId, title, content, tags, isArchived, isPinned, expectedModificationDate } = args;

      if (!noteId || typeof noteId !== 'number') {
        throw new Error('Valid noteId is required');
      }

      const options: {
        title?: string;
        content?: string;
        tags?: string[];
        isArchived?: boolean;
        isPinned?: boolean;
        expectedModificationDate?: Date;
      } = {};

      if (title !== undefined) {
        options.title = title;
      }
      if (content !== undefined) {
        options.content = content;
      }
      if (tags !== undefined) {
        options.tags = tags;
      }
      if (isArchived !== undefined) {
        options.isArchived = isArchived;
      }
      if (isPinned !== undefined) {
        options.isPinned = isPinned;
      }
      if (expectedModificationDate) {
        options.expectedModificationDate = new Date(expectedModificationDate);
      }

      const result = await this.bearService.updateNote(noteId, options);

      if (result.conflictDetected) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: 'Conflict detected: Note was modified by another process',
                  conflictDetected: true,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  noteId,
                  message: `Note ${noteId} updated successfully`,
                  tagWarnings: result.tagWarnings,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async duplicateNote(args: DuplicateNoteArgs) {
    try {
      const { noteId, titleSuffix, copyTags = true } = args;

      if (!noteId || typeof noteId !== 'number') {
        throw new Error('Valid noteId is required');
      }

      const result = await this.bearService.duplicateNote(noteId, {
        titleSuffix,
        copyTags,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  originalNoteId: noteId,
                  newNoteId: result.newNoteId,
                  message: `Note ${noteId} duplicated successfully as note ${result.newNoteId}`,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async archiveNote(args: ArchiveNoteArgs) {
    try {
      const { noteId, archived } = args;

      if (!noteId || typeof noteId !== 'number') {
        throw new Error('Valid noteId is required');
      }

      if (typeof archived !== 'boolean') {
        throw new Error('archived parameter must be a boolean');
      }

      await this.bearService.archiveNote(noteId, archived);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  noteId,
                  archived,
                  message: `Note ${noteId} ${archived ? 'archived' : 'unarchived'} successfully`,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async triggerHashtagParsing(args: TriggerHashtagParsingArgs) {
    try {
      const { noteId, noteTitle } = args;

      if (!noteId && !noteTitle) {
        throw new Error('Either noteId or noteTitle is required');
      }

      const result = await this.bearService.triggerHashtagParsing(noteId, noteTitle);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  message: result,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  private async batchTriggerHashtagParsing(args: BatchTriggerHashtagParsingArgs) {
    try {
      const { tag_filter, title_pattern, limit = 10, created_after } = args;

      const result = await this.bearService.batchTriggerHashtagParsing({
        tag_filter,
        title_pattern,
        limit,
        created_after,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                data: {
                  message: result,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // Server running on stdio
  }
}

// Start the server
const server = new BearMCPServer();
server.run().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
