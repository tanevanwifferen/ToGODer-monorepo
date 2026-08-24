import React, { useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  useColorScheme,
  TouchableOpacity,
  Text,
} from "react-native";
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

interface PdfAttachmentInfo {
  id: string;
  name: string;
}

interface CustomInputToolbarProps extends InputToolbarProps<IMessage> {
  showPrompts: boolean;
  inputText: string;
  filteredPrompts: [string, { description: string }][];
  libraryIntegrationEnabled: boolean;
  onToggleLibraryIntegration: (value: boolean) => void;
  onInputTextChanged: (text: string) => void;
  onSelectPrompt: (key: string) => void;
  onSend: (messages: { text: string }[]) => void;
  isGenerating?: boolean;
  onCancel?: () => void;
  /** PDF attachment affordance */
  modelSupportsPdfs: boolean;
  pdfAttachment: PdfAttachmentInfo | null;
  onPickPdf: () => void;
  onRemovePdf: () => void;
  /** Web drag-and-drop: called with the dropped File */
  onDropFile: (file: File) => void;
  /** STT microphone: toggle to record/submit */
  sttEnabled?: boolean;
  isRecording?: boolean;
  isProcessing?: boolean;
  sttError?: string | null;
  onMicToggle?: () => void;
  onMicCancel?: () => void;
  /** TTS stop-speaking button */
  ttsSpeaking?: boolean;
  onTtsStop?: () => void;
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
  modelSupportsPdfs,
  pdfAttachment,
  onPickPdf,
  onRemovePdf,
  onDropFile,
  sttEnabled,
  isRecording,
  isProcessing,
  sttError,
  onMicToggle,
  onMicCancel,
  ttsSpeaking,
  onTtsStop,
  ...toolbarProps
}: CustomInputToolbarProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const [dragOver, setDragOver] = useState(false);
  // Counter so dragenter/dragleave nesting is handled correctly.
  const dragDepth = useRef(0);

  function handleSend() {
    onSend([{ text: inputText }]);
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
        autoComplete: "off",
        textContentType: "none",
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

  const renderSend = (
    props: SendProps<IMessage>,
    onSend: any,
    inputText: string,
  ) => {
    // Show stop button when generating
    if (isGenerating && onCancel) {
      return (
        <View style={styles.sendContainer}>
          <TouchableOpacity onPress={onCancel} style={styles.sendButton}>
            <Ionicons name="stop-circle" size={28} color={theme.tint} />
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
        <View
          style={[styles.sendButton, !props.text && styles.sendButtonDisabled]}
        >
          <Ionicons
            name="send"
            size={24}
            color={
              props.text
                ? theme.tint
                : colorScheme === "dark"
                  ? "#4A4A4A"
                  : "#B8B8B8"
            }
          />
        </View>
      </Send>
    );
  };

  // Render the attachment (paperclip) button and STT mic button.
  const renderActions = () => {
    return (
      <View style={styles.actionsRow}>
        {sttEnabled && onMicToggle && (
          <View style={styles.micColumn}>
            {ttsSpeaking && onTtsStop && (
              <TouchableOpacity
                onPress={onTtsStop}
                style={styles.ttsStopButton}
                accessibilityLabel="Stop speaking"
                accessibilityRole="button"
              >
                <Ionicons name="stop-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            )}
            <View style={styles.micRow}>
              {isRecording && onMicCancel && (
                <TouchableOpacity
                  onPress={onMicCancel}
                  style={styles.cancelButton}
                  accessibilityLabel="Cancel recording"
                  accessibilityRole="button"
                >
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={isProcessing ? undefined : onMicToggle}
                style={[
                  styles.micButton,
                  isRecording && styles.micButtonActive,
                  isProcessing && styles.micButtonProcessing,
                ]}
                disabled={isProcessing}
                accessibilityLabel={
                  isProcessing
                    ? 'Transcribing audio…'
                    : isRecording
                      ? 'Tap to stop recording and submit'
                      : 'Tap to start recording'
                }
                accessibilityRole="button"
              >
                <Ionicons
                  name={isProcessing ? 'hourglass-outline' : isRecording ? 'mic' : 'mic-outline'}
                  size={24}
                  color={isProcessing ? '#f59e0b' : isRecording ? '#ef4444' : theme.tint}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {modelSupportsPdfs && (
          <TouchableOpacity
            onPress={onPickPdf}
            style={styles.attachButton}
            accessibilityLabel="Attach a PDF"
            accessibilityRole="button"
          >
            <Ionicons
              name="attach"
              size={24}
              color={theme.tint}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Web-only drag-and-drop handlers attached to the toolbar wrapper.
  const webDragHandlers =
    Platform.OS === "web"
      ? {
          onDragEnter: (e: any) => {
            e.preventDefault();
            dragDepth.current += 1;
            if (dragDepth.current === 1) setDragOver(true);
          },
          onDragOver: (e: any) => {
            e.preventDefault();
          },
          onDragLeave: (e: any) => {
            e.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setDragOver(false);
            }
          },
          onDrop: (e: any) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragOver(false);
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
              onDropFile(files[0]);
            }
          },
        }
      : {};

  return (
    <View
      {...webDragHandlers}
      style={[styles.wrapper, dragOver && styles.wrapperDragOver]}
    >
      {dragOver && modelSupportsPdfs && (
        <View style={styles.dropOverlay} pointerEvents="none">
          <Ionicons name="document-outline" size={40} color={theme.tint} />
          <Text style={[styles.dropText, { color: theme.text }]}>
            Drop PDF to attach
          </Text>
        </View>
      )}

      <PromptSuggestions
        prompts={filteredPrompts}
        showPrompts={showPrompts}
        libraryIntegrationEnabled={libraryIntegrationEnabled}
        onToggleLibraryIntegration={onToggleLibraryIntegration}
        onSelectPrompt={onSelectPrompt}
      />

      {pdfAttachment && (
        <View style={styles.attachmentChipRow}>
          <View
            style={[
              styles.attachmentChip,
              {
                backgroundColor:
                  colorScheme === "dark" ? "#2D2D2D" : "#eef0f3",
                borderColor: theme.tint,
              },
            ]}
          >
            <Ionicons
              name="document-text"
              size={16}
              color={theme.tint}
            />
            <Text
              style={[styles.attachmentName, { color: theme.text }]}
              numberOfLines={1}
            >
              {pdfAttachment.name}
            </Text>
            <TouchableOpacity
              onPress={onRemovePdf}
              style={styles.attachmentRemove}
              accessibilityLabel="Remove PDF attachment"
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={18} color={theme.tint} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <InputToolbar
        {...toolbarProps}
        containerStyle={[
          styles.inputToolbar,
          {
            borderTopColor:
              colorScheme === "dark" ? "#2D2D2D" : "#e0e0e0",
            backgroundColor: theme.background,
          },
        ]}
        renderComposer={renderComposer}
        renderActions={renderActions}
        renderSend={(props) => renderSend(props, onSend, inputText)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  wrapperDragOver: {
    opacity: 1,
  },
  dropOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 2,
    borderColor: "#3b82f6",
    borderStyle: "dashed",
    borderRadius: 8,
    backgroundColor: "rgba(59,130,246,0.08)",
  },
  dropText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
  },
  attachmentChipRow: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignSelf: "flex-start",
    maxWidth: 320,
  },
  attachmentName: {
    marginLeft: 6,
    fontSize: 13,
    flexShrink: 1,
  },
  attachmentRemove: {
    marginLeft: 8,
    padding: 2,
  },
  inputToolbar: {
    borderTopWidth: 1,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  micButton: {
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  micRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  micColumn: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  ttsStopButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginBottom: 2,
    paddingHorizontal: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  cancelButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
    width: 36,
    height: 36,
  },
  micButtonActive: {
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  micButtonProcessing: {
    backgroundColor: "rgba(245,158,11,0.15)",
    opacity: 0.8,
  },
  attachButton: {
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sendContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  sendButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
