import type { ApiExtract, ApiList } from "@/services/api/pemApi";

export type UndoItem = {
  id: string;
  text: string;
};

export type TaskDrawerHandle = {
  open: () => void;
  close: () => void;
  refresh: () => void;
};

export type TaskEditSheetProps = {
  visible: boolean;
  extract: ApiExtract | null;
  lists: ApiList[];
  onClose: () => void;
  onSave: (id: string, patch: Record<string, unknown>) => void;
  onCloseTask: (id: string) => void;
};
