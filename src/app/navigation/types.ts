/**
 * The five destinations that keep state while the app is open. Everything else — the library,
 * the viewer, the category picker, and the AI conversation — is a modal, because the project has
 * no stack navigator to push onto.
 */
export type RootTabParamList = {
  Home: undefined;
  Search: undefined;
  Categories: undefined;
  Stats: undefined;
  Settings: undefined;
};
