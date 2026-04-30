import { useCallback, useRef, useState } from "react";
import { searchMessages, type ApiMessage } from "@/services/api/pemApi";

const DEBOUNCE_MS = 350;

export function useMessageSearch(
  getToken: () => Promise<string | null>,
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setActiveIndex(-1);
      setHighlightId(null);
      clearTimeout(timerRef.current);

      if (!text.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      timerRef.current = setTimeout(async () => {
        try {
          const res = await searchMessages(getToken, text.trim());
          setResults(res.messages);
          if (res.messages.length > 0) {
            setActiveIndex(0);
            setHighlightId(res.messages[0].id);
          }
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, DEBOUNCE_MS);
    },
    [getToken],
  );

  const handlePrev = useCallback(() => {
    if (results.length === 0) return;
    const next = activeIndex >= results.length - 1 ? 0 : activeIndex + 1;
    setActiveIndex(next);
    setHighlightId(results[next].id);
  }, [results, activeIndex]);

  const handleNext = useCallback(() => {
    if (results.length === 0) return;
    const next = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
    setActiveIndex(next);
    setHighlightId(results[next].id);
  }, [results, activeIndex]);

  const handleOpen = useCallback(() => setIsOpen(true), []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setIsSearching(false);
    setActiveIndex(-1);
    setHighlightId(null);
    clearTimeout(timerRef.current);
  }, []);

  const clearHighlight = useCallback(() => setHighlightId(null), []);

  return {
    query,
    results,
    isSearching,
    isOpen,
    activeIndex,
    highlightId,
    handleQueryChange,
    handlePrev,
    handleNext,
    handleOpen,
    handleClose,
    clearHighlight,
  };
}
