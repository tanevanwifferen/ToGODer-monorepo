import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import {
  addProject,
  deleteProject,
  updateProject,
  setCurrentProject,
  selectProjects,
} from "../redux/slices/projectsSlice";
import CustomAlert from "../components/ui/CustomAlert";

export const useProjectActions = () => {
  const dispatch = useDispatch();
  const projectsState = useSelector(selectProjects);

  const handleCreateProject = (name: string) => {
    const newProjectId = uuidv4();
    dispatch(
      addProject({
        id: newProjectId,
        name,
        chatIds: [],
      })
    );
    return newProjectId;
  };

  const handleDeleteProject = (projectId: string) => {
    const project = projectsState.projects[projectId];
    const projectName = project?.name || "this project";

    CustomAlert.alert(
      "Delete Project",
      `Are you sure you want to delete "${projectName}"? Chats will be moved to Uncategorized.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            dispatch(deleteProject(projectId));
          },
        },
      ]
    );
  };

  const handleRenameProject = (projectId: string, newName: string) => {
    dispatch(
      updateProject({
        id: projectId,
        updates: { name: newName },
      })
    );
  };

  const handleSelectProject = (projectId: string | null) => {
    dispatch(setCurrentProject(projectId));
  };

  return {
    handleCreateProject,
    handleDeleteProject,
    handleRenameProject,
    handleSelectProject,
  };
};
