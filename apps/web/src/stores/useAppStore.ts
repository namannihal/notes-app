import { create } from 'zustand';

const TREE_KEY = 'sthir-tree-collapsed';
const LIST_KEY = 'sthir-list-collapsed';
const SORT_KEY = 'sthir-note-sort';

export type NoteSort = 'updated' | 'created' | 'title' | 'manual';

interface AppState {
  selectedStackId: string | null;
  selectedNotebookId: string | null;
  selectedNoteId: string | null;
  /** Sidebar (stacks/notebooks tree) collapsed on wide screens. */
  treeCollapsed: boolean;
  /** Note-list pane collapsed on wide screens. */
  listCollapsed: boolean;
  /** Note-list sort mode. */
  noteSort: NoteSort;
  /** When set, the note list shows all notes carrying this tag. */
  tagFilter: string | null;
  /** Mobile/narrow navigation pane. */
  mobilePane: 'tree' | 'list' | 'editor';
  selectStack: (id: string | null) => void;
  selectNotebook: (id: string | null) => void;
  selectNote: (id: string | null) => void;
  setMobilePane: (pane: 'tree' | 'list' | 'editor') => void;
  toggleTree: () => void;
  toggleList: () => void;
  setNoteSort: (sort: NoteSort) => void;
  setTagFilter: (tag: string | null) => void;
}

function initialSort(): NoteSort {
  const s = typeof localStorage !== 'undefined' ? localStorage.getItem(SORT_KEY) : null;
  return s === 'created' || s === 'title' || s === 'manual' ? s : 'updated';
}

export const useAppStore = create<AppState>((set) => ({
  selectedStackId: null,
  selectedNotebookId: null,
  selectedNoteId: null,
  treeCollapsed: typeof localStorage !== 'undefined' && localStorage.getItem(TREE_KEY) === 'true',
  listCollapsed: typeof localStorage !== 'undefined' && localStorage.getItem(LIST_KEY) === 'true',
  noteSort: initialSort(),
  tagFilter: null,
  mobilePane: 'tree',
  selectStack: (id) => set({ selectedStackId: id }),
  selectNotebook: (id) =>
    set({ selectedNotebookId: id, selectedNoteId: null, mobilePane: 'list', tagFilter: null }),
  selectNote: (id) => set({ selectedNoteId: id, mobilePane: 'editor' }),
  setMobilePane: (mobilePane) => set({ mobilePane }),
  toggleTree: () =>
    set((s) => {
      const treeCollapsed = !s.treeCollapsed;
      localStorage.setItem(TREE_KEY, String(treeCollapsed));
      return { treeCollapsed };
    }),
  toggleList: () =>
    set((s) => {
      const listCollapsed = !s.listCollapsed;
      localStorage.setItem(LIST_KEY, String(listCollapsed));
      return { listCollapsed };
    }),
  setNoteSort: (noteSort) => {
    localStorage.setItem(SORT_KEY, noteSort);
    set({ noteSort });
  },
  setTagFilter: (tagFilter) => set({ tagFilter, mobilePane: 'list' }),
}));
