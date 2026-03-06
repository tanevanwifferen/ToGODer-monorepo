import { useDispatch, useSelector } from "react-redux";
import CustomAlert from "@/components/ui/CustomAlert";
import { useProjectActions } from "../useProjectActions";
import {
  addProject,
  deleteProject,
  updateProject,
  setCurrentProject,
} from "../../redux/slices/projectsSlice";

// Mock dependencies
jest.mock("react-redux", () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-123"),
}));

jest.mock("@/components/ui/CustomAlert", () => ({
  __esModule: true,
  default: {
    alert: jest.fn(),
  },
}));

describe("useProjectActions", () => {
  const mockDispatch = jest.fn();
  const mockUseDispatch = useDispatch as unknown as jest.Mock;
  const mockUseSelector = useSelector as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDispatch.mockReturnValue(mockDispatch);
    mockUseSelector.mockReturnValue({
      projects: {
        "project-1": {
          id: "project-1",
          name: "Test Project",
          chatIds: ["chat-1", "chat-2"],
          createdAt: 1234567890,
          updatedAt: 1234567890,
        },
      },
      currentProjectId: null,
    });
  });

  describe("handleCreateProject", () => {
    it("should dispatch addProject with new project data", () => {
      const { handleCreateProject } = useProjectActions();

      const projectId = handleCreateProject("My New Project");

      expect(mockDispatch).toHaveBeenCalledWith(
        addProject({
          id: "mock-uuid-123",
          name: "My New Project",
          chatIds: [],
        })
      );
      expect(projectId).toBe("mock-uuid-123");
    });

    it("should return the new project id", () => {
      const { handleCreateProject } = useProjectActions();

      const projectId = handleCreateProject("Another Project");

      expect(projectId).toBe("mock-uuid-123");
    });
  });

  describe("handleDeleteProject", () => {
    it("should show confirmation alert with project name", () => {
      const { handleDeleteProject } = useProjectActions();

      handleDeleteProject("project-1");

      expect(CustomAlert.alert).toHaveBeenCalledWith(
        "Delete Project",
        'Are you sure you want to delete "Test Project"? Chats will be moved to Uncategorized.',
        expect.arrayContaining([
          expect.objectContaining({ text: "Cancel", style: "cancel" }),
          expect.objectContaining({ text: "Delete", style: "destructive" }),
        ])
      );
    });

    it("should dispatch deleteProject when confirmed", () => {
      const { handleDeleteProject } = useProjectActions();

      handleDeleteProject("project-1");

      // Get the alert buttons and find the Delete button
      const alertButtons = (CustomAlert.alert as jest.Mock).mock.calls[0][2];
      const deleteButton = alertButtons.find(
        (btn: any) => btn.text === "Delete"
      );

      deleteButton.onPress();

      expect(mockDispatch).toHaveBeenCalledWith(deleteProject("project-1"));
    });

    it("should handle unknown project gracefully", () => {
      const { handleDeleteProject } = useProjectActions();

      handleDeleteProject("unknown-project");

      expect(CustomAlert.alert).toHaveBeenCalledWith(
        "Delete Project",
        'Are you sure you want to delete "this project"? Chats will be moved to Uncategorized.',
        expect.any(Array)
      );
    });
  });

  describe("handleRenameProject", () => {
    it("should dispatch updateProject with new name", () => {
      const { handleRenameProject } = useProjectActions();

      handleRenameProject("project-1", "Renamed Project");

      expect(mockDispatch).toHaveBeenCalledWith(
        updateProject({
          id: "project-1",
          updates: { name: "Renamed Project" },
        })
      );
    });
  });

  describe("handleSelectProject", () => {
    it("should dispatch setCurrentProject with project id", () => {
      const { handleSelectProject } = useProjectActions();

      handleSelectProject("project-1");

      expect(mockDispatch).toHaveBeenCalledWith(setCurrentProject("project-1"));
    });

    it("should dispatch setCurrentProject with null to deselect", () => {
      const { handleSelectProject } = useProjectActions();

      handleSelectProject(null);

      expect(mockDispatch).toHaveBeenCalledWith(setCurrentProject(null));
    });
  });
});
