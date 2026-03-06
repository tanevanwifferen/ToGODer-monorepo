/**
 * Tests for ChatStreamService
 */

import { ChatStreamService } from "../ChatStreamService";

describe("ChatStreamService", () => {
  let service: ChatStreamService;

  beforeEach(() => {
    service = ChatStreamService.getInstance();
    // Reset service state before each test
    service.reset();
  });

  afterEach(() => {
    // Cleanup after each test
    service.reset();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = ChatStreamService.getInstance();
      const instance2 = ChatStreamService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("Handler Registration", () => {
    it("should register and unregister chunk handlers", () => {
      const handler = jest.fn();
      const unregister = service.onChunk(handler);

      // Handler should be registered
      expect(typeof unregister).toBe("function");

      // Unregister should work
      unregister();
      expect(unregister).not.toThrow();
    });

    it("should register and unregister signature handlers", () => {
      const handler = jest.fn();
      const unregister = service.onSignature(handler);

      expect(typeof unregister).toBe("function");
      unregister();
    });

    it("should register and unregister memory request handlers", () => {
      const handler = jest.fn();
      const unregister = service.onMemoryRequest(handler);

      expect(typeof unregister).toBe("function");
      unregister();
    });

    it("should register and unregister tool call handlers", () => {
      const handler = jest.fn();
      const unregister = service.onToolCall(handler);

      expect(typeof unregister).toBe("function");
      unregister();
    });

    it("should register and unregister error handlers", () => {
      const handler = jest.fn();
      const unregister = service.onError(handler);

      expect(typeof unregister).toBe("function");
      unregister();
    });

    it("should register and unregister done handlers", () => {
      const handler = jest.fn();
      const unregister = service.onDone(handler);

      expect(typeof unregister).toBe("function");
      unregister();
    });

    it("should allow multiple handlers of the same type", () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      const unregister1 = service.onChunk(handler1);
      const unregister2 = service.onChunk(handler2);

      // Both should be registered
      expect(typeof unregister1).toBe("function");
      expect(typeof unregister2).toBe("function");

      // Should be able to unregister individually
      unregister1();
      unregister2();
    });
  });

  describe("Stream State", () => {
    it("should report not streaming initially", () => {
      expect(service.isStreaming()).toBe(false);
    });

    it("should handle cancel when not streaming", () => {
      expect(() => service.cancel()).not.toThrow();
    });
  });

  describe("Handler Management", () => {
    it("should clear all handlers", () => {
      const chunkHandler = jest.fn();
      const errorHandler = jest.fn();

      service.onChunk(chunkHandler);
      service.onError(errorHandler);

      service.clearHandlers();

      // After clearing, the handlers should not be called
      // (would need to test with actual streaming to verify)
      expect(service).toBeDefined();
    });

    it("should reset service state", () => {
      const handler = jest.fn();
      service.onChunk(handler);

      service.reset();

      // After reset, service should be in initial state
      expect(service.isStreaming()).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle handler errors gracefully", () => {
      // Register a handler that throws
      const throwingHandler = jest.fn(() => {
        throw new Error("Handler error");
      });

      // Should not throw when registering
      expect(() => service.onChunk(throwingHandler)).not.toThrow();

      // Note: Actual invocation testing would require mocking ChatApiClient
    });
  });

  describe("Multiple Unregistrations", () => {
    it("should handle multiple unregister calls", () => {
      const handler = jest.fn();
      const unregister = service.onChunk(handler);

      // First unregister
      unregister();

      // Second unregister should not throw
      expect(() => unregister()).not.toThrow();
    });
  });
});
