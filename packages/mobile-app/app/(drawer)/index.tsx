import { useSelector } from "react-redux";
import { ChatList } from "../../components/ChatList";
import { Landing } from "../../components/Landing";
import { UnauthenticatedBanner } from "../../components/UnauthenticatedBanner";
import { selectAllChatsIncludingDeleted } from "../../redux/slices/chatSelectors";

export default function HomeScreen() {
  const allChats = useSelector(selectAllChatsIncludingDeleted);
  const hasChats = allChats && Object.keys(allChats).length > 0;

  return (
    <>
      <UnauthenticatedBanner />
      {hasChats ? <ChatList /> : <Landing />}
    </>
  );
}
