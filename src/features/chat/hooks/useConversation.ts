import { useCallback, useRef, useState } from "react";

import { searchService } from "../../search/services/searchService";
import { describeAnswer, suggestQueryCorrection, type ConversationMessage } from "../domain/conversation";

/** Enough to answer with, few enough to scroll past. */
const ANSWER_LIMIT = 6;

/**
 * The ask-your-library conversation, answered by the same on-device index the search screen uses.
 *
 * Deliberately not a react-query cache: a transcript is an append-only log of what was asked and
 * what came back at the time, so re-running an earlier question would rewrite history. It also
 * lives only as long as the screen — nothing about what was asked is written to disk.
 */
export function useConversation() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isAnswering, setAnswering] = useState(false);
  // Monotonic, so two questions asked inside the same millisecond still get distinct keys.
  const turnRef = useRef(0);

  const runSearch = useCallback(async (query: string, turn: number) => {
    setAnswering(true);
    try {
      const { hits } = await searchService.search({ query, limit: ANSWER_LIMIT });
      setMessages((current) => [...current, { id: `ai-${turn}`, role: "ai", text: describeAnswer(query, hits), hits }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: `ai-${turn}`, role: "ai",
        text: `That search could not run: ${error instanceof Error ? error.message : "the index is unavailable"}.`
      }]);
    } finally {
      setAnswering(false);
    }
  }, []);

  const ask = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) return;

    const turn = (turnRef.current += 1);
    setMessages((current) => [...current, { id: `user-${turn}`, role: "user", text: query }]);
    const correction = suggestQueryCorrection(query);
    if (correction) {
      setMessages((current) => [...current, {
        id: `clarify-${turn}`,
        role: "ai",
        text: "Which search did you mean?",
        choices: [
          { label: correction, query: correction },
          { label: `Search exactly: “${query}”`, query }
        ]
      }]);
      return;
    }
    await runSearch(query, turn);
  }, [runSearch]);

  const chooseClarification = useCallback((messageId: string, query: string) => {
    const turn = (turnRef.current += 1);
    setMessages((current) => current.map((message) =>
      message.id === messageId ? { ...message, text: `Searching for “${query}”`, choices: undefined } : message
    ));
    void runSearch(query, turn);
  }, [runSearch]);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isAnswering, ask, chooseClarification, clear };
}
