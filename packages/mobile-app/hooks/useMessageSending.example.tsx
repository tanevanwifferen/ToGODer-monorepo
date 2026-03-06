/**
 * Example usage of useMessageSending hook
 *
 * This file demonstrates how to use the useMessageSending hook
 * which was created as part of Phase 3 of the messaging architecture.
 *
 * Phase 3 separates message sending concerns from message display,
 * making the code more modular and reusable.
 */

import React, { useState } from "react";
import { View, TextInput, Button, Text } from "react-native";
import { useMessageSending } from "./useMessageSending";

/**
 * Example 1: Basic message sending component
 * This component focuses purely on sending messages without displaying them
 */
export function MessageSendingExample({ chatId }: { chatId: string }) {
  const [inputText, setInputText] = useState("");
  const { sendMessage, isLoading, typing, error, retry, cancel } = useMessageSending(chatId);

  const handleSend = async () => {
    if (inputText.trim()) {
      await sendMessage(inputText);
      setInputText("");
    }
  };

  return (
    <View>
      <TextInput
        value={inputText}
        onChangeText={setInputText}
        placeholder="Type a message..."
        editable={!isLoading}
      />

      <Button
        title={isLoading ? "Sending..." : "Send"}
        onPress={handleSend}
        disabled={isLoading || !inputText.trim()}
      />

      {isLoading && (
        <Button
          title="Cancel"
          onPress={cancel}
        />
      )}

      {typing && <Text>Assistant is typing...</Text>}

      {error && (
        <View>
          <Text style={{ color: "red" }}>{error}</Text>
          <Button title="Retry" onPress={retry} />
        </View>
      )}
    </View>
  );
}

/**
 * Example 2: Quick reply buttons
 * Demonstrates how useMessageSending can be used for quick actions
 */
export function QuickReplyExample({ chatId }: { chatId: string }) {
  const { sendMessage, isLoading } = useMessageSending(chatId);

  const quickReplies = [
    "Tell me a joke",
    "What's the weather?",
    "Help me with coding",
  ];

  return (
    <View>
      {quickReplies.map((reply) => (
        <Button
          key={reply}
          title={reply}
          onPress={() => sendMessage(reply)}
          disabled={isLoading}
        />
      ))}
    </View>
  );
}

/**
 * Example 3: Combining with useMessages for full chat functionality
 * This shows how useMessageSending can work alongside useMessages
 */
import { useMessages } from "./useMessages";

export function FullChatExample({ chatId }: { chatId: string }) {
  const [inputText, setInputText] = useState("");

  // useMessages now focuses on message display and management
  const { messages, onDeleteMessage } = useMessages(chatId);

  // useMessageSending handles the sending logic
  const { sendMessage, isLoading, typing, error, retry, cancel } = useMessageSending(chatId);

  const handleSend = async () => {
    if (inputText.trim()) {
      await sendMessage(inputText);
      setInputText("");
    }
  };

  return (
    <View>
      {/* Display messages */}
      {messages.map((msg, idx) => (
        <View key={idx}>
          <Text>{msg.role}: {msg.content}</Text>
          <Button title="Delete" onPress={() => onDeleteMessage(idx)} />
        </View>
      ))}

      {typing && <Text>Typing...</Text>}

      {/* Input area */}
      <TextInput
        value={inputText}
        onChangeText={setInputText}
        placeholder="Type a message..."
      />

      <Button
        title="Send"
        onPress={handleSend}
        disabled={isLoading}
      />

      {error && (
        <View>
          <Text style={{ color: "red" }}>{error}</Text>
          <Button title="Retry" onPress={retry} />
        </View>
      )}
    </View>
  );
}

/**
 * Benefits of useMessageSending (Phase 3):
 *
 * 1. Separation of Concerns:
 *    - useMessages: Focus on reading and displaying messages
 *    - useMessageSending: Focus on sending messages
 *
 * 2. Reusability:
 *    - Can be used in any component that needs to send messages
 *    - Not tied to a specific UI pattern (like GiftedChat)
 *
 * 3. Testability:
 *    - Easier to test sending logic in isolation
 *    - Mock dependencies more easily
 *
 * 4. Flexibility:
 *    - Use just sending (Example 1, 2)
 *    - Use both sending and display (Example 3)
 *    - Compose with other hooks for custom behavior
 *
 * 5. Clear API:
 *    - sendMessage(content: string): Send a message
 *    - retry(): Retry last failed message
 *    - regenerate(): Regenerate the last AI response
 *    - cancel(): Cancel an ongoing request
 *    - isLoading: Is a send operation in progress?
 *    - typing: Is the assistant generating a response?
 *    - error: Error message if send failed
 */
