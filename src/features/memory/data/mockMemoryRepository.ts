import { colors } from "../../../shared/theme/colors";
import type { ChatMessage, Collection, EfficiencyMetric, Screenshot } from "../../../shared/types/recall";
import type { MemoryRepository } from "../domain/memoryRepository";

const screenshots: Screenshot[] = [
  {
    id: "quarterly-report",
    title: "Quarterly Report Graph",
    source: "Finance App",
    time: "2 mins ago",
    accent: colors.primary,
    icon: "chart-line"
  },
  {
    id: "auth-logic",
    title: "Authentication Logic",
    source: "VS Code",
    time: "1 hour ago",
    accent: colors.secondary,
    icon: "code-tags"
  },
  {
    id: "tokyo-flight",
    title: "Flight to Tokyo",
    source: "Chrome",
    time: "3 hours ago",
    accent: colors.tertiary,
    icon: "airplane"
  }
];

const collections: Collection[] = [
  { id: "work", name: "Work", count: 342, icon: "briefcase", color: colors.primary },
  { id: "personal", name: "Personal", count: 812, icon: "heart", color: colors.secondary },
  { id: "travel", name: "Travel", count: 156, icon: "compass", color: colors.tertiary },
  { id: "quotes", name: "Quotes", count: 94, icon: "format-quote-close", color: colors.primary },
  { id: "unsorted", name: "Unsorted", count: 23, icon: "archive-outline", color: colors.muted }
];

const efficiency: EfficiencyMetric[] = [
  { id: "ocr", label: "OCR Processing", detail: "Scanning text in screenshots", value: "98%", color: colors.primary },
  { id: "object-recognition", label: "Object Recognition", detail: "Identifying visual elements", value: "84%", color: colors.secondary },
  { id: "semantic-tagging", label: "Semantic Tagging", detail: "Natural language indexing", value: "92%", color: colors.tertiary }
];

const chatMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "ai",
    text: "Hi there! I can help you find specific moments, summarize activity, or retrieve data from your screenshots."
  },
  { id: "wifi-request", role: "user", text: "Find the screenshot of the wifi password I took last week." },
  {
    id: "wifi-response",
    role: "ai",
    text: 'I found 1 relevant screenshot from last Wednesday at 4:12 PM. The network name is "Cyber_Hub_5G" and the password is "quantum-logic-99".'
  },
  { id: "receipt-request", role: "user", text: "Summarize the receipts from yesterday." }
];

export class MockMemoryRepository implements MemoryRepository {
  async getRecentScreenshots() {
    return screenshots;
  }

  async getCollections() {
    return collections;
  }

  async getEfficiencyMetrics() {
    return efficiency;
  }

  async getChatMessages() {
    return chatMessages;
  }
}
