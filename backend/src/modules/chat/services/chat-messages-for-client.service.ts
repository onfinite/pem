import { Injectable } from '@nestjs/common';

import type { MessageRow } from '@/database/schemas/index';
import { ChatMessageSignedMediaService } from '@/modules/chat/services/chat-message-signed-media.service';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class ChatMessagesForClientService {
  constructor(
    private readonly chat: ChatService,
    private readonly signedMedia: ChatMessageSignedMediaService,
  ) {}

  async serializeListWithMediaAndLinks(
    userId: string,
    messages: MessageRow[],
  ): Promise<ReturnType<ChatService['serializeMessage']>[]> {
    const linkMap = await this.chat.getLinkPreviewsByMessageIds(
      userId,
      messages.map((m) => m.id),
    );
    return Promise.all(
      messages.map(async (m) => {
        const s = this.chat.serializeMessage(m);
        await this.signedMedia.hydrateForClient(s, m);
        const lp = linkMap.get(m.id);
        if (lp?.length) s.link_previews = lp;
        return s;
      }),
    );
  }

  async serializeOneWithMediaAndLinks(
    userId: string,
    row: MessageRow,
  ): Promise<ReturnType<ChatService['serializeMessage']>> {
    const serialized = this.chat.serializeMessage(row);
    await this.signedMedia.hydrateForClient(serialized, row);
    const linkMap = await this.chat.getLinkPreviewsByMessageIds(userId, [
      row.id,
    ]);
    const lp = linkMap.get(row.id);
    if (lp?.length) serialized.link_previews = lp;
    return serialized;
  }
}
