import { router } from "expo-router";
import PrepHubCard from "./PrepHubCard";
import type { Prep } from "./homePrepData";

type Props = {
  prep: Prep;
  resolved: "light" | "dark";
};

export default function HomeReadyPrepCard({ prep, resolved }: Props) {
  const open = () => router.push(`/prep/${prep.id}`);

  return (
    <PrepHubCard prep={prep} resolved={resolved} onOpenDetail={open} />
  );
}
