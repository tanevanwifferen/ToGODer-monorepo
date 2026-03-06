import React from "react";
import { Platform, StyleSheet, View, useColorScheme, TouchableOpacity } from "react-native";
import {
  InputToolbar,
  InputToolbarProps,
  Composer,
  IMessage,
  SendProps,
  Send,
} from "react-native-gifted-chat";
import { Colors } from "../../constants/Colors";
import { PromptSuggestions } from "./PromptSuggestions";
import { Ionicons } from "@expo/vector-icons";

interface CustomInputToolbarProps extends InputToolbarProps<IMessage> {
  showPrompts: boolean;
  inputText: string;
  filteredPrompts: [string, { description: string }][];
  libraryIntegrationEnabled: boolean;
  onToggleLibraryIntegration: (value: boolean) => void;
  onInputTextChanged: (text: string) => void;
  onSelectPrompt: (key: string) => void;
  onSend: (messages: {text:string}[]) => void;
  isGenerating?: boolean;
  onCancel?: () => void;
}

export function CustomInputToolbar({
  showPrompts,
  inputText,
  filteredPrompts,
  libraryIntegrationEnabled,
  onToggleLibraryIntegration,
  onInputTextChanged,
  onSelectPrompt,
  onSend,
  isGenerating,
  onCancel,
  ...toolbarProps
}: CustomInputToolbarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  function handleSend(){
    onSend([{text: inputText}]);
    onInputTextChanged("");
  }

  const renderComposer = (composerProps: any) => (
    <Composer
      {...composerProps}
      text={inputText}
      onTextChanged={onInputTextChanged}
      textInputStyle={{ color: theme.text }}
      textInputProps={{
        autoCorrect: true,
        autoCapitalize: "sentences",
        spellCheck: true,
        autoComplete: "on",
        blurOnSubmit: Platform.OS === "web",
        onSubmitEditing:
          Platform.OS === "web"
            ? () => {
                if (inputText) {
                  handleSend();
                }
              }
            : undefined,
      }}
    />
  );

  const renderSend = (props: SendProps<IMessage>, onSend: any, inputText: string) => {
    // Show stop button when generating
    if (isGenerating && onCancel) {
      return (
        <View style={styles.sendContainer}>
          <TouchableOpacity onPress={onCancel} style={styles.sendButton}>
            <Ionicons
              name="stop-circle"
              size={28}
              color={theme.tint}
            />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <Send
        {...props}
        onSend={handleSend}
        containerStyle={styles.sendContainer}
        disabled={!props.text}
      >
        <View style={[styles.sendButton, !props.text && styles.sendButtonDisabled]}>
          <Ionicons
            name="send"
            size={24}
            color={props.text ? theme.tint : (colorScheme === 'dark' ? '#4A4A4A' : '#B8B8B8')}
          />
        </View>
      </Send>
    );
  };

  return (
    <View>
      <PromptSuggestions
        prompts={filteredPrompts}
        showPrompts={showPrompts}
        libraryIntegrationEnabled={libraryIntegrationEnabled}
        onToggleLibraryIntegration={onToggleLibraryIntegration}
        onSelectPrompt={onSelectPrompt}
      />
      <InputToolbar
        {...toolbarProps}
        containerStyle={[
          styles.inputToolbar,
          {
            borderTopColor: colorScheme === 'dark' ? '#2D2D2D' : '#e0e0e0',
            backgroundColor: theme.background
          }
        ]}
        renderComposer={renderComposer}
        renderSend={(props)=>renderSend(props, onSend, inputText)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  inputToolbar: {
    borderTopWidth: 1,
  },
  sendContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  sendButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  }
});
