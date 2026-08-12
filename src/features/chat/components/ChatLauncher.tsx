import React, { createContext, useContext } from "react";

/**
 * Opens the AI conversation from anywhere inside the tab navigator.
 *
 * A context rather than a prop because the modal's state lives in the navigation shell while the
 * screens that launch it are mounted by the tab navigator, which passes no props of its own.
 * Threading it through as a render prop would give every screen a new component identity on each
 * shell re-render, remounting the tab whenever the side menu opened.
 */
const ChatLauncherContext = createContext<() => void>(() => {});

type ChatLauncherProviderProps = {
  openChat: () => void;
  children: React.ReactNode;
};

export function ChatLauncherProvider({ openChat, children }: ChatLauncherProviderProps) {
  return <ChatLauncherContext.Provider value={openChat}>{children}</ChatLauncherContext.Provider>;
}

export function useChatLauncher() {
  return useContext(ChatLauncherContext);
}
