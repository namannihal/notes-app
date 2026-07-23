import { create } from 'zustand';

const TREE_KEY = 'sthir-tree-collapsed';

interface AppState {
  selectedStackId: string | null;
  selectedNotebookId: string | null;
  selectedNoteId: string | null;
  /** Sidebar (stacks/notebooks tree) collapsed on wide screens. */
  treeCollapsed: boolean;
  /** Mobile/narrow navigation pane. */
  mobilePane: 'tree' | 'list' | 'editor';
  selectStack: (id: string | null) => void;
  selectNotebook: (id: string | null) => void;
  selectNote: (id: string | null) => void;
  setMobilePane: (pane: 'tree' | 'list' | 'editor') => void;
  toggleTree: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedStackId: null,
  selectedNotebookId: null,
  selectedNoteId: null,
  treeCollapsed: localStorage.getItem(TREE_KEY) === 'true',
  mobilePane: 'tree',
  selectStack: (id) => set({ selectedStackId: id }),
  selectNotebook: (id) =>
    set({ selectedNotebookId: id, selectedNoteId: null, mobilePane: 'list' }),
  selectNote: (id) => set({ selectedNoteId: id, mobilePane: 'editor' }),
  setMobilePane: (mobilePane) => set({ mobilePane }),
  toggleTree: () =>
    set((s) => {
      const treeCollapsed = !s.treeCollapsed;
      localStorage.setItem(TREE_KEY, String(treeCollapsed));
      return { treeCollapsed };
    }),
}));
