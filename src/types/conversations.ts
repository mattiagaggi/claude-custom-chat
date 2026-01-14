/**
 * Conversation and message types
 */

export interface ConversationData {
	sessionId: string;
	startTime: string | undefined;
	endTime: string;
	messageCount: number;
	totalCost: number;
	totalTokens: {
		input: number;
		output: number;
	};
	messages: Array<{ timestamp: string, messageType: string, data: any }>;
	filename: string;
}

export interface MessageData {
	timestamp: string;
	messageType: string;
	data: any;
}
