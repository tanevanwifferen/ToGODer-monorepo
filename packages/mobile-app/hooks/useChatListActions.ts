import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import { router } from "expo-router";
import { addChat, deleteChat, setCurrentChat } from "../redux/slices/chatsSlice";
import { selectProjects, addChatToProject } from "../redux/slices/projectsSlice";
import CustomAlert from "../components/ui/CustomAlert";

export const useChatListActions = () => {
  const dispatch = useDispatch();
  const projectsState = useSelector(selectProjects);
  const currentProjectId = projectsState.currentProjectId;

  const handleCreateNewChat = () => {
    const newChatId = uuidv4();
    dispatch(
      addChat({
        id: newChatId,
        title: null,
        messages: [],
        memories: [],
        // Assign to current project if one is selected
        projectId: currentProjectId ?? undefined,
      })
    );
    // Also add the chat to the project's chatIds list
    if (currentProjectId) {
      dispatch(addChatToProject({ projectId: currentProjectId, chatId: newChatId }));
    }
    dispatch(setCurrentChat(newChatId));
    router.push({ pathname: '/chat/[id]', params: { id: newChatId } });
  };

  const handleDeleteChat = (chatId: string, title: string | null | undefined) => {
    CustomAlert.alert(
      "Delete Chat",
      `Are you sure you want to delete "${title || "Untitled Chat"}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => dispatch(deleteChat(chatId)),
        },
      ]
    );
  };

  const handleSelectChat = (chatId: string) => {
    dispatch(setCurrentChat(chatId));
    router.push({ pathname: '/chat/[id]', params: { id: chatId } });
  };

  return {
    handleCreateNewChat,
    handleDeleteChat,
    handleSelectChat,
  };
};
