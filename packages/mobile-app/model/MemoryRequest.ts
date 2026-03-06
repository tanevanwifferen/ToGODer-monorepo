export interface MemoryCompressiontRequest {
    shortTermMemory: string;
    longTermMemory: Record<string, string>;
}

export interface MemoryCompressiontResponse {
    shortTermMemory: string;
    longTermMemory: Record<string, string>;
}

export interface MemoryTagResponse {
    keys: string[];
}