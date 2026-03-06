import { useDispatch, useSelector } from "react-redux";
import { setProjectForChat } from "../redux/slices/chatsSlice";
import {
  addChatToProject,
  removeChatFromProject,
  selectProjects,
} from "../redux/slices/projectsSlice";
import { useProjectActions } from "./useProjectActions";

export const useChatProjectAssignment = () => {
  const dispatch = useDispatch();
  const projectsState = useSelector(selectProjects);
  const { handleCreateProject } = useProjectActions();

  const assignChatToProject = (
    chatId: string,
    newProjectId: string | undefined,
    currentProjectId: string | undefined
  ) => {
    // Remove from old project if it exists
    if (currentProjectId && projectsState.projects[currentProjectId]) {
      dispatch(removeChatFromProject({ projectId: currentProjectId, chatId }));
    }

    // Add to new project if specified
    if (newProjectId && projectsState.projects[newProjectId]) {
      dispatch(addChatToProject({ projectId: newProjectId, chatId }));
    }

    // Update the chat's projectId field
    dispatch(setProjectForChat({ chatId, projectId: newProjectId }));
  };

  const getProjectNameForChat = (projectId: string | undefined): string | null => {
    if (!projectId) return null;
    const project = projectsState.projects[projectId];
    return project?.name ?? null;
  };

  return {
    assignChatToProject,
    getProjectNameForChat,
    handleCreateProject,
    projects: projectsState.projects,
  };
};
