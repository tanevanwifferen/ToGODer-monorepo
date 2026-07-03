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
import { MessageWithMermaid } from "./chat/mermaid/MessageWithMermaid";
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
    inputTextRef,
    setInputText,
    showPrompts,
    filteredPrompts,
    handleInputTextChanged,
    handleSelectPrompt,
    clearInput
  } = useMessageInput(chatId, giftedMessages);

  // Send from the ref: it is updated synchronously on every keystroke, while
  // the rendered inputText prop can be a render behind when Send is tapped
  // right after typing — which used to cut off the last characters.
  const handleSendText = useCallback(
    (fallbackText?: string) => {
      const text = inputTextRef.current || fallbackText;
      if (text) {
        sendApiMessage(text);
        clearInput();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendApiMessage]
  );

  // Get library integration state and handler
  const { libraryIntegrationEnabled, handleLibraryIntegrationToggle } = useLibraryIntegration();

  // Handle edit message action from long press menu.
  // Gifted message _id is the message's index in apiMessages.
  const handleEditMessage = useCallback(
    (messageId: string, content: string) => {
      const messageIndex = Number(messageId);
      if (Number.isInteger(messageIndex) && messageIndex >= 0) {
        setEditingMessageIndex(messageIndex);
        setEditingMessageContent(content);
        setEditModalVisible(true);
      }
    },
    []
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
      // Gifted message _id is the message's index in apiMessages.
      const messageIndex = Number(messageId);
      if (Number.isInteger(messageIndex) && messageIndex >= 0) {
        onDeleteMessage(messageIndex);
      }
    },
    handleEditMessage
  );

  const renderInputToolbar = (toolbarProps: any) => (
    <CustomInputToolbar
      {...toolbarProps}
      onSend={(messages: IMessage[]) => {
        handleSendText(messages[0]?.text);
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

  // Render assistant/user message text, turning ```mermaid fenced blocks into
  // visual diagrams while leaving the rest of the text untouched.
  const renderMessageText = (props: any) => <MessageWithMermaid {...props} />;

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
            handleSendText(messages[0]?.text);
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
          renderMessageText={renderMessageText}
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
