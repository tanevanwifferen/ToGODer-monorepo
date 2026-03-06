import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  SafeAreaView,
  Platform,
  useColorScheme,
} from "react-native";
import { GiftedChat, IMessage, BubbleProps } from "react-native-gifted-chat";
import { Colors } from "../constants/Colors";
import { ChatHeader } from "./chat/ChatHeader";
import { CustomInputToolbar } from "./chat/CustomInputToolbar";
import { EmptyChat } from "./chat/EmptyChat";
import { EditMessageModal } from "./chat/EditMessageModal";
import { EmbeddedArtifact } from "./chat/EmbeddedArtifact";
import { useMessages } from "../hooks/useMessages";
import { useMessageSending } from "../hooks/useMessageSending";
import { useChatTitle } from "../hooks/useChatTitle";
import { useMessageInput } from "../hooks/useMessageInput";
import { useChatActions } from "../hooks/useChatActions";
import { useGiftedMessages, ExtendedIMessage } from "../hooks/useGiftedMessages";
import { useLibraryIntegration } from "../hooks/useLibraryIntegration";
import Toast from "react-native-toast-message";
import { ThemedText } from "./ThemedText";
import { useExperienceContext } from "./providers/ExperienceProvider";
import { useDispatch } from "react-redux";
import { editMessageAndTruncate } from "../redux/slices/chatsSlice";

interface ChatProps {
  chatId: string;
  onBack: () => void;
}

export function Chat({ chatId, onBack }: ChatProps) {
  const colorScheme = useColorScheme();
  const { showLanguageInput } = useExperienceContext();
  const dispatch = useDispatch();

  // useMessages provides message display and deletion
  const { messages: apiMessages, onDeleteMessage } = useMessages(chatId);

  // useMessageSending provides message sending functionality
  const {
    sendMessage: sendApiMessage,
    retry: retrySend,
    regenerate: regenerateResponse,
    cancel: cancelRequest,
    typing,
    error: errorMessage,
  } = useMessageSending(chatId);

  // Check language configuration when chat is loaded or changes
  useEffect(() => {
    // Only check language configuration when we have a chat
    if (chatId) {
      // This will now use the centralized logic in useExperience.tsx
      // which checks for chat route, language configuration, and shared route
      showLanguageInput();
    }
  }, [showLanguageInput, chatId]);

  // Convert API messages to Gifted Chat messages
  const giftedMessages = useGiftedMessages(apiMessages);
  const chatTitle = useChatTitle(chatId);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");

  // Get message input state and handlers using the consolidated hook
  const {
    inputText,
    setInputText,
    showPrompts,
    filteredPrompts,
    handleInputTextChanged,
    handleSelectPrompt,
    clearInput
  } = useMessageInput(chatId, giftedMessages);

  // Get library integration state and handler
  const { libraryIntegrationEnabled, handleLibraryIntegrationToggle } = useLibraryIntegration();

  // Handle edit message action from long press menu
  const handleEditMessage = useCallback(
    (messageId: string, content: string) => {
      const messageIndex = giftedMessages.findIndex(
        (msg) => msg._id === messageId
      );
      if (messageIndex !== -1 && apiMessages != null) {
        // Convert from reversed index to original index
        const originalIndex = apiMessages.length - 1 - messageIndex;
        setEditingMessageIndex(originalIndex);
        setEditingMessageContent(content);
        setEditModalVisible(true);
      }
    },
    [giftedMessages, apiMessages]
  );

  // Handle save from edit modal
  const handleSaveEdit = useCallback(
    (newContent: string) => {
      if (editingMessageIndex !== null) {
        dispatch(
          editMessageAndTruncate({
            chatId,
            messageIndex: editingMessageIndex,
            content: newContent,
          })
        );
        // Trigger backend sync by regenerating response after edit
        // Use setTimeout to ensure Redux state is updated first
        setTimeout(() => {
          regenerateResponse();
        }, 0);
      }
      setEditModalVisible(false);
      setEditingMessageIndex(null);
      setEditingMessageContent("");
    },
    [dispatch, chatId, editingMessageIndex, regenerateResponse]
  );

  // Handle close edit modal
  const handleCloseEditModal = useCallback(() => {
    setEditModalVisible(false);
    setEditingMessageIndex(null);
    setEditingMessageContent("");
  }, []);

  const { onLongPress } = useChatActions(
    giftedMessages,
    (messageId: string) => {
      const messageIndex = giftedMessages.findIndex(
        (msg) => msg._id === messageId
      );
      if (messageIndex !== -1 && apiMessages != null) {
        // Convert from reversed index to original index
        onDeleteMessage(apiMessages.length - 1 - messageIndex);
      }
    },
    handleEditMessage
  );

  const renderInputToolbar = (toolbarProps: any) => (
    <CustomInputToolbar
      {...toolbarProps}
      onSend={(messages: IMessage[]) => {
        if (messages[0]) {
          sendApiMessage(messages[0].text);
          clearInput();
        }
      }}
      showPrompts={showPrompts}
      inputText={inputText}
      filteredPrompts={filteredPrompts}
      libraryIntegrationEnabled={libraryIntegrationEnabled}
      onToggleLibraryIntegration={handleLibraryIntegrationToggle}
      onInputTextChanged={handleInputTextChanged}
      onSelectPrompt={handleSelectPrompt}
      isGenerating={typing}
      onCancel={cancelRequest}
    />
  );

  const renderSystemMessage = () => {
    if (errorMessage) return <ThemedText>{errorMessage}</ThemedText>;
    return null;
  };

  const renderCustomView = (props: BubbleProps<ExtendedIMessage>) => {
    const message = props.currentMessage as ExtendedIMessage;
    if (message?.artifactId) {
      return <EmbeddedArtifact artifactId={message.artifactId} />;
    }
    return null;
  };

  const backgroundColor = Colors[colorScheme ?? "light"].background;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]}>
      <ChatHeader
        title={chatTitle}
        onBack={onBack}
        messages={apiMessages ?? []}
      />
      <View style={[styles.chatContainer, { backgroundColor }]}>
        <GiftedChat
          messages={giftedMessages}
          onSend={(messages) => {
            if (messages[0]) {
              sendApiMessage(messages[0].text);
              clearInput();
            }
          }}
          user={{
            _id: 1,
          }}
          text={inputText}
          renderChatEmpty={() => (
            <EmptyChat setInputText={setInputText} />
          )}
          renderInputToolbar={renderInputToolbar}
          renderAvatar={null}
          alwaysShowSend
          maxComposerHeight={200}
          minComposerHeight={60}
          inverted={true}
          isTyping={typing}
          minInputToolbarHeight={0}
          onLongPress={onLongPress}
          renderSystemMessage={renderSystemMessage}
          renderCustomView={renderCustomView}
        />
      </View>
      <EditMessageModal
        visible={editModalVisible}
        onClose={handleCloseEditModal}
        onSave={handleSaveEdit}
        initialContent={editingMessageContent}
      />
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
    paddingBottom: Platform.select({ ios: 0, android: 0 }),
  },
});
