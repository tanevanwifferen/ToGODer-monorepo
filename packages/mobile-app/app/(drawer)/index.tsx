import { useSelector } from "react-redux";
import { ChatList } from "../../components/ChatList";
import { Landing } from "../../components/Landing";
import { selectAllChatsIncludingDeleted } from "../../redux/slices/chatSelectors";

export default function HomeScreen() {
  const allChats = useSelector(selectAllChatsIncludingDeleted);
  const hasChats = allChats && Object.keys(allChats).length > 0;

  if (hasChats) {
    return <ChatList />;
  }

  return <Landing />;
}
