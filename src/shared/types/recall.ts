export type Screenshot = {
  id: string;
  title: string;
  source: string;
  time: string;
  accent: string;
  icon: string;
  uri?: string;
  createdAt?: number;
  modifiedAt?: number;
  size?: number;
  width?: number;
  height?: number;
};

export type Collection = {
  id: string;
  name: string;
  count: number;
  icon: string;
  color: string;
};

export type EfficiencyMetric = {
  id: string;
  label: string;
  detail: string;
  value: string;
  color: string;
};

export type ChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
};
