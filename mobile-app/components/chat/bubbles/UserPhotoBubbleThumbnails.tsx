import { HorizontalChatPhotoStrip } from "@/components/chat/media/HorizontalChatPhotoStrip";

type Props = {
  uris: string[];
  userBubbleText: string;
  secondarySurface: string;
  borderColor: string;
  isSending?: boolean;
  onOpenAt?: (index: number) => void;
};

export function UserPhotoBubbleThumbnails({
  uris,
  userBubbleText,
  secondarySurface,
  borderColor,
  isSending = false,
  onOpenAt,
}: Props) {
  return (
    <HorizontalChatPhotoStrip
      uris={uris}
      userBubbleText={userBubbleText}
      secondarySurface={secondarySurface}
      borderColor={borderColor}
      isSending={isSending}
      onOpenAt={onOpenAt}
    />
  );
}
