/**
 * ConversationManager - Handles conversation persistence and indexing
 * Responsibilities:
 * - Storing conversation messages
 * - Managing conversation index
 * - Loading/saving conversation history
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
}

export class ConversationManager {
	private _conversationsPath: string | undefined;
	private _currentConversation: Array<{ timestamp: string; messageType: string; data: any }> = [];
	private _conversationStartTime: string | undefined;
	private _conversationIndex: ConversationIndex[] = [];
	private _currentSessionId: string | undefined;
	private _totalCost: number = 0;
	private _totalTokensInput: number = 0;
	private _totalTokensOutput: number = 0;

	constructor(private readonly _context: vscode.ExtensionContext) {
		this._initialize();
	}

	/**
	 * Initialize conversations directory
	 */
	private async _initialize(): Promise<void> {
		const homeDir = require('os').homedir();
		const conversationsDir = path.join(homeDir, '.claude', 'conversations');

		try {
			const fs = require('fs').promises;
			await fs.mkdir(conversationsDir, { recursive: true });
			this._conversationsPath = conversationsDir;

			// Load conversation index
			const indexPath = path.join(conversationsDir, 'index.json');
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
	 * Start a new conversation
	 */
	public startConversation(sessionId?: string): void {
		this._currentConversation = [];
		this._conversationStartTime = new Date().toISOString();
		this._currentSessionId = sessionId;
		this._totalCost = 0;
		this._totalTokensInput = 0;
		this._totalTokensOutput = 0;
	}

	/**
	 * Add message to current conversation
	 */
	public addMessage(messageType: string, data: any): void {
		this._currentConversation.push({
			timestamp: new Date().toISOString(),
			messageType,
			data
		});
	}

	/**
	 * Update usage statistics
	 */
	public updateUsage(cost: number, inputTokens: number, outputTokens: number): void {
		this._totalCost += cost;
		this._totalTokensInput += inputTokens;
		this._totalTokensOutput += outputTokens;
	}

	/**
	 * Save current conversation to file
	 */
	public async saveConversation(): Promise<void> {
		if (!this._conversationsPath || this._currentConversation.length === 0) {
			return;
		}

		const filename = `conversation-${Date.now()}.json`;
		const filepath = path.join(this._conversationsPath, filename);

		const conversationData: ConversationData = {
			sessionId: this._currentSessionId || '',
			startTime: this._conversationStartTime,
			endTime: new Date().toISOString(),
			messageCount: this._currentConversation.length,
			totalCost: this._totalCost,
			totalTokens: {
				input: this._totalTokensInput,
				output: this._totalTokensOutput
			},
			messages: this._currentConversation,
			filename
		};

		try {
			const fs = require('fs').promises;
			await fs.writeFile(filepath, JSON.stringify(conversationData, null, 2));

			// Update index
			this._updateIndex(filename, conversationData);
		} catch (error: any) {
			console.error('Failed to save conversation:', error.message);
		}
	}

	/**
	 * Update conversation index
	 */
	private _updateIndex(filename: string, conversationData: ConversationData): void {
		// Find first and last user messages
		const userMessages = this._currentConversation.filter(m => m.messageType === 'userInput');
		const firstUserMessage = userMessages[0]?.data || 'No messages';
		const lastUserMessage = userMessages[userMessages.length - 1]?.data || firstUserMessage;

		// Update or add to index
		const existingIndex = this._conversationIndex.findIndex(c => c.filename === filename);
		const indexEntry: ConversationIndex = {
			filename,
			sessionId: conversationData.sessionId || '',
			startTime: conversationData.startTime || '',
			endTime: conversationData.endTime,
			messageCount: conversationData.messageCount,
			totalCost: conversationData.totalCost,
			firstUserMessage: firstUserMessage.substring(0, 100),
			lastUserMessage: lastUserMessage.substring(0, 100)
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
	 * Load a conversation from file
	 */
	public async loadConversation(filename: string): Promise<ConversationData | undefined> {
		if (!this._conversationsPath) {
			return undefined;
		}

		const filepath = path.join(this._conversationsPath, filename);
		try {
			const fs = require('fs').promises;
			const data = await fs.readFile(filepath, 'utf8');
			const conversationData: ConversationData = JSON.parse(data);

			// Restore state
			this._currentConversation = conversationData.messages;
			this._conversationStartTime = conversationData.startTime;
			this._currentSessionId = conversationData.sessionId;
			this._totalCost = conversationData.totalCost;
			this._totalTokensInput = conversationData.totalTokens.input;
			this._totalTokensOutput = conversationData.totalTokens.output;

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
		// Sort by start time (most recent first)
		return [...this._conversationIndex].sort((a, b) =>
			new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
		);
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
		return {
			sessionId: this._currentSessionId,
			messageCount: this._currentConversation.length,
			totalCost: this._totalCost,
			totalTokensInput: this._totalTokensInput,
			totalTokensOutput: this._totalTokensOutput,
			startTime: this._conversationStartTime
		};
	}

	/**
	 * Set current session ID
	 */
	public setSessionId(sessionId: string): void {
		this._currentSessionId = sessionId;
	}
}
