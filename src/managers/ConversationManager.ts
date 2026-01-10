/**
 * ConversationManager.ts - Conversation Persistence & History
 *
 * Manages conversation state and persistence:
 * - Stores messages in memory (Map of conversation ID -> state)
 * - Persists conversations to ~/.claude/conversations/ as JSON files
 * - Maintains an index file for fast conversation list retrieval
 * - Tracks usage statistics (tokens, cost) per conversation
 * - Supports multiple simultaneous conversations
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ConversationData } from '../types';

export interface ConversationIndex {
	filename: string;
	sessionId: string;
	startTime: string;
	endTime: string;
	messageCount: number;
	totalCost: number;
	firstUserMessage: string;
	lastUserMessage: string;
	summary?: string;
}

interface ConversationState {
	messages: Array<{ timestamp: string; messageType: string; data: any }>;
	startTime: string;
	sessionId: string | undefined;
	totalCost: number;
	totalTokensInput: number;
	totalTokensOutput: number;
	filename?: string;
	isActive: boolean;
	hasNewMessages: boolean;
}

export class ConversationManager {
	private _conversationsPath: string | undefined;
	private _conversationIndex: ConversationIndex[] = [];

	// Support multiple active conversations
	private _conversations: Map<string, ConversationState> = new Map();
	private _activeConversationId: string | undefined;

	constructor(private readonly _context: vscode.ExtensionContext) {
		// Set path synchronously
		const homeDir = require('os').homedir();
		this._conversationsPath = path.join(homeDir, '.claude', 'conversations');

		// Do async initialization
		this._initialize();

		// Start with a default conversation
		this._activeConversationId = this._generateConversationId();
		this._conversations.set(this._activeConversationId, {
			messages: [],
			startTime: new Date().toISOString(),
			sessionId: undefined,
			totalCost: 0,
			totalTokensInput: 0,
			totalTokensOutput: 0,
			isActive: true,
			hasNewMessages: false
		});
	}

	/**
	 * Generate a unique conversation ID
	 */
	private _generateConversationId(): string {
		return `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Initialize conversations directory
	 */
	private async _initialize(): Promise<void> {
		if (!this._conversationsPath) {
			return;
		}

		try {
			const fs = require('fs').promises;
			await fs.mkdir(this._conversationsPath, { recursive: true });

			// Load conversation index
			const indexPath = path.join(this._conversationsPath, 'index.json');
			try {
				const indexData = await fs.readFile(indexPath, 'utf8');
				this._conversationIndex = JSON.parse(indexData);
			} catch {
				// Index doesn't exist yet, will be created on first save
				this._conversationIndex = [];
			}
		} catch (error: any) {
			console.error('Failed to initialize conversations directory:', error.message);
		}
	}

	/**
	 * Create a new conversation
	 */
	public createConversation(sessionId?: string): string {
		const conversationId = this._generateConversationId();
		this._conversations.set(conversationId, {
			messages: [],
			startTime: new Date().toISOString(),
			sessionId,
			totalCost: 0,
			totalTokensInput: 0,
			totalTokensOutput: 0,
			isActive: true,
			hasNewMessages: false
		});
		return conversationId;
	}

	/**
	 * Start a new conversation (replaces current active)
	 */
	public startConversation(sessionId?: string): void {
		// Save current conversation if it has messages
		const current = this.getActiveConversation();
		if (current && current.messages.length > 0) {
			this.saveConversation();
		}

		// Create and activate new conversation
		const conversationId = this.createConversation(sessionId);
		this._activeConversationId = conversationId;
	}

	/**
	 * Switch to a different conversation
	 */
	public switchConversation(conversationId: string): boolean {
		if (!this._conversations.has(conversationId)) {
			return false;
		}

		// Mark previous as inactive
		if (this._activeConversationId) {
			const prev = this._conversations.get(this._activeConversationId);
			if (prev) {
				prev.isActive = false;
				prev.hasNewMessages = false; // Clear badge when switching to it
			}
		}

		// Activate new conversation
		this._activeConversationId = conversationId;
		const conv = this._conversations.get(conversationId);
		if (conv) {
			conv.isActive = true;
			conv.hasNewMessages = false;
		}

		return true;
	}

	/**
	 * Get active conversation
	 */
	public getActiveConversation(): ConversationState | undefined {
		if (!this._activeConversationId) return undefined;
		return this._conversations.get(this._activeConversationId);
	}

	/**
	 * Get conversation by ID
	 */
	public getConversation(conversationId: string): ConversationState | undefined {
		return this._conversations.get(conversationId);
	}

	/**
	 * Get all active conversation IDs
	 */
	public getActiveConversationIds(): string[] {
		return Array.from(this._conversations.keys());
	}

	/**
	 * Add message to specific conversation (or active if not specified)
	 */
	public addMessage(messageType: string, data: any, conversationId?: string): void {
		const targetId = conversationId || this._activeConversationId;
		if (!targetId) return;

		const conversation = this._conversations.get(targetId);
		if (!conversation) return;

		conversation.messages.push({
			timestamp: new Date().toISOString(),
			messageType,
			data
		});

		// Mark as having new messages if it's not the active conversation
		if (targetId !== this._activeConversationId) {
			conversation.hasNewMessages = true;
		}
	}

	/**
	 * Update usage statistics for specific conversation (or active if not specified)
	 */
	public updateUsage(cost: number, inputTokens: number, outputTokens: number, conversationId?: string): void {
		const targetId = conversationId || this._activeConversationId;
		if (!targetId) return;

		const conversation = this._conversations.get(targetId);
		if (!conversation) return;

		conversation.totalCost += cost;
		conversation.totalTokensInput += inputTokens;
		conversation.totalTokensOutput += outputTokens;
	}

	/**
	 * Save specific conversation to file (or active if not specified)
	 */
	public async saveConversation(conversationId?: string): Promise<void> {
		const targetId = conversationId || this._activeConversationId;
		if (!targetId || !this._conversationsPath) {
			return;
		}

		const conversation = this._conversations.get(targetId);
		if (!conversation || conversation.messages.length === 0) {
			return;
		}

		// Use existing filename or generate new one
		const filename = conversation.filename || `conversation-${Date.now()}.json`;
		const filepath = path.join(this._conversationsPath, filename);

		const conversationData: ConversationData = {
			sessionId: conversation.sessionId || '',
			startTime: conversation.startTime,
			endTime: new Date().toISOString(),
			messageCount: conversation.messages.length,
			totalCost: conversation.totalCost,
			totalTokens: {
				input: conversation.totalTokensInput,
				output: conversation.totalTokensOutput
			},
			messages: conversation.messages,
			filename
		};

		try {
			const fs = require('fs').promises;
			await fs.writeFile(filepath, JSON.stringify(conversationData, null, 2));

			// Store filename in conversation state
			conversation.filename = filename;

			// Update index
			this._updateIndex(filename, conversationData, conversation);
		} catch (error: any) {
			console.error('Failed to save conversation:', error.message);
		}
	}

	/**
	 * Save all active conversations
	 */
	public async saveAllConversations(): Promise<void> {
		const savePromises = Array.from(this._conversations.keys()).map(id =>
			this.saveConversation(id)
		);
		await Promise.all(savePromises);
	}

	/**
	 * Generate a summary from conversation messages
	 */
	private _generateSummary(messages: Array<{ timestamp: string; messageType: string; data: any }>): string {
		const userMessages = messages.filter((m: any) => m.messageType === 'userInput');

		if (userMessages.length === 0) {
			return 'New conversation';
		}

		// If we have 2+ user messages, use the second one as it's usually more descriptive
		// (first is often just "hi" or "hello")
		const messageToUse = userMessages.length >= 2 ? userMessages[1].data : userMessages[0].data;
		let summary = messageToUse || '';

		// Clean up the message - remove file references, paths, and extra whitespace
		summary = summary
			.replace(/@[\w\/\.\-]+\s*/g, '') // Remove @file references
			.replace(/\/[\w\/\.\-]+/g, '') // Remove file paths
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();

		// Capitalize first letter
		if (summary.length > 0) {
			summary = summary.charAt(0).toUpperCase() + summary.slice(1);
		}

		// Truncate to reasonable length (60 chars max)
		if (summary.length > 60) {
			summary = summary.substring(0, 57) + '...';
		}

		// If summary is too short or empty, provide a generic title
		if (summary.length < 3) {
			summary = 'New conversation';
		}

		return summary;
	}

	/**
	 * Update conversation index
	 */
	private _updateIndex(filename: string, conversationData: ConversationData, conversation: ConversationState): void {
		// Find first and last user messages
		const userMessages = conversation.messages.filter((m: any) => m.messageType === 'userInput');
		const firstUserMessage = userMessages[0]?.data || 'No messages';
		const lastUserMessageObj = userMessages[userMessages.length - 1];
		const lastUserMessage = lastUserMessageObj?.data || firstUserMessage;

		// Use the timestamp of the last user message for sorting (most recently typed)
		// Fall back to endTime if no user messages
		const lastInteractionTime = lastUserMessageObj?.timestamp || conversationData.endTime;

		// Generate summary
		const summary = this._generateSummary(conversation.messages);

		// Update or add to index
		const existingIndex = this._conversationIndex.findIndex(c => c.filename === filename);
		const indexEntry: ConversationIndex = {
			filename,
			sessionId: conversationData.sessionId || '',
			startTime: conversationData.startTime || '',
			endTime: lastInteractionTime, // Use last user interaction time for sorting
			messageCount: conversationData.messageCount,
			totalCost: conversationData.totalCost,
			firstUserMessage: firstUserMessage.substring(0, 100),
			lastUserMessage: lastUserMessage.substring(0, 100),
			summary
		};

		if (existingIndex >= 0) {
			this._conversationIndex[existingIndex] = indexEntry;
		} else {
			this._conversationIndex.push(indexEntry);
		}

		// Save index
		this._saveIndex();
	}

	/**
	 * Save conversation index to file
	 */
	private async _saveIndex(): Promise<void> {
		if (!this._conversationsPath) {
			return;
		}

		const indexPath = path.join(this._conversationsPath, 'index.json');
		try {
			const fs = require('fs').promises;
			await fs.writeFile(indexPath, JSON.stringify(this._conversationIndex, null, 2));
		} catch (error: any) {
			console.error('Failed to save conversation index:', error.message);
		}
	}

	/**
	 * Prune old conversations, keeping only the most recent maxConversations
	 */
	public async pruneOldConversations(maxConversations: number = 100): Promise<number> {
		if (!this._conversationsPath || this._conversationIndex.length <= maxConversations) {
			return 0;
		}

		// Sort by end time (most recent first)
		const sorted = [...this._conversationIndex].sort((a, b) => {
			const timeA = a.endTime || a.startTime;
			const timeB = b.endTime || b.startTime;
			return new Date(timeB).getTime() - new Date(timeA).getTime();
		});

		// Get conversations to delete (oldest ones beyond the limit)
		const toDelete = sorted.slice(maxConversations);
		let deletedCount = 0;

		const fs = require('fs').promises;
		for (const conv of toDelete) {
			try {
				const filepath = path.join(this._conversationsPath, conv.filename);
				await fs.unlink(filepath);
				deletedCount++;
				console.log(`[ConversationManager] Deleted old conversation: ${conv.filename}`);
			} catch (error: any) {
				console.error(`[ConversationManager] Failed to delete ${conv.filename}:`, error.message);
			}
		}

		// Update index to only keep the recent conversations
		this._conversationIndex = sorted.slice(0, maxConversations);
		await this._saveIndex();

		console.log(`[ConversationManager] Pruned ${deletedCount} old conversations, keeping ${maxConversations}`);
		return deletedCount;
	}

	/**
	 * Load a conversation from file into a new conversation slot
	 */
	public async loadConversation(filename: string): Promise<ConversationData | undefined> {
		// Validate filename
		if (!filename) {
			console.error('[ConversationManager] loadConversation called with empty filename');
			return undefined;
		}

		// Ensure initialized
		if (!this._conversationsPath) {
			await this._initialize();
		}

		if (!this._conversationsPath) {
			console.error('[ConversationManager] Failed to initialize conversations path');
			return undefined;
		}

		console.log('[ConversationManager] Loading conversation:', filename, 'from path:', this._conversationsPath);
		const filepath = path.join(this._conversationsPath, filename);
		try {
			const fs = require('fs').promises;
			const data = await fs.readFile(filepath, 'utf8');
			const conversationData: ConversationData = JSON.parse(data);

			// Create new conversation from loaded data
			// Handle older conversation files that may not have totalTokens
			const totalTokens = conversationData.totalTokens || { input: 0, output: 0 };
			console.log('[ConversationManager] loadConversation file data:', {
				totalTokens: conversationData.totalTokens,
				totalCost: conversationData.totalCost,
				resolvedTokens: totalTokens
			});
			const conversationId = this._generateConversationId();
			this._conversations.set(conversationId, {
				messages: conversationData.messages,
				startTime: conversationData.startTime || new Date().toISOString(),
				sessionId: conversationData.sessionId ? conversationData.sessionId : undefined,
				totalCost: conversationData.totalCost || 0,
				totalTokensInput: totalTokens.input || 0,
				totalTokensOutput: totalTokens.output || 0,
				filename: filename,
				isActive: true,
				hasNewMessages: false
			});

			// Switch to this conversation
			if (this._activeConversationId) {
				const prev = this._conversations.get(this._activeConversationId);
				if (prev) prev.isActive = false;
			}
			this._activeConversationId = conversationId;

			return conversationData;
		} catch (error: any) {
			console.error('Failed to load conversation:', error.message);
			return undefined;
		}
	}

	/**
	 * Get conversation list with metadata
	 */
	public getConversationList(): ConversationIndex[] {
		// Sort by end time (most recently active first)
		// Use startTime as fallback if endTime is empty
		return [...this._conversationIndex].sort((a, b) => {
			const timeA = a.endTime || a.startTime;
			const timeB = b.endTime || b.startTime;
			return new Date(timeB).getTime() - new Date(timeA).getTime();
		});
	}

	/**
	 * Get latest conversation
	 */
	public getLatestConversation(): ConversationIndex | undefined {
		const sorted = this.getConversationList();
		return sorted[0];
	}

	/**
	 * Get current session info
	 */
	public getCurrentSession() {
		const conversation = this.getActiveConversation();
		if (!conversation) {
			return {
				sessionId: undefined,
				messageCount: 0,
				totalCost: 0,
				totalTokensInput: 0,
				totalTokensOutput: 0,
				startTime: undefined
			};
		}

		return {
			sessionId: conversation.sessionId,
			messageCount: conversation.messages.length,
			totalCost: conversation.totalCost,
			totalTokensInput: conversation.totalTokensInput,
			totalTokensOutput: conversation.totalTokensOutput,
			startTime: conversation.startTime
		};
	}

	/**
	 * Set session ID for specific conversation (or active if not specified)
	 */
	public setSessionId(sessionId: string, conversationId?: string): void {
		const targetId = conversationId || this._activeConversationId;
		if (!targetId) return;

		const conversation = this._conversations.get(targetId);
		if (!conversation) return;

		conversation.sessionId = sessionId;
	}

	/**
	 * Get active conversation ID
	 */
	public getActiveConversationId(): string | undefined {
		return this._activeConversationId;
	}

	/**
	 * Get filename for a conversation ID
	 */
	public getFilenameForConversation(conversationId: string | undefined): string | undefined {
		if (!conversationId) return undefined;
		const conversation = this._conversations.get(conversationId);
		return conversation?.filename;
	}

	/**
	 * Get conversation ID for a filename (reverse lookup)
	 */
	public getConversationIdForFilename(filename: string | undefined): string | undefined {
		if (!filename) return undefined;
		for (const [id, conversation] of this._conversations) {
			if (conversation.filename === filename) {
				return id;
			}
		}
		return undefined;
	}
}
